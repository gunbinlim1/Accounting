import { Lightbulb, PiggyBank, RotateCcw } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { segmentsOf } from '../lib/segments'
import BreakdownBar from '../components/BreakdownBar'
import { companySchedule, periodsPerYear, standardHours } from '../config/payrollConfig'
import { formatCurrency, formatPercent, formatSigned } from '../lib/format'
import { calculatePayroll, roundCents } from '../lib/payroll'
import { usePrefs } from '../prefs'
import { useStore } from '../store'

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function Simulator() {
  const { t } = usePrefs()
  const { employees, hours, ytdGross } = useStore()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('e') ?? employees.find((e) => e.active)?.id ?? employees[0]?.id
  const employee = employees.find((e) => e.id === selectedId)

  const [raise, setRaise] = useState(0)
  const [deferral, setDeferral] = useState<number | null>(null)
  const [overtime, setOvertime] = useState<number | null>(null)

  const freq = companySchedule.frequency
  const periods = periodsPerYear[freq]

  const sim = useMemo(() => {
    if (!employee) return null
    const h = hours[employee.id] ?? { regular: standardHours[freq], overtime: 0 }
    const regularHours = employee.payType === 'hourly' ? h.regular || standardHours[freq] : 0
    const base = calculatePayroll({ employee, payFrequency: freq, regularHours, overtimeHours: h.overtime, ytdGross: ytdGross[employee.id] })
    const scenarioEmployee = {
      ...employee,
      rate: roundCents(employee.rate * (1 + raise / 100)),
      pretaxDeferralRate: (deferral ?? employee.pretaxDeferralRate * 100) / 100,
    }
    const scenario = calculatePayroll({
      employee: scenarioEmployee,
      payFrequency: freq,
      regularHours,
      overtimeHours: overtime ?? h.overtime,
      ytdGross: ytdGross[employee.id],
    })
    return { base, scenario, currentOvertime: h.overtime }
  }, [employee, hours, ytdGross, raise, deferral, overtime, freq])

  if (!employee || !sim) return <div className="page">{t('직원이 없습니다.', 'No employees yet.')}</div>

  const { base, scenario } = sim
  const netDelta = scenario.netPay - base.netPay
  const annualNet = netDelta * periods
  const annualCost = (scenario.employerCost - base.employerCost) * periods
  const annualSavings = (scenario.pretaxDeductions - base.pretaxDeductions) * periods
  const deferralValue = deferral ?? Math.round(employee.pretaxDeferralRate * 100)
  const changed = raise !== 0 || deferral !== null || overtime !== null

  const reset = () => {
    setRaise(0)
    setDeferral(null)
    setOvertime(null)
  }

  // 401(k)를 늘렸을 때: 저축은 늘지만 실수령액은 그만큼 줄지 않음 (세금 절감 효과)
  const grossDeltaAnnual = (scenario.grossPay - base.grossPay) * periods
  const taxSaved = annualSavings > 0 && grossDeltaAnnual === 0 ? roundCents(annualSavings + annualNet) : 0

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{t('만약에…?', 'What if…?')}</p>
        <h1>{t('급여 시뮬레이터', 'Pay simulator')}</h1>
        <p className="lead">
          {t('인상, 401(k), 초과근무를 바꿔 보면 실수령액과 회사 비용이 어떻게 달라지는지 바로 보여 드려요.', 'Adjust a raise, 401(k) or overtime to instantly see take-home and company cost change.')}
        </p>
      </header>

      <div className="person-picker">
        {employees.filter((e) => e.active).map((e) => (
          <button
            key={e.id}
            className={e.id === employee.id ? 'on' : ''}
            onClick={() => {
              setParams({ e: e.id })
              reset()
            }}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="sim-grid">
        <section className="card controls">
          <div className="card-head">
            <h2>{t('조건 바꾸기', 'Adjust')}</h2>
            {changed && (
              <button className="btn ghost sm" onClick={reset}>
                <RotateCcw size={15} aria-hidden /> {t('초기화', 'Reset')}
              </button>
            )}
          </div>
          <Slider label={t('급여 인상률', 'Raise')} value={raise} min={-10} max={30} step={1} format={(v) => `${v > 0 ? '+' : ''}${v}%`} onChange={setRaise} />
          <p className="muted small">
            {employee.payType === 'salary'
              ? t(`연봉 ${formatCurrency(employee.rate)} → ${formatCurrency(employee.rate * (1 + raise / 100))}`, `Salary ${formatCurrency(employee.rate)} → ${formatCurrency(employee.rate * (1 + raise / 100))}`)
              : t(`시급 ${formatCurrency(employee.rate)} → ${formatCurrency(employee.rate * (1 + raise / 100))}`, `Rate ${formatCurrency(employee.rate)} → ${formatCurrency(employee.rate * (1 + raise / 100))}`)}
          </p>
          <Slider label={t('401(k) 저축률', '401(k) rate')} value={deferralValue} min={0} max={25} step={1} format={(v) => `${v}%`} onChange={setDeferral} />
          {employee.payType === 'hourly' && (
            <Slider
              label={t('초과근무 (회당)', 'Overtime per paycheck')}
              value={overtime ?? sim.currentOvertime}
              min={0}
              max={30}
              step={1}
              format={(v) => `${v}h`}
              onChange={setOvertime}
            />
          )}
        </section>

        <section className="card result">
          <div className="compare">
            <div>
              <span className="muted small">{t('현재 실수령 (회당)', 'Now, per paycheck')}</span>
              <span className="compare-value muted">{formatCurrency(base.netPay)}</span>
            </div>
            <div>
              <span className="muted small">{t('시나리오', 'Scenario')}</span>
              <span className="compare-value">{formatCurrency(scenario.netPay)}</span>
            </div>
            <div className={`delta ${netDelta > 0 ? 'up' : netDelta < 0 ? 'down' : ''}`}>{formatSigned(netDelta)}</div>
          </div>

          <BreakdownBar segments={segmentsOf(scenario)} />

          <dl className="impact">
            <div>
              <dt>{t('직원 연간 실수령 변화', 'Employee take-home / yr')}</dt>
              <dd>{formatSigned(annualNet)}</dd>
            </div>
            <div>
              <dt>{t('직원 연간 401(k) 저축 변화', 'Employee 401(k) / yr')}</dt>
              <dd>{formatSigned(annualSavings)}</dd>
            </div>
            <div>
              <dt>{t('회사 연간 인건비 변화', 'Company cost / yr')}</dt>
              <dd>{formatSigned(annualCost)}</dd>
            </div>
          </dl>

          {taxSaved > 1 && (
            <div className="insight">
              <PiggyBank size={20} aria-hidden />
              <p>
                {t(
                  `401(k)로 1년에 ${formatCurrency(annualSavings)}를 더 저축해도 실수령액은 ${formatCurrency(annualSavings - taxSaved)}만 줄어요. 차액 ${formatCurrency(taxSaved)}는 세금 절감 효과입니다.`,
                  `Saving ${formatCurrency(annualSavings)} more per year in a 401(k) only reduces take-home by ${formatCurrency(annualSavings - taxSaved)}. The ${formatCurrency(taxSaved)} difference is tax you don't pay now.`,
                )}
              </p>
            </div>
          )}
          {raise > 0 && (
            <div className="insight">
              <Lightbulb size={20} aria-hidden />
              <p>
                {t(
                  `${raise}% 인상 시 회사는 연 ${formatCurrency(annualCost)}를 더 쓰지만, 세금 때문에 직원 실수령 증가는 연 ${formatCurrency(annualNet)} (${formatPercent(annualCost > 0 ? annualNet / annualCost : 0, 0)})입니다.`,
                  `A ${raise}% raise costs the company ${formatCurrency(annualCost)}/yr, but after taxes the employee keeps ${formatCurrency(annualNet)}/yr (${formatPercent(annualCost > 0 ? annualNet / annualCost : 0, 0)}).`,
                )}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
