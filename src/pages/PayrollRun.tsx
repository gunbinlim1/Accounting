import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock, FileSpreadsheet, Info, Lock, MessageSquareWarning, OctagonAlert, Printer, RotateCcw, Search, Send, TriangleAlert, Undo2,
} from 'lucide-react'
import { Fragment, useMemo, useState, type KeyboardEvent } from 'react'
import CheckList from '../components/CheckList'
import FringeEditor from '../components/FringeEditor'
import ImportDialog from '../components/ImportDialog'
import PaymentsTable from '../components/PaymentsTable'
import PayStub from '../components/PayStub'
import PayrollReview from '../components/PayrollReview'
import { StatusBadge, StatusTimeline } from '../components/RunStatus'
import { companySchedule, payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { defaultTimeFor, receivesTips } from '../config/industries'
import type { Check as CheckItem } from '../lib/checks'
import { formatCurrency, formatCurrencyWhole, formatDate, initials } from '../lib/format'
import { jobLabel } from '../lib/labels'
import { baseRateForEntry, effectiveEmployee, sumResults, tippedOvertimeRate } from '../lib/payroll'
import { cashOutOf, timeLeft } from '../lib/runStatus'
import { parseISODate, previousPayDate } from '../lib/schedule'
import { useChecks } from '../lib/useChecks'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Employee, TimeEntry } from '../types'
import { compareByName, fullName } from '../lib/names'

const PERIODS = periodsPerYear[companySchedule.frequency]

/** 표 안의 숫자 입력 — Enter/↑/↓로 같은 열의 위아래 칸으로 이동 */
function CellInput({ value, onChange, money, row, col, label, disabled }: {
  value: number; onChange: (v: number) => void; money?: boolean; row: number; col: number | string; label: string; disabled?: boolean
}) {
  const move = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir = e.key === 'ArrowDown' || e.key === 'Enter' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + dir}-${col}"]`)
    next?.focus()
    next?.select()
  }
  if (disabled) return <span className="cell-empty">—</span>
  return (
    <span className={`cell-input${money ? ' money' : ''}`}>
      {money && <span aria-hidden>$</span>}
      <input
        type="number" inputMode="decimal" min={0} step={money ? '0.01' : '0.25'}
        value={value === 0 ? '' : value} placeholder="0" aria-label={label} data-cell={`${row}-${col}`}
        onFocus={(e) => e.target.select()} onKeyDown={move}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </span>
  )
}

/** 이번 회차 시급(또는 연봉 직원의 회당 급여) 입력. 연봉 직원은 연봉을 계산해 보여 줌 */
function RateInputCell({ e, entry, row, onChange, onSaveDefault }: {
  e: Employee; entry?: TimeEntry; row: number; onChange: (rate: number | undefined) => void; onSaveDefault: () => void
}) {
  const { t } = usePrefs()
  const salary = e.payType === 'salary'
  const base = baseRateForEntry(e, companySchedule.frequency)
  const value = entry?.rate ?? base
  const changed = entry?.rate !== undefined && Math.abs(entry.rate - base) > 0.004
  const sub = salary
    ? t(`연봉 ${formatCurrencyWhole(value * PERIODS)}`, `${formatCurrencyWhole(value * PERIODS)} / yr`)
    : e.payType === 'tipped'
      ? t(`+ 팁 · OT ${formatCurrency(tippedOvertimeRate(value))}`, `+ tips · OT ${formatCurrency(tippedOvertimeRate(value))}`)
      : `OT ${formatCurrency(value * cfg.overtimeMultiplier)}`
  return (
    <td className="num rate-cell editable" data-label={salary ? t('회당 급여', 'Per check') : t('시급', 'Hourly rate')}>
      <span className={`rate-edit${changed ? ' changed' : ''}`}>
        <span aria-hidden>$</span>
        <input
          type="number" inputMode="decimal" min={0} step="0.01" value={value}
          aria-label={`${fullName(e)} ${salary ? t('회당 급여', 'pay per check') : t('시급', 'hourly rate')}`}
          data-cell={`${row}-rate`}
          onFocus={(ev) => ev.target.select()}
          onKeyDown={(ev) => {
            const dir = ev.key === 'ArrowDown' || ev.key === 'Enter' ? 1 : ev.key === 'ArrowUp' ? -1 : 0
            if (!dir) return
            ev.preventDefault()
            const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + dir}-rate"]`)
            next?.focus()
            next?.select()
          }}
          onChange={(ev) => {
            const v = Math.max(0, Number(ev.target.value) || 0)
            onChange(Math.abs(v - base) < 0.005 ? undefined : v)
          }}
        />
        <small>{salary ? t('/회', '/check') : '/h'}</small>
      </span>
      <span className="rate-sub">{sub}</span>
      {changed && (
        <span className="rate-changed">
          {t('기본', 'Default')} {formatCurrency(base)}
          <button type="button" onClick={() => onChange(undefined)}>{t('되돌리기', 'Reset')}</button>
          <button type="button" onClick={onSaveDefault}>{t('기본값으로 저장', 'Save as default')}</button>
        </span>
      )}
    </td>
  )
}

const sevIcon = {
  critical: <OctagonAlert size={15} aria-hidden />,
  warning: <TriangleAlert size={15} aria-hidden />,
  info: <Info size={15} aria-hidden />,
}

export default function PayrollRun() {
  const { t, lang, locale } = usePrefs()
  const { session } = usePortal()
  const store = useStore()
  const { employees, time, setTime, results, payDate, lastRun, upsertEmployee, status, locked, current, deadline, view, company } = store
  const checks = useChecks()
  const [step, setStep] = useState<1 | 2>(1)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [now] = useState(() => new Date())
  const me = session?.name ?? company.ownerName
  /** 팁 기능을 쓰는 회사이거나, 이번 회차에 팁이 이미 입력된 경우 팁 칸을 보여 줌 */
  const tipsOn = company.tipsEnabled || employees.some((e) => e.active && ((time[e.id]?.cashTips ?? 0) + (time[e.id]?.cardTips ?? 0) > 0))

  const active = employees.filter((e) => e.active)
  const pay = parseISODate(payDate)
  const periodStart = previousPayDate(companySchedule.frequency, pay)
  const due = timeLeft(deadline, now, t)
  const totals = sumResults(results)
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const resultOf = (id: string) => results.find((r) => r.employeeId === id)!
  const eff = (e: Employee) => effectiveEmployee(e, time[e.id], companySchedule.frequency)
  const saveRateAsDefault = (e: Employee) => {
    upsertEmployee({ ...e, rate: eff(e).rate }, me)
    setTime(e.id, { rate: undefined })
  }

  const checksByEmployee = useMemo(() => {
    const m = new Map<string, CheckItem[]>()
    for (const c of checks) if (c.employeeId) m.set(c.employeeId, [...(m.get(c.employeeId) ?? []), c])
    return m
  }, [checks])

  // 시급·팁 직원 먼저, 연봉 직원은 아래
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...active]
      .sort((a, b) => Number(a.payType === 'salary') - Number(b.payType === 'salary') || compareByName(a, b))
      .filter((e) => !q || `${fullName(e)} ${jobLabel(e, t)}`.toLowerCase().includes(q))
  }, [active, query, t])

  const applyAll = (fn: (e: Employee) => TimeEntry | undefined) => {
    for (const e of active) {
      if (e.payType === 'salary') continue
      const next = fn(e)
      if (next) setTime(e.id, next)
    }
  }

  const header = (
    <header className="run-head">
      <div>
        <p className="eyebrow">{company.dba} · {t('정기 급여', 'Regular payroll')}</p>
        <h1>{t('급여 실행', 'Run payroll')} <StatusBadge status={status} /></h1>
        <div className="run-meta">
          <span>
            <CalendarDays size={15} aria-hidden /> {t('급여 기간', 'Pay period')}{' '}
            <strong>{formatDate(periodStart, locale, { month: 'short', day: 'numeric' })} – {formatDate(pay, locale, { month: 'short', day: 'numeric' })}</strong>
          </span>
          <span>{t('지급일', 'Pay date')} <strong>{formatDate(pay, locale)}</strong></span>
          {!locked && (
            <span className={due.overdue || due.urgent ? 'urgent' : ''}>
              <Clock size={15} aria-hidden /> {t('제출 마감', 'Submit by')}{' '}
              <strong>{formatDate(deadline, locale, { month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</strong> · {due.text}
            </span>
          )}
        </div>
      </div>
      {!locked && (
        <ol className="run-steps" aria-label={t('진행 단계', 'Progress')}>
          {[t('근무·팁 입력', 'Hours & tips'), t('검토 및 제출', 'Review & submit')].map((label, i) => {
            const n = (i + 1) as 1 | 2
            return (
              <li key={label} className={n === step ? 'current' : n < step ? 'done' : ''}>
                <button type="button" disabled={n > step} onClick={() => n < step && setStep(n)}>
                  <span className="dot">{n < step ? <Check size={12} /> : n}</span>
                  {label}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </header>
  )

  const firmNote = status === 'changes_requested' && current.note && (
    <div className="firm-note">
      <MessageSquareWarning size={20} aria-hidden />
      <div>
        <strong>{t('회계법인 수정 요청', 'Changes requested by your CPA')}</strong>
        <p>{current.note}</p>
      </div>
    </div>
  )

  /* ───────── 제출 후 (잠김) ───────── */
  if (locked) {
    const s = sumResults(view.results)
    return (
      <div className="page run-page">
        {header}
        <section className="card status-card">
          <StatusTimeline status={status} submittedAt={current.submittedAt} />
          {justSubmitted && status === 'submitted' && (
            <div className="banner">
              <Check size={18} aria-hidden />
              {t('제출 완료! 회계법인이 검토를 시작하면 이 화면과 홈에서 알려 드려요.', 'Submitted! You’ll see updates here and on Home as your CPA reviews it.')}
            </div>
          )}
          <p className="status-msg">
            <Lock size={16} aria-hidden />
            {status === 'processed'
              ? t(`처리 완료 — ${formatDate(pay, locale)}에 ${view.results.length}명에게 ${formatCurrency(s.net)}이 입금됩니다.`, `Processed — ${formatCurrency(s.net)} goes to ${view.results.length} people on ${formatDate(pay, locale)}.`)
              : status === 'in_review'
                ? t('회계법인이 검토 중이라 수정할 수 없어요. 고칠 내용이 있으면 회계법인에 연락해 주세요.', 'Your CPA is reviewing this run, so it’s locked. Contact them for changes.')
                : t('제출되어 잠겨 있어요. 회계법인이 검토를 시작하기 전까지는 제출을 취소하고 고칠 수 있어요.', 'Submitted and locked. You can recall it to edit until your CPA starts reviewing.')}
          </p>
        </section>

        {status === 'processed' && store.approvedForPayDate?.payments && (
          <PaymentsTable payments={store.approvedForPayDate.payments} employees={view.employees} payDate={payDate} />
        )}

        <PayrollReview view={view} checks={checks} />

        {status === 'processed' && (
          <section className="print-stubs">
            {view.results.map((r) => {
              const e = view.employees.find((x) => x.id === r.employeeId)!
              return (
                <div key={r.employeeId} className="print-stub">
                  <h2>{fullName(e)} · {formatDate(pay, locale)}</h2>
                  <PayStub employee={e} result={r} time={view.time[e.id]} />
                </div>
              )
            })}
          </section>
        )}

        <div className="action-bar">
          <div className="action-bar-inner">
            {status === 'submitted' && (
              <button className="btn" onClick={() => { store.recallRun(me); setStep(1); setJustSubmitted(false) }}>
                <Undo2 size={18} aria-hidden /> {t('제출 취소하고 수정', 'Recall to edit')}
              </button>
            )}
            <div className="action-total">
              <span className="muted small">{t('회사 총 출금액', 'Total cash out')}</span>
              <strong>{formatCurrency(cashOutOf(view.results))}</strong>
            </div>
            {status === 'processed' && (
              <button className="btn primary lg" onClick={() => window.print()}>
                <Printer size={18} aria-hidden /> {t('급여명세서 인쇄', 'Print pay stubs')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ───────── 1단계: 근무·팁 입력 ───────── */
  if (step === 1) {
    const inputRow = new Map(rows.filter((e) => e.payType !== 'salary').map((e, i) => [e.id, i]))
    return (
      <div className="page run-page">
        {header}
        {firmNote}

        <section className="card table-card">
          <div className="table-toolbar">
            <div className="search compact">
              <Search size={15} aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('직원 검색', 'Search people')} />
            </div>
            <div className="toolbar-actions">
              <button className="btn sm import-btn" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet size={15} aria-hidden /> {t('엑셀·CSV 가져오기', 'Import Excel/CSV')}
              </button>
              <span className="muted small">{t('모두 적용:', 'Apply to all:')}</span>
              {lastRun && <button className="chip" onClick={() => applyAll((e) => lastRun.time[e.id])}>{t('지난번과 동일', 'Same as last')}</button>}
              <button className="chip" onClick={() => applyAll((e) => defaultTimeFor(e.role, tipsOn))}>{t('직무 기본값', 'Role defaults')}</button>
              <button className="chip" onClick={() => applyAll(() => ({ regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }))}>
                <RotateCcw size={13} aria-hidden /> {t('비우기', 'Clear')}
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="run-table">
              <thead>
                <tr>
                  <th>{t('직원', 'Employee')}</th>
                  <th className="num">{t('시급 / 회당 급여', 'Rate / per check')}</th>
                  <th className="num">{t('정규 시간', 'Regular hrs')}</th>
                  <th className="num">{t('OT 시간', 'OT hrs')}</th>
                  {tipsOn && <th className="num">{t('현금 팁', 'Cash tips')}</th>}
                  {tipsOn && <th className="num">{t('카드 팁', 'Card tips')}</th>}
                  <th className="num">Fringe</th>
                  <th className="num">{t('총급여', 'Gross pay')}</th>
                  <th aria-label={t('상세', 'Details')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const r = resultOf(e.id)
                  const h = time[e.id] ?? { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }
                  const salary = e.payType === 'salary'
                  const tips = !salary && (receivesTips(e.role, tipsOn) || h.cashTips + h.cardTips > 0)
                  const issues = checksByEmployee.get(e.id) ?? []
                  const worst = issues[0]?.severity
                  const isOpen = open === e.id
                  const ri = inputRow.get(e.id) ?? -1
                  return (
                    <Fragment key={e.id}>
                      <tr className={isOpen ? 'open' : ''}>
                        <td data-label={t('직원', 'Employee')}>
                          <div className="emp-cell">
                            <span className="avatar sm">{initials(fullName(e))}</span>
                            <div>
                              <strong>
                                {fullName(e)}
                                {worst && worst !== 'info' && <span className={`flag ${worst}`} title={lang === 'ko' ? issues[0].ko : issues[0].en}>{sevIcon[worst]}</span>}
                              </strong>
                              <span className="muted small">{jobLabel(e, t)}</span>
                            </div>
                          </div>
                        </td>
                        <RateInputCell e={e} entry={time[e.id]} row={rows.indexOf(e)} onChange={(rate) => setTime(e.id, { rate })} onSaveDefault={() => saveRateAsDefault(e)} />
                        <td className="num" data-label={t('정규 시간', 'Regular hrs')}>
                          <CellInput row={ri} col={0} disabled={salary} label={`${fullName(e)} ${t('정규 시간', 'regular hours')}`} value={h.regular} onChange={(v) => setTime(e.id, { regular: v })} />
                        </td>
                        <td className="num" data-label={t('OT 시간', 'OT hrs')}>
                          <CellInput row={ri} col={1} disabled={salary} label={`${fullName(e)} OT`} value={h.overtime} onChange={(v) => setTime(e.id, { overtime: v })} />
                        </td>
                        {tipsOn && <td className="num" data-label={t('현금 팁', 'Cash tips')}>
                          <CellInput row={ri} col={2} money disabled={!tips} label={`${fullName(e)} ${t('현금 팁', 'cash tips')}`} value={h.cashTips} onChange={(v) => setTime(e.id, { cashTips: v })} />
                        </td>}
                        {tipsOn && <td className="num" data-label={t('카드 팁', 'Card tips')}>
                          <CellInput row={ri} col={3} money disabled={!tips} label={`${fullName(e)} ${t('카드 팁', 'card tips')}`} value={h.cardTips} onChange={(v) => setTime(e.id, { cardTips: v })} />
                        </td>}
                        <td className="num fringe-cell" data-label="Fringe">
                          <button type="button" className={`chip${r.fringeTotal ? ' on' : ''}`} onClick={() => setOpen(e.id)}>
                            {r.fringeTotal ? formatCurrency(r.fringeTotal) : t('+ 추가', '+ Add')}
                          </button>
                        </td>
                        <td className="num gross-cell" data-label={t('총급여', 'Gross pay')}>
                          <strong>{formatCurrency(r.grossPay)}</strong>
                          {r.tipMakeUp > 0 && <span className="tag warn">+{formatCurrency(r.tipMakeUp)} {t('보전', 'make-up')}</span>}
                        </td>
                        <td className="expand-cell">
                          <button className="icon-only" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} aria-label={t('상세 보기', 'Show details')}>
                            <ChevronDown size={18} className="chev" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={tipsOn ? 9 : 7}>
                            <div className="row-detail">
                              <div className="row-detail-facts">
                                {r.hours > 0 && (
                                  <span>
                                    {tipsOn ? t('팁 포함 시간당', 'Effective rate') : t('시간당 총급여', 'Gross per hour')}{' '}
                                    <strong className={r.grossPay / r.hours < cfg.minimumWage ? 'warn-text' : ''}>{formatCurrency(r.grossPay / r.hours)}</strong>
                                  </span>
                                )}
                                <span>{t('연방 소득세', 'Federal tax')} <strong>{formatCurrency(r.federalWithholding)}</strong></span>
                                <span>FICA <strong>{formatCurrency(r.socialSecurity + r.medicare)}</strong></span>
                                <span>{t('입금액', 'Net pay')} <strong>{formatCurrency(r.netPay)}</strong></span>
                              </div>
                              {issues.length > 0 && <CheckList checks={issues} />}
                              <FringeEditor entries={h.fringes} onChange={(fringes) => setTime(e.id, { fringes })} />
                              {!salary && (
                                <div className="chips">
                                  <button className="chip" onClick={() => setTime(e.id, defaultTimeFor(e.role, tipsOn))}>{t('직무 기본값', 'Role default')}</button>
                                  {lastRun?.time[e.id] && <button className="chip" onClick={() => setTime(e.id, lastRun.time[e.id])}>{t('지난번과 동일', 'Same as last')}</button>}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t(`합계 · ${active.length}명`, `Total · ${active.length} people`)}</td>
                  <td />
                  <td className="num">{active.reduce((a, e) => a + (time[e.id]?.regular ?? 0) * Number(e.payType !== 'salary'), 0)}</td>
                  <td className="num">{active.reduce((a, e) => a + (time[e.id]?.overtime ?? 0) * Number(e.payType !== 'salary'), 0)}</td>
                  {tipsOn && <td className="num">{formatCurrency(totals.cashTips)}</td>}
                  {tipsOn && <td className="num">{formatCurrency(totals.cardTips)}</td>}
                  <td className="num">{formatCurrency(totals.fringe)}</td>
                  <td className="num"><strong>{formatCurrency(totals.gross)}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="table-hint muted small">
            {t('시급·회당 급여는 이번 회차에만 적용되고, "기본값으로 저장"을 누르면 직원 정보에도 반영돼요. Enter 또는 ↑↓ 키로 위아래 칸을 이동할 수 있어요.', 'Rates apply to this run only; "Save as default" updates the employee. Use Enter or ↑↓ to move between rows.')}
          </p>
        </section>

        {importOpen && (
          <ImportDialog
            companyId={company.id}
            employees={employees}
            onClose={() => setImportOpen(false)}
            onApply={(updates) => { updates.forEach((u) => setTime(u.id, u.patch)); setImportOpen(false) }}
          />
        )}

        <div className="action-bar">
          <div className="action-bar-inner">
            <div className="action-total">
              <span className="muted small">{t('총급여 (팁 포함)', 'Gross pay (incl. tips)')}</span>
              <strong>{formatCurrency(totals.gross)}</strong>
            </div>
            <button className="btn primary lg" onClick={() => { setStep(2); window.scrollTo({ top: 0 }) }}>
              {t('검토하기', 'Review')} <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ───────── 2단계: 검토 및 회계법인 제출 ───────── */
  return (
    <div className="page run-page">
      {header}
      {firmNote}
      <PayrollReview view={view} checks={checks} />
      <p className="muted small submit-note">
        <Info size={14} aria-hidden />
        {t(
          `제출하면 ${company.dba}의 이번 회차 자료가 회계법인으로 전달되고 잠깁니다. 회계법인이 검토 후 처리하면 급여명세서가 발행돼요.`,
          `Submitting sends this run to your CPA and locks it. Pay stubs are issued once they process it.`,
        )}
      </p>

      <div className="action-bar">
        <div className="action-bar-inner">
          <button className="btn" onClick={() => setStep(1)}>
            <ArrowLeft size={18} aria-hidden /> {t('수정', 'Edit')}
          </button>
          <div className="action-total">
            <span className="muted small">{t('회사 총 출금액', 'Total cash out')}</span>
            <strong>{formatCurrency(cashOutOf(results))}</strong>
          </div>
          <button
            className="btn primary lg"
            disabled={blocking > 0}
            onClick={() => { store.submitRun(me); setJustSubmitted(true); window.scrollTo({ top: 0 }) }}
          >
            <Send size={18} aria-hidden />
            {blocking > 0 ? t('문제 해결 후 제출', 'Fix issues to submit') : status === 'changes_requested' ? t('회계법인에 다시 제출', 'Resubmit to CPA') : t('회계법인에 제출', 'Submit to CPA')}
          </button>
        </div>
      </div>
    </div>
  )
}
