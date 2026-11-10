import { companySchedule, payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { formatCurrency, formatCurrencyWhole, formatPercent } from '../lib/format'
import { tipCreditRate, tippedOvertimeRate } from '../lib/payroll'
import { filingLabel } from '../lib/labels'
import { segmentsOf } from '../lib/segments'
import { usePrefs } from '../prefs'
import type { Employee, PayrollResult, TimeEntry } from '../types'
import { fringeById } from '../config/fringeBenefits'
import BreakdownBar from './BreakdownBar'

interface Props {
  employee: Employee
  result: PayrollResult
  time?: TimeEntry
}

interface Line {
  label: string
  value: number
  note?: string
}

/** 각 항목을 쉬운 말로 설명하는 레스토랑 급여명세서 */
export default function PayStub({ employee: e, result: r, time }: Props) {
  const { t } = usePrefs()
  const periods = periodsPerYear[companySchedule.frequency]
  const reg = time?.regular ?? 0
  const ot = time?.overtime ?? 0

  const earnings: Line[] =
    e.payType === 'salary'
      ? [{ label: t('기본급', 'Salary'), value: r.regularPay, note: t(`연봉 ${formatCurrencyWhole(e.rate)} ÷ ${periods}회`, `${formatCurrencyWhole(e.rate)} ÷ ${periods} paychecks`) }]
      : [
          {
            label: t('정규 근무', 'Regular'),
            value: r.regularPay,
            note:
              e.payType === 'tipped'
                ? t(`현금 시급 ${formatCurrency(e.rate)} × ${reg}h — 팁 크레딧 ${formatCurrency(tipCreditRate(e.rate))}/h 적용`, `${formatCurrency(e.rate)} cash wage × ${reg}h with ${formatCurrency(tipCreditRate(e.rate))}/h tip credit`)
                : `${formatCurrency(e.rate)} × ${reg}h`,
          },
          {
            label: t('초과근무 (OT)', 'Overtime'),
            value: r.overtimePay,
            note:
              e.payType === 'tipped'
                ? t(`${ot}h × ${formatCurrency(tippedOvertimeRate(e.rate))} (= $7.25 × 1.5 − 팁 크레딧)`, `${ot}h × ${formatCurrency(tippedOvertimeRate(e.rate))} ($7.25 × 1.5 − tip credit)`)
                : `${ot}h × ${formatCurrency(e.rate * 1.5)} (1.5×)`,
          },
          {
            label: t('최저임금 보전', 'Tip credit make-up'),
            value: r.tipMakeUp,
            note: t('팁을 합쳐도 시간당 $7.25에 못 미쳐 회사가 차액을 지급', 'Tips fell short of $7.25/h, so the employer pays the difference'),
          },
          { label: t('카드 팁', 'Card tips'), value: r.cardTips, note: t('손님이 카드로 낸 팁 — 이번 급여로 지급', 'Paid out on this check') },
          { label: t('현금 팁 (신고분)', 'Cash tips (reported)'), value: r.cashTips, note: t('이미 받은 돈이라 입금액에서는 빠지지만, 세금 계산에는 포함', 'Already in hand — taxed, but not paid again') },
        ]

  const w4 = e.w4
  const deductions: Line[] = [
    { label: t('401(k) 세전 저축', '401(k) pre-tax'), value: r.pretaxDeductions, note: t(`급여의 ${formatPercent(e.pretaxDeferralRate, 0)} — 연방 소득세 과세소득을 줄여 줌`, `${formatPercent(e.pretaxDeferralRate, 0)} of pay; lowers federal taxable income`) },
    {
      label: t('연방 소득세', 'Federal income tax'),
      value: r.federalWithholding,
      note: w4
        ? w4.exempt
          ? t('W-4 면세(Exempt) 신청', 'Exempt on W-4')
          : t(`W-4: ${filingLabel(w4.filingStatus, t)}${w4.multipleJobs ? ' · 복수 직장' : ''}${w4.dependentsAmount ? ` · 부양가족 ${formatCurrencyWhole(w4.dependentsAmount)}` : ''} — IRS 2026 퍼센트 방식`, `W-4: ${filingLabel(w4.filingStatus, t)}${w4.multipleJobs ? ' · multiple jobs' : ''}${w4.dependentsAmount ? ` · dependents ${formatCurrencyWhole(w4.dependentsAmount)}` : ''} — IRS 2026 percentage method`)
        : t('W-4 미제출 → Single, 조정 없음으로 계산', 'No W-4 on file → Single, no adjustments'),
    },
    { label: 'Social Security', value: r.socialSecurity, note: t(`6.2% — 팁 포함 총급여 기준, 연 ${formatCurrencyWhole(cfg.socialSecurityWageBase)}까지`, `6.2% of gross incl. tips, up to ${formatCurrencyWhole(cfg.socialSecurityWageBase)}/yr`) },
    { label: 'Medicare', value: r.medicare, note: t('1.45% — 상한 없음', '1.45%, no cap') },
  ]

  return (
    <div className="stub">
      <div className="stub-head">
        <div>
          <div className="muted small">{t('총급여 (팁 포함)', 'Gross pay (incl. tips)')}</div>
          <div className="stub-gross">{formatCurrency(r.grossPay)}</div>
          {r.hours > 0 && (
            <div className="muted small">
              {t('팁 포함 시간당', 'Effective')} {formatCurrency(r.grossPay / r.hours)}/h · {r.hours}h
            </div>
          )}
        </div>
        <div className="stub-net">
          <div className="muted small">{t('급여 입금액', 'Paycheck')}</div>
          <div className="stub-net-value">{formatCurrency(r.netPay)}</div>
          {r.cashTips > 0 && (
            <div className="muted small">
              + {t('현금 팁', 'cash tips')} {formatCurrency(r.cashTips)}
            </div>
          )}
        </div>
      </div>

      <BreakdownBar segments={segmentsOf(r)} legend={false} />

      <div className="stub-cols">
        <section>
          <h3>{t('지급', 'Earnings')}</h3>
          <ul className="stub-lines">
            {earnings.filter((l) => l.value > 0).map((l) => (
              <li key={l.label}>
                <div className="stub-line-main">
                  <span>{l.label}</span>
                  <span className="num">{formatCurrency(l.value)}</span>
                </div>
                {l.note && <div className="muted small">{l.note}</div>}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t('공제', 'Deductions')}</h3>
          <ul className="stub-lines">
            {deductions.filter((l) => l.value > 0 || l.label === 'Social Security').map((l) => (
              <li key={l.label}>
                <div className="stub-line-main">
                  <span>{l.label}</span>
                  <span className="num">−{formatCurrency(l.value)}</span>
                </div>
                {l.note && <div className="muted small">{l.note}</div>}
              </li>
            ))}
            <li>
              <div className="stub-line-main">
                <span>{t('텍사스 주 소득세', 'Texas income tax')}</span>
                <span className="num">$0.00</span>
              </div>
              <div className="muted small">{t('텍사스는 주 소득세가 없습니다', 'Texas has no state income tax')}</div>
            </li>
            {r.uncollectedFica > 0 && (
              <li className="stub-alert">
                {t(
                  `급여가 부족해 FICA ${formatCurrency(r.uncollectedFica)}을 떼지 못했습니다. 직원에게 받거나 W-2 Box 12(A/B)에 미징수액으로 보고합니다.`,
                  `${formatCurrency(r.uncollectedFica)} FICA couldn't be withheld. Collect it or report it as uncollected on W-2 Box 12 (A/B).`,
                )}
              </li>
            )}
          </ul>
        </section>
      </div>

      {(r.fringeLines ?? []).length > 0 && (
        <section className="stub-fringe">
          <h3>{t('Fringe Benefit (현금 지급 아님 · 과세 대상만 세금에 반영)', 'Fringe benefits (not cash · only taxable value is taxed)')}</h3>
          <ul className="stub-lines">
            {r.fringeLines.map((l, i) => {
              const item = fringeById(l.itemId)
              const tags = [l.fit > 0 && t('소득세', 'income tax'), l.fica > 0 && 'FICA', l.futa > 0 && 'FUTA'].filter(Boolean)
              return (
                <li key={`${l.itemId}-${i}`}>
                  <div className="stub-line-main">
                    <span>{item ? t(item.ko, item.en) : l.itemId}</span>
                    <span className="num">{formatCurrency(l.amount)}</span>
                  </div>
                  <div className="muted small">
                    {tags.length ? t(`과세: ${tags.join('·')}`, `Taxed: ${tags.join(', ')}`) : t('면제', 'Exempt')}
                    {item && ` — ${t(item.noteKo, item.noteEn)}`}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="stub-employer">
        <div>
          <strong>{t('회사 부담', 'Employer side')}</strong>
          <span>
            SS {formatCurrency(r.employerSocialSecurity)} · Medicare {formatCurrency(r.employerMedicare)} · FUTA {formatCurrency(r.futa)} · TWC {formatCurrency(r.suta)}
          </span>
          {r.tipCredit45B > 0 && (
            <span className="good-text">
              {t(`45B 팁 크레딧으로 돌려받을 수 있는 금액 ≈ ${formatCurrency(r.tipCredit45B)}`, `≈ ${formatCurrency(r.tipCredit45B)} recoverable via the 45B FICA tip credit`)}
            </span>
          )}
          {(r.qualifiedOvertimePremium > 0 || r.cashTips + r.cardTips > 0) && (
            <span className="muted">
              {t('W-2 보고(2026~): ', 'W-2 reporting (2026+): ')}
              {r.cashTips + r.cardTips > 0 && `${t('팁', 'tips')} ${formatCurrency(r.cashTips + r.cardTips)}`}
              {r.qualifiedOvertimePremium > 0 && r.cashTips + r.cardTips > 0 && ' · '}
              {r.qualifiedOvertimePremium > 0 && `${t('OT 프리미엄', 'OT premium')} ${formatCurrency(r.qualifiedOvertimePremium)}`}
            </span>
          )}
        </div>
        <span className="num">
          {t('인건비', 'Labor cost')} <strong>{formatCurrency(r.employerCost)}</strong>
        </span>
      </div>
    </div>
  )
}
