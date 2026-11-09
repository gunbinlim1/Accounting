import { companySchedule, payrollConfig, periodsPerYear } from '../config/payrollConfig'
import { formatCurrency, formatCurrencyWhole, formatPercent } from '../lib/format'
import { usePrefs } from '../prefs'
import type { Employee, Hours, PayrollResult } from '../types'
import { segmentsOf } from '../lib/segments'
import BreakdownBar from './BreakdownBar'

interface Props {
  employee: Employee
  result: PayrollResult
  hours?: Hours
}

/** 각 공제 항목을 쉬운 말로 설명하는 급여명세서 */
export default function PayStub({ employee: e, result: r, hours }: Props) {
  const { t } = usePrefs()
  const periods = periodsPerYear[companySchedule.frequency]

  const grossNote =
    e.payType === 'salary'
      ? t(`연봉 ${formatCurrency(e.rate)} ÷ 연 ${periods}회 지급`, `${formatCurrency(e.rate)} salary ÷ ${periods} paychecks`)
      : t(
          `시급 ${formatCurrency(e.rate)} × ${hours?.regular ?? 0}시간` +
            (hours?.overtime ? ` + 초과 ${hours.overtime}시간 × 1.5배` : ''),
          `${formatCurrency(e.rate)}/hr × ${hours?.regular ?? 0}h` + (hours?.overtime ? ` + ${hours.overtime}h overtime × 1.5` : ''),
        )

  const lines = [
    {
      label: t('401(k) 세전 저축', '401(k) pre-tax savings'),
      value: r.pretaxDeductions,
      note: t(
        `급여의 ${formatPercent(e.pretaxDeferralRate, 0)}를 은퇴 계좌에 저축 — 세금을 매기기 전에 빠져서 소득세가 줄어요`,
        `${formatPercent(e.pretaxDeferralRate, 0)} saved for retirement before tax, which lowers income tax`,
      ),
    },
    {
      label: t('연방 소득세', 'Federal income tax'),
      value: r.federalWithholding,
      note: t(
        `과세 소득 ${formatCurrency(r.taxableWages)}에 대한 원천징수 (데모용 임시 ${formatPercent(payrollConfig.federalWithholdingRate, 0)})`,
        `Withheld on ${formatCurrency(r.taxableWages)} taxable wages (demo flat ${formatPercent(payrollConfig.federalWithholdingRate, 0)})`,
      ),
    },
    {
      label: t('주 소득세', 'State income tax'),
      value: r.stateWithholding,
      note: t(
        `주 정부 소득세 원천징수 (데모용 임시 ${formatPercent(payrollConfig.stateWithholdingRate, 0)})`,
        `State withholding (demo flat ${formatPercent(payrollConfig.stateWithholdingRate, 0)})`,
      ),
    },
    {
      label: 'Social Security',
      value: r.socialSecurity,
      note: t(
        `은퇴·장애 연금 재원 ${formatPercent(payrollConfig.socialSecurityRate)} — 연 ${formatCurrencyWhole(payrollConfig.socialSecurityWageBase)}까지만 부과`,
        `${formatPercent(payrollConfig.socialSecurityRate)} for retirement & disability benefits, up to ${formatCurrencyWhole(payrollConfig.socialSecurityWageBase)}/yr`,
      ),
    },
    {
      label: 'Medicare',
      value: r.medicare,
      note: t(
        `노년 의료보험 ${formatPercent(payrollConfig.medicareRate, 2)} — 상한 없음`,
        `${formatPercent(payrollConfig.medicareRate, 2)} for senior healthcare, no cap`,
      ),
    },
  ]

  return (
    <div className="stub">
      <div className="stub-head">
        <div>
          <div className="muted small">{t('총급여', 'Gross pay')}</div>
          <div className="stub-gross">{formatCurrency(r.grossPay)}</div>
          <div className="muted small">{grossNote}</div>
        </div>
        <div className="stub-net">
          <div className="muted small">{t('통장에 들어가는 돈', 'Lands in the bank')}</div>
          <div className="stub-net-value">{formatCurrency(r.netPay)}</div>
        </div>
      </div>

      <BreakdownBar segments={segmentsOf(r)} legend={false} />

      <ul className="stub-lines">
        {lines.map((l) =>
          l.value > 0 ? (
            <li key={l.label}>
              <div className="stub-line-main">
                <span>{l.label}</span>
                <span className="num">−{formatCurrency(l.value)}</span>
              </div>
              <div className="muted small">{l.note}</div>
            </li>
          ) : null,
        )}
      </ul>

      <div className="stub-employer">
        <span>
          {t('회사가 별도로 내는 세금', 'Employer also pays')}: SS {formatCurrency(r.employerSocialSecurity)} + Medicare{' '}
          {formatCurrency(r.employerMedicare)}
        </span>
        <span className="num">
          {t('총 인건비', 'Total cost')} <strong>{formatCurrency(r.employerCost)}</strong>
        </span>
      </div>
    </div>
  )
}
