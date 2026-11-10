import { HandCoins, Lightbulb, PiggyBank, RotateCcw } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import BreakdownBar from '../components/BreakdownBar'
import { companySchedule, payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { defaultTimeFor } from '../config/restaurantRoles'
import { formatCurrency, formatPercent, formatSigned } from '../lib/format'
import { roleLabel } from '../lib/labels'
import { calculatePayroll, effectiveEmployee, roundCents, tipCreditRate } from '../lib/payroll'
import { segmentsOf } from '../lib/segments'
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
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--fill': `${pct}%` } as CSSProperties} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function Simulator() {
  const { t } = usePrefs()
  const { employees, time, ytdGross } = useStore()
  const [params, setParams] = useSearchParams()
  const activeList = employees.filter((e) => e.active)
  const selectedId = params.get('e') ?? activeList[0]?.id
  const employee = employees.find((e) => e.id === selectedId)

  const [raise, setRaise] = useState(0)
  const [deferral, setDeferral] = useState<number | null>(null)
  const [overtime, setOvertime] = useState<number | null>(null)
  const [tipsPerHour, setTipsPerHour] = useState<number | null>(null)

  const freq = companySchedule.frequency
  const periods = periodsPerYear[freq]

  const sim = useMemo(() => {
    if (!employee) return null
    const cur = time[employee.id] ?? defaultTimeFor(employee.role)
    const hours = cur.regular + cur.overtime
    const curTips = cur.cashTips + cur.cardTips
    const currentTph = hours > 0 ? curTips / hours : 0
    const cashShare = curTips > 0 ? cur.cashTips / curTips : 0.25
    const ytd = { gross: ytdGross[employee.id] ?? 0 }
    const eff = effectiveEmployee(employee, cur, freq)
    const base = calculatePayroll({ employee: eff, payFrequency: freq, time: cur, ytd })

    const ot = overtime ?? cur.overtime
    const tph = tipsPerHour ?? currentTph
    const scenarioTips = tph * (cur.regular + ot)
    const scenario = calculatePayroll({
      employee: { ...eff, rate: roundCents(eff.rate * (1 + raise / 100)), pretaxDeferralRate: (deferral ?? employee.pretaxDeferralRate * 100) / 100 },
      payFrequency: freq,
      time: { regular: cur.regular, overtime: ot, cashTips: scenarioTips * cashShare, cardTips: scenarioTips * (1 - cashShare) },
      ytd,
    })
    return { base, scenario, cur, currentTph }
  }, [employee, time, ytdGross, raise, deferral, overtime, tipsPerHour, freq])

  if (!employee || !sim) return <div className="page">{t('직원이 없습니다.', 'No employees yet.')}</div>

  const { base, scenario, cur, currentTph } = sim
  // 직원 입장: 급여 입금 + 현금 팁
  const takeHome = (r: typeof base) => r.netPay + r.cashTips
  const delta = takeHome(scenario) - takeHome(base)
  const annualTakeHome = delta * periods
  const annualCost = (scenario.employerCost - base.employerCost) * periods
  const annualSavings = (scenario.pretaxDeductions - base.pretaxDeductions) * periods
  const grossDeltaAnnual = (scenario.grossPay - base.grossPay) * periods
  const taxSaved = annualSavings > 0 && grossDeltaAnnual === 0 ? roundCents(annualSavings + annualTakeHome) : 0
  const deferralValue = deferral ?? Math.round(employee.pretaxDeferralRate * 100)
  const changed = raise !== 0 || deferral !== null || overtime !== null || tipsPerHour !== null
  const hasTips = employee.payType !== 'salary' && (employee.payType === 'tipped' || currentTph > 0)
  const breakEvenTph = employee.payType === 'tipped' ? tipCreditRate(employee.rate) : 0

  const reset = () => {
    setRaise(0)
    setDeferral(null)
    setOvertime(null)
    setTipsPerHour(null)
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{t('만약에…?', 'What if…?')}</p>
        <h1>{t('급여 시뮬레이터', 'Pay simulator')}</h1>
        <p className="lead">
          {t('시급 인상, OT, 팁, 401(k)를 바꿔 보면 직원이 손에 쥐는 돈과 레스토랑 인건비가 어떻게 달라지는지 바로 보여 드려요.', 'Change the rate, OT, tips or 401(k) to see what the employee keeps and what the restaurant pays.')}
        </p>
      </header>

      <div className="person-picker">
        {activeList.map((e) => (
          <button key={e.id} className={e.id === employee.id ? 'on' : ''} onClick={() => { setParams({ e: e.id }); reset() }}>
            {e.name} <span className="muted">· {roleLabel(e.role, t)}</span>
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
          <Slider label={employee.payType === 'salary' ? t('연봉 인상률', 'Raise') : t('시급 인상률', 'Rate increase')} value={raise} min={-10} max={50} step={1} format={(v) => `${v > 0 ? '+' : ''}${v}%`} onChange={setRaise} />
          <p className="muted small">
            {formatCurrency(employee.rate)} → {formatCurrency(employee.rate * (1 + raise / 100))}
            {employee.payType === 'salary' ? t(' /년', ' /yr') : ' /h'}
          </p>
          {employee.payType !== 'salary' && (
            <Slider label={t('OT 시간 (2주)', 'OT hours (2 weeks)')} value={overtime ?? cur.overtime} min={0} max={30} step={1} format={(v) => `${v}h`} onChange={setOvertime} />
          )}
          {hasTips && (
            <Slider label={t('시간당 팁', 'Tips per hour')} value={roundCents(tipsPerHour ?? currentTph)} min={0} max={40} step={0.5} format={(v) => formatCurrency(v)} onChange={setTipsPerHour} />
          )}
          {breakEvenTph > 0 && (
            <p className="muted small">
              {t(`시간당 팁이 ${formatCurrency(breakEvenTph)} 미만이면 회사가 최저임금 차액을 보전합니다.`, `Below ${formatCurrency(breakEvenTph)}/h in tips, the restaurant pays the minimum-wage difference.`)}
            </p>
          )}
          <Slider label={t('401(k) 저축률', '401(k) rate')} value={deferralValue} min={0} max={25} step={1} format={(v) => `${v}%`} onChange={setDeferral} />
        </section>

        <section className="card result">
          <div className="compare">
            <div>
              <span className="muted small">{t('지금 (2주, 현금 팁 포함)', 'Now (2 weeks, incl. cash tips)')}</span>
              <span className="compare-value muted">{formatCurrency(takeHome(base))}</span>
            </div>
            <div>
              <span className="muted small">{t('시나리오', 'Scenario')}</span>
              <span className="compare-value">{formatCurrency(takeHome(scenario))}</span>
            </div>
            <div className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>{formatSigned(delta)}</div>
          </div>

          <BreakdownBar segments={segmentsOf(scenario)} />

          <dl className="impact">
            <div><dt>{t('직원 연간 수입 변화', 'Employee keeps / yr')}</dt><dd>{formatSigned(annualTakeHome)}</dd></div>
            <div><dt>{t('레스토랑 연간 인건비 변화', 'Restaurant cost / yr')}</dt><dd>{formatSigned(annualCost)}</dd></div>
            <div><dt>{t('45B 팁 크레딧 (연)', '45B tip credit / yr')}</dt><dd>{formatCurrency(scenario.tipCredit45B * periods)}</dd></div>
          </dl>

          {scenario.tipMakeUp > 0 && (
            <div className="insight warn">
              <HandCoins size={20} aria-hidden />
              <p>
                {t(
                  `이 조건이면 팁이 부족해 회사가 2주마다 ${formatCurrency(scenario.tipMakeUp)}을 최저임금 보전으로 지급합니다 (연 ${formatCurrency(scenario.tipMakeUp * periods)}).`,
                  `Tips fall short here, so the restaurant adds ${formatCurrency(scenario.tipMakeUp)} make-up pay every two weeks (${formatCurrency(scenario.tipMakeUp * periods)}/yr).`,
                )}
              </p>
            </div>
          )}
          {taxSaved > 1 && (
            <div className="insight">
              <PiggyBank size={20} aria-hidden />
              <p>
                {t(
                  `401(k)로 1년에 ${formatCurrency(annualSavings)}를 더 저축해도 손에 쥐는 돈은 ${formatCurrency(annualSavings - taxSaved)}만 줄어요. 차액 ${formatCurrency(taxSaved)}는 연방 소득세 절감 효과입니다.`,
                  `Saving ${formatCurrency(annualSavings)} more a year in a 401(k) only cuts take-home by ${formatCurrency(annualSavings - taxSaved)}. The ${formatCurrency(taxSaved)} difference is federal tax saved.`,
                )}
              </p>
            </div>
          )}
          {raise > 0 && annualCost > 0 && (
            <div className="insight">
              <Lightbulb size={20} aria-hidden />
              <p>
                {t(
                  `${raise}% 인상 시 레스토랑은 연 ${formatCurrency(annualCost)}를 더 쓰고, 직원은 세후 연 ${formatCurrency(annualTakeHome)}를 더 받습니다 (${formatPercent(annualTakeHome / annualCost, 0)}).`,
                  `A ${raise}% raise costs the restaurant ${formatCurrency(annualCost)}/yr; the employee keeps ${formatCurrency(annualTakeHome)}/yr after tax (${formatPercent(annualTakeHome / annualCost, 0)}).`,
                )}
                {employee.payType === 'tipped' &&
                  t(' 팁 직원은 현금 시급을 올리면 팁 크레딧이 줄어 OT 단가도 함께 바뀝니다.', ' For tipped staff, a higher cash wage shrinks the tip credit and changes the OT rate too.')}
              </p>
            </div>
          )}
          <p className="muted small">
            {t(`텍사스: 주 소득세 없음 · 최저임금 ${formatCurrency(cfg.minimumWage)} · 팁 직원 현금 시급 최소 ${formatCurrency(cfg.tippedCashWage)}`, `Texas: no state income tax · minimum wage ${formatCurrency(cfg.minimumWage)} · tipped cash wage ≥ ${formatCurrency(cfg.tippedCashWage)}`)}
          </p>
        </section>
      </div>
    </div>
  )
}
