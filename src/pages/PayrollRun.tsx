import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleCheck, HandCoins, Info, OctagonAlert, PartyPopper, Printer, RotateCcw, Search, TriangleAlert,
} from 'lucide-react'
import { Fragment, useMemo, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import CheckList from '../components/CheckList'
import PayStub from '../components/PayStub'
import { companySchedule, payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { defaultTimeFor, receivesTips } from '../config/restaurantRoles'
import type { Check as CheckItem } from '../lib/checks'
import { formatCurrency, formatCurrencyWhole, formatDate, initials } from '../lib/format'
import { roleLabel } from '../lib/labels'
import { baseRateForEntry, effectiveEmployee, sumResults, tippedOvertimeRate } from '../lib/payroll'
import { daysBetween, parseISODate, previousPayDate } from '../lib/schedule'
import { useChecks } from '../lib/useChecks'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Employee, PayRun, TimeEntry } from '../types'


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
        type="number"
        inputMode="decimal"
        min={0}
        step={money ? '0.01' : '0.25'}
        value={value === 0 ? '' : value}
        placeholder="0"
        aria-label={label}
        data-cell={`${row}-${col}`}
        onFocus={(e) => e.target.select()}
        onKeyDown={move}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </span>
  )
}

const PERIODS = periodsPerYear[companySchedule.frequency]

/** 검토 화면: 이번 회차에 적용된 시급·연봉을 크게 표시. 아래 줄에 실제 근무시간 */
function RateCell({ e, entry }: { e: Employee; entry?: TimeEntry }) {
  const { t } = usePrefs()
  const eff = effectiveEmployee(e, entry, companySchedule.frequency)
  const salary = e.payType === 'salary'
  const changed = entry?.rate !== undefined && eff.rate !== e.rate
  const sub = salary
    ? t(`회당 ${formatCurrency(eff.rate / PERIODS)}`, `${formatCurrency(eff.rate / PERIODS)} per check`)
    : `${(entry?.regular ?? 0) + (entry?.overtime ?? 0)}h${entry?.overtime ? ` · OT ${entry.overtime}h` : ''}${e.payType === 'tipped' ? t(' · + 팁', ' · + tips') : ''}`
  return (
    <td className="num rate-cell" data-label={t('급여 기준', 'Pay rate')}>
      <span className="rate-main">
        {salary ? formatCurrencyWhole(eff.rate) : formatCurrency(eff.rate)}
        <small>{salary ? t('/년', '/yr') : '/h'}</small>
      </span>
      <span className="rate-sub">
        {sub}
        {changed && <span className="tag info">{t('이번 회차 변경', 'Changed this run')}</span>}
      </span>
    </td>
  )
}

/**
 * 입력 화면: 이번 회차 시급(또는 연봉 직원의 회당 급여)을 직접 입력.
 * 연봉 직원은 입력한 회당 금액으로 연봉을 계산해 보여 줌.
 */
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
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          aria-label={`${e.name} ${salary ? t('회당 급여', 'pay per check') : t('시급', 'hourly rate')}`}
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
  const { employees, time, setTime, results, payDate, lastRun, approveRun, approvedForPayDate, upsertEmployee } = useStore()
  const checks = useChecks()
  const [step, setStep] = useState<1 | 2>(1)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  // 넓은 화면에서는 펼치고, 휴대폰에서는 접어서 시작 (차단 문제가 있으면 항상 펼침)
  const [alertsPref, setShowAlerts] = useState<boolean | null>(null)
  const [done, setDone] = useState<PayRun | null>(null)
  const [today] = useState(() => new Date())

  const active = employees.filter((e) => e.active)
  const pay = parseISODate(payDate)
  const periodStart = previousPayDate(companySchedule.frequency, pay)
  const daysLeft = daysBetween(today, pay)
  const totals = sumResults(results)
  const cashOut = totals.net + totals.federalDeposit + totals.pretax + totals.futa + totals.suta
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const resultOf = (id: string) => results.find((r) => r.employeeId === id)!
  const eff = (e: Employee) => effectiveEmployee(e, time[e.id], companySchedule.frequency)
  const saveRateAsDefault = (e: Employee) => {
    upsertEmployee({ ...e, rate: eff(e).rate })
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
      .sort((a, b) => Number(a.payType === 'salary') - Number(b.payType === 'salary'))
      .filter((e) => !q || `${e.name} ${roleLabel(e.role, t)}`.toLowerCase().includes(q))
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
        <p className="eyebrow">{t('정기 급여', 'Regular payroll')} · {t('텍사스', 'Texas')}</p>
        <h1>{t('급여 실행', 'Run payroll')}</h1>
        <div className="run-meta">
          <span>
            <CalendarDays size={15} aria-hidden /> {t('급여 기간', 'Pay period')}{' '}
            <strong>
              {formatDate(periodStart, locale, { month: 'short', day: 'numeric' })} – {formatDate(pay, locale, { month: 'short', day: 'numeric' })}
            </strong>
          </span>
          <span>
            {t('지급일', 'Pay date')} <strong>{formatDate(pay, locale)}</strong>
          </span>
          <span className={daysLeft <= 2 ? 'urgent' : ''}>
            {daysLeft === 0 ? t('오늘 지급', 'Pays today') : t(`${daysLeft}일 남음`, `${daysLeft} days left`)}
          </span>
        </div>
      </div>
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
    </header>
  )

  /* ───────── 완료 ───────── */
  if (done) {
    const s = sumResults(done.results)
    return (
      <div className="page">
        <section className="card success">
          <PartyPopper size={40} className="success-icon" aria-hidden />
          <h1>{t('급여가 제출되었습니다', 'Payroll submitted')}</h1>
          <p className="lead">
            {t(
              `${formatDate(pay, locale)}에 ${done.results.length}명에게 ${formatCurrency(s.net)}이 입금됩니다.`,
              `${done.results.length} people receive ${formatCurrency(s.net)} on ${formatDate(pay, locale)}.`,
            )}
          </p>
          <div className="todo">
            <h2>{t('다음에 할 일', 'Next steps')}</h2>
            <ul>
              <li><Check size={16} aria-hidden /> {t(`EFTPS로 IRS에 ${formatCurrency(s.federalDeposit)} 예치`, `Deposit ${formatCurrency(s.federalDeposit)} to the IRS via EFTPS`)}</li>
              <li><Check size={16} aria-hidden /> {t(`TWC ${formatCurrency(s.suta)} · FUTA ${formatCurrency(s.futa)} 적립`, `Accrue TWC ${formatCurrency(s.suta)} · FUTA ${formatCurrency(s.futa)}`)}</li>
              {s.uncollectedFica > 0 && (
                <li><Check size={16} aria-hidden /> {t(`미징수 FICA ${formatCurrency(s.uncollectedFica)} 기록 (W-2 Box 12 A/B)`, `Record ${formatCurrency(s.uncollectedFica)} uncollected FICA (W-2 Box 12 A/B)`)}</li>
              )}
              <li><Check size={16} aria-hidden /> {t('직원에게 급여명세서 전달', 'Share pay stubs with employees')}</li>
            </ul>
          </div>
          <div className="row gap">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={18} aria-hidden /> {t('급여명세서 인쇄', 'Print pay stubs')}
            </button>
            <Link to="/" className="btn primary">{t('홈으로', 'Back home')}</Link>
          </div>
        </section>
        <section className="print-stubs">
          {done.results.map((r) => {
            const e = employees.find((x) => x.id === r.employeeId)!
            return (
              <div key={r.employeeId} className="print-stub">
                <h2>{e.name} · {formatDate(pay, locale)}</h2>
                <PayStub employee={effectiveEmployee(e, done.time[e.id], companySchedule.frequency)} result={r} time={done.time[e.id]} />
              </div>
            )
          })}
        </section>
      </div>
    )
  }

  /* ───────── 1단계: 근무·팁 입력 ───────── */
  if (step === 1) {
    const inputRow = new Map(rows.filter((e) => e.payType !== 'salary').map((e, i) => [e.id, i]))
    return (
      <div className="page run-page">
        {header}
        {approvedForPayDate && (
          <div className="banner">
            <CircleCheck size={18} aria-hidden />
            {t('이번 회차는 이미 제출되었습니다. 다시 제출하면 기존 기록을 덮어씁니다.', 'This run was already submitted. Submitting again replaces it.')}
          </div>
        )}

        <section className="card table-card">
          <div className="table-toolbar">
            <div className="search compact">
              <Search size={15} aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('직원 검색', 'Search people')} />
            </div>
            <div className="toolbar-actions">
              <span className="muted small">{t('모두 적용:', 'Apply to all:')}</span>
              {lastRun && (
                <button className="chip" onClick={() => applyAll((e) => lastRun.time[e.id])}>
                  {t('지난번과 동일', 'Same as last')}
                </button>
              )}
              <button className="chip" onClick={() => applyAll((e) => defaultTimeFor(e.role))}>
                {t('직무 기본값', 'Role defaults')}
              </button>
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
                  <th className="num">{t('현금 팁', 'Cash tips')}</th>
                  <th className="num">{t('카드 팁', 'Card tips')}</th>
                  <th className="num">{t('총급여', 'Gross pay')}</th>
                  <th aria-label={t('상세', 'Details')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const r = resultOf(e.id)
                  const h = time[e.id] ?? { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }
                  const salary = e.payType === 'salary'
                  const tips = !salary && (receivesTips(e.role) || h.cashTips + h.cardTips > 0)
                  const issues = checksByEmployee.get(e.id) ?? []
                  const worst = issues[0]?.severity
                  const isOpen = open === e.id
                  const ri = inputRow.get(e.id) ?? -1
                  return (
                    <Fragment key={e.id}>
                      <tr className={isOpen ? 'open' : ''}>
                        <td data-label={t('직원', 'Employee')}>
                          <div className="emp-cell">
                            <span className="avatar sm">{initials(e.name)}</span>
                            <div>
                              <strong>
                                {e.name}
                                {worst && worst !== 'info' && <span className={`flag ${worst}`} title={lang === 'ko' ? issues[0].ko : issues[0].en}>{sevIcon[worst]}</span>}
                              </strong>
                              <span className="muted small">
                                {roleLabel(e.role, t)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <RateInputCell e={e} entry={time[e.id]} row={rows.indexOf(e)} onChange={(rate) => setTime(e.id, { rate })} onSaveDefault={() => saveRateAsDefault(e)} />
                        <td className="num" data-label={t('정규 시간', 'Regular hrs')}>
                          <CellInput row={ri} col={0} disabled={salary} label={`${e.name} ${t('정규 시간', 'regular hours')}`} value={h.regular} onChange={(v) => setTime(e.id, { regular: v })} />
                        </td>
                        <td className="num" data-label={t('OT 시간', 'OT hrs')}>
                          <CellInput row={ri} col={1} disabled={salary} label={`${e.name} OT`} value={h.overtime} onChange={(v) => setTime(e.id, { overtime: v })} />
                        </td>
                        <td className="num" data-label={t('현금 팁', 'Cash tips')}>
                          <CellInput row={ri} col={2} money disabled={!tips} label={`${e.name} ${t('현금 팁', 'cash tips')}`} value={h.cashTips} onChange={(v) => setTime(e.id, { cashTips: v })} />
                        </td>
                        <td className="num" data-label={t('카드 팁', 'Card tips')}>
                          <CellInput row={ri} col={3} money disabled={!tips} label={`${e.name} ${t('카드 팁', 'card tips')}`} value={h.cardTips} onChange={(v) => setTime(e.id, { cardTips: v })} />
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
                          <td colSpan={8}>
                            <div className="row-detail">
                              <div className="row-detail-facts">
                                {r.hours > 0 && (
                                  <span>
                                    {t('팁 포함 시간당', 'Effective rate')}{' '}
                                    <strong className={r.grossPay / r.hours < cfg.minimumWage ? 'warn-text' : ''}>{formatCurrency(r.grossPay / r.hours)}</strong>
                                  </span>
                                )}
                                <span>{t('연방 소득세', 'Federal tax')} <strong>{formatCurrency(r.federalWithholding)}</strong></span>
                                <span>FICA <strong>{formatCurrency(r.socialSecurity + r.medicare)}</strong></span>
                                <span>{t('입금액', 'Net pay')} <strong>{formatCurrency(r.netPay)}</strong></span>
                              </div>
                              {issues.length > 0 && <CheckList checks={issues} />}
                              {!salary && (
                                <div className="chips">
                                  <button className="chip" onClick={() => setTime(e.id, defaultTimeFor(e.role))}>{t('직무 기본값', 'Role default')}</button>
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
                  <td className="num">{formatCurrency(totals.cashTips)}</td>
                  <td className="num">{formatCurrency(totals.cardTips)}</td>
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

  /* ───────── 2단계: 검토 및 제출 ───────── */
  const issueCount = checks.filter((c) => c.severity !== 'info').length
  const showAlerts = alertsPref ?? (blocking > 0 || typeof matchMedia === 'undefined' || matchMedia('(min-width: 761px)').matches)
  return (
    <div className="page run-page">
      {header}

      {checks.length > 0 && (
        <section className={`card alert-card ${blocking ? 'crit' : issueCount ? 'warn' : 'info'}`}>
          <button className="alert-head" onClick={() => setShowAlerts(!showAlerts)} aria-expanded={showAlerts}>
            {blocking ? <OctagonAlert size={18} aria-hidden /> : issueCount ? <TriangleAlert size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <strong>
              {blocking
                ? t(`제출 전에 해결해야 할 문제 ${blocking}건`, `${blocking} issue(s) must be fixed before submitting`)
                : t(`확인해 볼 항목 ${checks.length}건`, `${checks.length} item(s) to look at`)}
            </strong>
            <ChevronDown size={18} className={`chev${showAlerts ? ' up' : ''}`} aria-hidden />
          </button>
          {showAlerts && <CheckList checks={checks} />}
        </section>
      )}

      <section className="card total-card">
        <div className="total-main">
          <span className="eyebrow">{t('회사 총 출금액', 'Total cash out')}</span>
          <div className="total-big">{formatCurrency(cashOut)}</div>
          <p className="muted small">
            {t(`${active.length}명 · 지급일 ${formatDate(pay, locale)}`, `${active.length} people · paid ${formatDate(pay, locale)}`)}
          </p>
        </div>
        <dl className="total-break">
          <div><dt><span className="sw s1" />{t('직원 급여 입금', 'Employee paychecks')}</dt><dd>{formatCurrency(totals.net)}</dd></div>
          <div><dt><span className="sw s3" />{t('IRS (연방세 + FICA 양쪽)', 'IRS (federal + both FICA halves)')}</dt><dd>{formatCurrency(totals.federalDeposit)}</dd></div>
          <div><dt><span className="sw s4" />{t('TWC + FUTA (회사 부담)', 'TWC + FUTA (employer)')}</dt><dd>{formatCurrency(totals.suta + totals.futa)}</dd></div>
          <div><dt><span className="sw s2" />{t('401(k) 적립', '401(k)')}</dt><dd>{formatCurrency(totals.pretax)}</dd></div>
        </dl>
      </section>

      <section className="stat-strip">
        <div><span>{t('총급여 (팁 포함)', 'Gross pay')}</span><strong>{formatCurrency(totals.gross)}</strong></div>
        <div><span>{t('직원 세금·공제', 'Employee taxes & deductions')}</span><strong>{formatCurrency(totals.federal + totals.socialSecurity + totals.medicare + totals.pretax)}</strong></div>
        <div><span>{t('회사 세금', 'Employer taxes')}</span><strong>{formatCurrency(totals.employerTaxes)}</strong></div>
        <div><span>{t('현금 팁 (이미 지급됨)', 'Cash tips (already paid)')}</span><strong>{formatCurrency(totals.cashTips)}</strong></div>
      </section>

      <section className="card table-card">
        <div className="table-toolbar">
          <h2>{t('직원별 상세', 'Employee details')}</h2>
          <span className="muted small">{t('행을 누르면 급여명세서를 볼 수 있어요', 'Click a row to see the pay stub')}</span>
        </div>
        <div className="table-scroll">
          <table className="run-table review">
            <thead>
              <tr>
                <th>{t('직원', 'Employee')}</th>
                <th className="num">{t('급여 기준', 'Pay rate')}</th>
                <th className="num">{t('총급여', 'Gross')}</th>
                <th className="num">{t('직원 세금', 'Employee taxes')}</th>
                <th className="num">{t('공제·현금 팁', 'Deductions & cash tips')}</th>
                <th className="num">{t('입금액', 'Net pay')}</th>
                <th className="num">{t('회사 세금', 'Employer taxes')}</th>
                <th aria-label={t('상세', 'Details')} />
              </tr>
            </thead>
            <tbody>
              {active.map((e) => {
                const r = resultOf(e.id)
                const isOpen = open === e.id
                return (
                  <Fragment key={e.id}>
                    <tr className={`clickable${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : e.id)}>
                      <td data-label={t('직원', 'Employee')}>
                        <div className="emp-cell">
                          <span className="avatar sm">{initials(e.name)}</span>
                          <div>
                            <strong>{e.name}</strong>
                            <span className="muted small">{roleLabel(e.role, t)}</span>
                          </div>
                        </div>
                      </td>
                      <RateCell e={e} entry={time[e.id]} />
                      <td className="num" data-label={t('총급여', 'Gross')}>{formatCurrency(r.grossPay)}</td>
                      <td className="num" data-label={t('직원 세금', 'Employee taxes')}>{formatCurrency(r.federalWithholding + r.socialSecurity + r.medicare)}</td>
                      <td className="num" data-label={t('공제·현금 팁', 'Deductions & cash tips')}>{formatCurrency(r.pretaxDeductions + r.cashTips)}</td>
                      <td className="num" data-label={t('입금액', 'Net pay')}><strong>{formatCurrency(r.netPay)}</strong></td>
                      <td className="num muted" data-label={t('회사 세금', 'Employer taxes')}>{formatCurrency(r.employerTaxes)}</td>
                      <td className="expand-cell"><ChevronDown size={18} className="chev" aria-hidden /></td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <PayStub employee={eff(e)} result={r} time={time[e.id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('합계', 'Total')}</td>
                <td />
                <td className="num">{formatCurrency(totals.gross)}</td>
                <td className="num">{formatCurrency(totals.federal + totals.socialSecurity + totals.medicare)}</td>
                <td className="num">{formatCurrency(totals.pretax + totals.cashTips)}</td>
                <td className="num"><strong>{formatCurrency(totals.net)}</strong></td>
                <td className="num">{formatCurrency(totals.employerTaxes)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {totals.tipCredit45B > 0 && (
        <div className="insight">
          <HandCoins size={20} aria-hidden />
          <p>
            {t(
              `이번 회차 팁에 낸 회사 FICA 중 약 ${formatCurrency(totals.tipCredit45B)}는 45B 팁 크레딧(Form 8846)으로 돌려받을 수 있어요.`,
              `About ${formatCurrency(totals.tipCredit45B)} of employer FICA on this run's tips can come back as the 45B tip credit (Form 8846).`,
            )}
          </p>
        </div>
      )}

      <div className="action-bar">
        <div className="action-bar-inner">
          <button className="btn" onClick={() => setStep(1)}>
            <ArrowLeft size={18} aria-hidden /> {t('수정', 'Edit')}
          </button>
          <div className="action-total">
            <span className="muted small">{t('회사 총 출금액', 'Total cash out')}</span>
            <strong>{formatCurrency(cashOut)}</strong>
          </div>
          <button className="btn primary lg" disabled={blocking > 0} onClick={() => { setDone(approveRun()); window.scrollTo({ top: 0 }) }}>
            <Check size={18} aria-hidden />
            {blocking > 0 ? t('문제 해결 후 제출', 'Fix issues to submit') : t('급여 제출', 'Submit payroll')}
          </button>
        </div>
      </div>
    </div>
  )
}
