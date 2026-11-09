import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Minus, PartyPopper, Plus, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CheckList from '../components/CheckList'
import PayStub from '../components/PayStub'
import { companySchedule, standardHours } from '../config/payrollConfig'
import { formatCurrency, formatDate, initials } from '../lib/format'
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
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        />
        <button type="button" onClick={() => onChange(value + step)} aria-label={`${label} +`}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

export default function PayrollRun() {
  const { t, locale } = usePrefs()
  const { employees, hours, setHours, results, payDate, lastRun, approveRun, approvedForPayDate } = useStore()
  const checks = useChecks()
  const [params] = useSearchParams()
  const [step, setStep] = useState(() => (params.get('step') === '2' ? 2 : 1))
  const [open, setOpen] = useState<string | null>(null)
  const [done, setDone] = useState<PayRun | null>(null)

  const active = employees.filter((e) => e.active)
  const hourly = active.filter((e) => e.payType === 'hourly')
  const salaried = active.filter((e) => e.payType === 'salary')
  const std = standardHours[companySchedule.frequency]
  const totals = sumResults(results)
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const pay = parseISODate(payDate)

  const steps = [t('근무시간', 'Hours'), t('검토', 'Review'), t('승인', 'Approve')]

  if (done) {
    const s = sumResults(done.results)
    return (
      <div className="page">
        <section className="card success">
          <PartyPopper size={40} className="success-icon" aria-hidden />
          <h1>{t('급여가 승인되었습니다!', 'Payroll approved!')}</h1>
          <p className="lead">
            {t(
              `${formatDate(pay, locale)}에 ${done.results.length}명에게 총 ${formatCurrency(s.net)}이 지급됩니다.`,
              `${done.results.length} people will receive ${formatCurrency(s.net)} on ${formatDate(pay, locale)}.`,
            )}
          </p>
          <div className="todo">
            <h2>{t('다음에 할 일', 'Next steps')}</h2>
            <ul>
              <li>
                <Check size={16} aria-hidden /> {t(`IRS에 ${formatCurrency(s.federalDeposit)} 예치 (EFTPS)`, `Deposit ${formatCurrency(s.federalDeposit)} to the IRS (EFTPS)`)}
              </li>
              <li>
                <Check size={16} aria-hidden /> {t(`주 정부에 ${formatCurrency(s.state)} 납부`, `Remit ${formatCurrency(s.state)} state withholding`)}
              </li>
              <li>
                <Check size={16} aria-hidden /> {t('직원에게 급여명세서 전달', 'Share pay stubs with employees')}
              </li>
            </ul>
          </div>
          <div className="row gap">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={18} aria-hidden /> {t('급여명세서 인쇄', 'Print pay stubs')}
            </button>
            <Link to="/" className="btn primary">
              {t('홈으로', 'Back home')}
            </Link>
          </div>
        </section>
        <section className="print-stubs">
          {done.results.map((r) => {
            const e = employees.find((x) => x.id === r.employeeId)!
            return (
              <div key={r.employeeId} className="print-stub">
                <h2>
                  {e.name} · {formatDate(pay, locale)}
                </h2>
                <PayStub employee={e} result={r} hours={done.hours[e.id]} />
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
        <p className="eyebrow">
          {t('지급일', 'Pay date')} {formatDate(pay, locale)}
        </p>
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
            {t(
              '시급 직원의 이번 기간 근무시간을 확인하세요. 연봉 직원은 자동으로 계산됩니다.',
              'Confirm hours for hourly staff. Salaried pay is calculated automatically.',
            )}
          </p>
          <div className="hour-grid">
            {hourly.map((e) => {
              const h = hours[e.id] ?? { regular: 0, overtime: 0 }
              const r = results.find((x) => x.employeeId === e.id)
              const prev = lastRun?.hours[e.id]
              return (
                <div key={e.id} className="card hour-card">
                  <div className="person">
                    <span className="avatar">{initials(e.name)}</span>
                    <div>
                      <strong>{e.name}</strong>
                      <span className="muted small">
                        {formatCurrency(e.rate)}/{t('시간', 'hr')}
                      </span>
                    </div>
                    <span className="person-net num">{r && formatCurrency(r.grossPay)}</span>
                  </div>
                  <div className="row gap">
                    <NumberStepper label={t('정규', 'Regular')} value={h.regular} onChange={(v) => setHours(e.id, { regular: v })} />
                    <NumberStepper label={t('초과 (×1.5)', 'Overtime (×1.5)')} value={h.overtime} onChange={(v) => setHours(e.id, { overtime: v })} />
                  </div>
                  <div className="chips">
                    <button className="chip" onClick={() => setHours(e.id, { regular: std, overtime: 0 })}>
                      {t(`표준 ${std}시간`, `Standard ${std}h`)}
                    </button>
                    {prev && (
                      <button className="chip" onClick={() => setHours(e.id, prev)}>
                        {t(`지난번과 동일 (${prev.regular}+${prev.overtime})`, `Same as last (${prev.regular}+${prev.overtime})`)}
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
            <p className="muted small">{t('행을 눌러 급여명세서와 공제 설명을 확인하세요.', 'Tap a row to see the pay stub and what each deduction means.')}</p>
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
                        <span className="muted small">{e.department}</span>
                      </span>
                      <span className="num muted people-gross">{formatCurrency(r.grossPay)}</span>
                      <span className="num people-net">{formatCurrency(r.netPay)}</span>
                      <ChevronDown size={18} className="chev" aria-hidden />
                    </button>
                    {isOpen && <PayStub employee={e} result={r} hours={hours[e.id]} />}
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
              <div>
                <dt>{t('직원 통장으로', 'To employees')}</dt>
                <dd>{formatCurrency(totals.net)}</dd>
              </div>
              <div>
                <dt>{t('IRS 예치 (연방세 + FICA)', 'To IRS (federal + FICA)')}</dt>
                <dd>{formatCurrency(totals.federalDeposit)}</dd>
              </div>
              <div>
                <dt>{t('주 정부', 'To state')}</dt>
                <dd>{formatCurrency(totals.state)}</dd>
              </div>
              <div>
                <dt>{t('401(k) 적립', 'To 401(k)')}</dt>
                <dd>{formatCurrency(totals.pretax)}</dd>
              </div>
              <div className="total">
                <dt>{t('회사 총 출금액', 'Total cash out')}</dt>
                <dd>{formatCurrency(totals.employerCost)}</dd>
              </div>
            </dl>
            <p className="muted small">
              {t(
                `${active.length}명 · 지급일 ${formatDate(pay, locale)} · 승인 후 급여명세서를 인쇄할 수 있어요`,
                `${active.length} people · paid ${formatDate(pay, locale)} · you can print stubs after approving`,
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
