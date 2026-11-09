import type { PayFrequency } from '../types'

/**
 * 급여 계산 설정값.
 *
 * ⚠️ 연방/주 원천징수는 단순 정률(placeholder)입니다. 실제 신고·지급에 쓰기 전에
 * IRS Publication 15-T 및 해당 주의 원천징수 표로 교체해야 합니다.
 * FICA 요율과 Social Security 상한액은 매년 확인해 갱신하세요.
 */
export const payrollConfig = {
  taxYear: 2026,
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184_500,
  medicareRate: 0.0145,
  /** placeholder: 실제 W-4 기반 계산으로 교체 필요 */
  federalWithholdingRate: 0.12,
  /** placeholder: 주별 원천징수 규칙으로 교체 필요 */
  stateWithholdingRate: 0.05,
  overtimeMultiplier: 1.5,
} as const

/** 회사 급여 일정: 격주 금요일, 기준일부터 14일 간격 */
export const companySchedule = {
  frequency: 'biweekly' as PayFrequency,
  anchorDate: '2026-01-09',
}

export const periodsPerYear: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

/** 지급 주기별 표준 정규 근무시간 (주 40시간 기준) */
export const standardHours: Record<PayFrequency, number> = {
  weekly: 40,
  biweekly: 80,
  semimonthly: 86.67,
  monthly: 173.33,
}
