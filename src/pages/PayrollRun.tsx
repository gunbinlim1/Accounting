import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, HandCoins, Minus, PartyPopper, Plus, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CheckList from '../components/CheckList'
import PayStub from '../components/PayStub'
import { payrollConfig as cfg } from '../config/payrollConfig'
import { defaultTimeFor, receivesTips } from '../config/restaurantRoles'
import { formatCurrency, formatDate, initials } from '../lib/format'
import { roleLabel } from '../lib/labels'
import { sumResults } from '../lib/payroll'
import { parseISODate } from '../lib/schedule'
import { useChecks } from '../lib/useChecks'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { PayRun } from '../types'

function NumberStepper({ value, onChange, label, step = 1 }: { value: number; onChange: (v: number) => void; label: string; step?: number }) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button type="button" onClick={() => onChange(Math.max(0, value - step))} aria-label={`${label} −`}>
          <Minus size={16} />
        </button>
        <input type="number" inputMode="decimal" min={0} value={value} aria-label={label} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
        <button type="button" onClick={() => onChange(value + step)} aria-label={`${label} +`}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function MoneyInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl money">
        <span>$</span>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      </div>
    </label>
  )
}

export default function PayrollRun() {
  const { t, locale } = usePrefs()
  const { employees, time, setTime, results, payDate, lastRun, approveRun, approvedForPayDate } = useStore()
  const checks = useChecks()
  const [params] = useSearchParams()
  const [step, setStep] = useState(() => (params.get('step') === '2' ? 2 : 1))
  const [open, setOpen] = useState<string | null>(null)
  const [done, setDone] = useState<PayRun | null>(null)

  const active = employees.filter((e) => e.active)
  const timed = active.filter((e) => e.payType !== 'salary')
  const salaried = active.filter((e) => e.payType === 'salary')
  const totals = sumResults(results)
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const pay = parseISODate(payDate)
  const cashOut = totals.net + totals.federalDeposit + totals.pretax + totals.futa + totals.suta

  const steps = [t('근무·팁', 'Hours & tips'), t('검토', 'Review'), t('승인', 'Approve')]

  if (done) {
    const s = sumResults(done.results)
    return (
      <div className="page">
        <section className="card success">
          <PartyPopper size={40} className="success-icon" aria-hidden />
          <h1>{t('급여가 승인되었습니다!', 'Payroll approved!')}</h1>
          <p className="lead">
            {t(
              `${formatDate(pay, locale)}에 ${done.results.length}명에게 총 ${formatCurrency(s.net)}이 입금됩니다.`,
              `${done.results.length} people will receive ${formatCurrency(s.net)} on ${formatDate(pay, locale)}.`,
            )}
          </p>
          <div className="todo">
            <h2>{t('다음에 할 일', 'Next steps')}</h2>
            <ul>
              <li><Check size={16} aria-hidden /> {t(`EFTPS로 IRS에 ${formatCurrency(s.federalDeposit)} 예치 (연방세 + FICA)`, `Deposit ${formatCurrency(s.federalDeposit)} to the IRS via EFTPS (federal + FICA)`)}</li>
              <li><Check size={16} aria-hidden /> {t(`TWC 실업세 ${formatCurrency(s.suta)} 적립 — 분기 C-3 보고 때 납부`, `Set aside ${formatCurrency(s.suta)} TWC tax for the quarterly C-3`)}</li>
              <li><Check size={16} aria-hidden /> {t(`FUTA ${formatCurrency(s.futa)} 적립`, `Accrue ${formatCurrency(s.futa)} FUTA`)}</li>
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
                <PayStub employee={e} result={r} time={done.time[e.id]} />
              </div>
            )
          })}
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{t('지급일', 'Pay date')} {formatDate(pay, locale)} · {t('텍사스 (주 소득세 없음)', 'Texas (no state income tax)')}</p>
        <h1>{t('급여 실행', 'Run payroll')}</h1>
      </header>

      {approvedForPayDate && (
        <div className="banner">
          <CircleCheck size={18} aria-hidden />
          {t('이번 회차는 이미 승인되었습니다. 다시 승인하면 기존 기록을 덮어씁니다.', 'This run is already approved. Approving again replaces it.')}
        </div>
      )}

      <ol className="steps" aria-label={t('진행 단계', 'Progress')}>
        {steps.map((label, i) => {
          const n = i + 1
          return (
            <li key={label} className={n === step ? 'current' : n < step ? 'done' : ''}>
              <button type="button" onClick={() => n < step && setStep(n)} disabled={n > step}>
                <span className="step-dot">{n < step ? <Check size={14} /> : n}</span>
                {label}
              </button>
            </li>
          )
        })}
      </ol>

      {step === 1 && (
        <section className="stack">
          <p className="lead">
            {t('2주간 근무시간과 팁을 입력하세요. 팁 직원은 팁을 합쳐 시간당 $7.25가 안 되면 자동으로 보전됩니다.', 'Enter two weeks of hours and tips. Tipped staff are automatically topped up to $7.25/h if tips fall short.')}
          </p>
          <div className="hour-grid">
            {timed.map((e) => {
              const h = time[e.id] ?? defaultTimeFor(e.role)
              const r = results.find((x) => x.employeeId === e.id)
              const prev = lastRun?.time[e.id]
              const tips = receivesTips(e.role) || h.cashTips + h.cardTips > 0
              const effective = r && r.hours > 0 ? r.grossPay / r.hours : 0
              return (
                <div key={e.id} className="card hour-card">
                  <div className="person">
                    <span className="avatar">{initials(e.name)}</span>
                    <div>
                      <strong>{e.name}</strong>
                      <span className="muted small">
                        {roleLabel(e.role, t)} · {formatCurrency(e.rate)}/h{e.payType === 'tipped' ? ` + ${t('팁', 'tips')}` : ''}
                      </span>
                    </div>
                    <span className="person-net num">{r && formatCurrency(r.grossPay)}</span>
                  </div>
                  <div className="time-grid">
                    <NumberStepper label={t('정규 시간', 'Regular h')} value={h.regular} onChange={(v) => setTime(e.id, { regular: v })} />
                    <NumberStepper label={t('OT 시간 (주 40h 초과)', 'OT h (over 40/wk)')} value={h.overtime} onChange={(v) => setTime(e.id, { overtime: v })} />
                    {tips && (
                      <>
                        <MoneyInput label={t('현금 팁 (신고)', 'Cash tips (reported)')} value={h.cashTips} onChange={(v) => setTime(e.id, { cashTips: v })} />
                        <MoneyInput label={t('카드 팁', 'Card tips')} value={h.cardTips} onChange={(v) => setTime(e.id, { cardTips: v })} />
                      </>
                    )}
                  </div>
                  {r && r.hours > 0 && (
                    <div className="hour-meta">
                      <span className={effective >= cfg.minimumWage ? 'muted' : 'warn-text'}>
                        {t('팁 포함 시간당', 'Effective')} <strong>{formatCurrency(effective)}</strong>
                      </span>
                      {r.tipMakeUp > 0 && (
                        <span className="pill warn">
                          <HandCoins size={14} aria-hidden /> {t('최저임금 보전', 'Make-up')} +{formatCurrency(r.tipMakeUp)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="chips">
                    <button className="chip" onClick={() => setTime(e.id, defaultTimeFor(e.role))}>
                      {t('직무 기본값', 'Role default')}
                    </button>
                    {prev && (
                      <button className="chip" onClick={() => setTime(e.id, prev)}>
                        {t('지난번과 동일', 'Same as last')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {salaried.length > 0 && (
            <div className="card salaried">
              <strong>{t(`연봉 직원 ${salaried.length}명`, `${salaried.length} salaried`)}</strong>
              <span className="muted">{salaried.map((e) => e.name).join(', ')}</span>
              <span className="pill">{t('자동 계산', 'Automatic')}</span>
            </div>
          )}
          <div className="actions">
            <button className="btn primary lg" onClick={() => setStep(2)}>
              {t('다음: 검토', 'Next: Review')} <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="stack">
          <div className="card">
            <h2>{t('자동 점검 결과', 'Smart checks')}</h2>
            <CheckList checks={checks} />
          </div>

          <div className="card">
            <h2>{t('직원별 급여', 'Pay by person')}</h2>
            <p className="muted small">{t('행을 눌러 급여명세서와 항목별 설명을 확인하세요.', 'Tap a row for the pay stub and what each line means.')}</p>
            <div className="people-head">
              <span />
              <span>{t('이름', 'Name')}</span>
              <span className="num">{t('팁', 'Tips')}</span>
              <span className="num">{t('총급여', 'Gross')}</span>
              <span className="num">{t('입금액', 'Check')}</span>
              <span />
            </div>
            <ul className="people">
              {active.map((e) => {
                const r = results.find((x) => x.employeeId === e.id)!
                const isOpen = open === e.id
                return (
                  <li key={e.id} className={isOpen ? 'open' : ''}>
                    <button className="people-row" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                      <span className="avatar">{initials(e.name)}</span>
                      <span className="people-name">
                        <strong>{e.name}</strong>
                        <span className="muted small">{roleLabel(e.role, t)}</span>
                      </span>
                      <span className="num muted people-tips">{r.cashTips + r.cardTips ? formatCurrency(r.cashTips + r.cardTips) : '—'}</span>
                      <span className="num muted people-gross">{formatCurrency(r.grossPay)}</span>
                      <span className="num people-net">{formatCurrency(r.netPay)}</span>
                      <ChevronDown size={18} className="chev" aria-hidden />
                    </button>
                    {isOpen && <PayStub employee={e} result={r} time={time[e.id]} />}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="actions between">
            <button className="btn" onClick={() => setStep(1)}>
              <ArrowLeft size={18} aria-hidden /> {t('이전', 'Back')}
            </button>
            <button className="btn primary lg" onClick={() => setStep(3)} disabled={blocking > 0}>
              {blocking > 0 ? t(`확인 필요 ${blocking}건 해결 후 진행`, `Resolve ${blocking} issue(s) first`) : t('다음: 승인', 'Next: Approve')}
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="stack">
          <div className="card summary">
            <h2>{t('승인 요약', 'Approval summary')}</h2>
            <dl>
              <div><dt>{t('직원 급여 입금 (카드 팁 포함)', 'Paychecks (incl. card tips)')}</dt><dd>{formatCurrency(totals.net)}</dd></div>
              <div><dt>{t('IRS 예치 — 연방 소득세 + FICA(직원·회사)', 'IRS — federal tax + FICA (both halves)')}</dt><dd>{formatCurrency(totals.federalDeposit)}</dd></div>
              <div><dt>{t('텍사스 TWC 실업세 (회사 부담)', 'Texas TWC unemployment (employer)')}</dt><dd>{formatCurrency(totals.suta)}</dd></div>
              <div><dt>{t('FUTA (회사 부담)', 'FUTA (employer)')}</dt><dd>{formatCurrency(totals.futa)}</dd></div>
              <div><dt>{t('401(k) 적립', 'To 401(k)')}</dt><dd>{formatCurrency(totals.pretax)}</dd></div>
              <div className="total"><dt>{t('회사 총 출금액', 'Total cash out')}</dt><dd>{formatCurrency(cashOut)}</dd></div>
            </dl>
            <p className="muted small">
              {t(
                `현금 팁 ${formatCurrency(totals.cashTips)}은 직원이 이미 받아 출금에서 제외됩니다. 45B 팁 크레딧 예상 ${formatCurrency(totals.tipCredit45B)}.`,
                `Cash tips of ${formatCurrency(totals.cashTips)} are already with employees. Estimated 45B tip credit ${formatCurrency(totals.tipCredit45B)}.`,
              )}
            </p>
          </div>
          <div className="actions between">
            <button className="btn" onClick={() => setStep(2)}>
              <ArrowLeft size={18} aria-hidden /> {t('이전', 'Back')}
            </button>
            <button className="btn primary lg" onClick={() => setDone(approveRun())}>
              <Check size={18} aria-hidden /> {t(`${formatCurrency(totals.net)} 지급 승인`, `Approve ${formatCurrency(totals.net)}`)}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
