import type { FilingStatus, PayFrequency } from '../types'

/**
 * 2026 급여세 설정 — 연방 + 텍사스.
 * 매년 IRS Pub. 15-T, SSA, TWC 공지로 갱신하세요.
 */
export const payrollConfig = {
  taxYear: 2026,

  // FICA
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184_500,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: 200_000,

  // FUTA: 6.0% − 주 실업세 공제 5.4% = 0.6% (텍사스는 credit reduction 주 아님)
  futaRate: 0.006,
  futaWageBase: 7_000,

  // 텍사스: 주 소득세 없음. TWC 실업세는 고용주만 부담
  state: 'TX',
  stateIncomeTax: false,
  sutaRate: 0.027, // 신규 고용주 기본 세율 — TWC 통지 세율로 변경
  sutaWageBase: 9_000,

  // FLSA (텍사스는 연방 최저임금 적용)
  minimumWage: 7.25,
  tippedCashWage: 2.13,
  maxTipCredit: 5.12,
  overtimeMultiplier: 1.5,
  /** FLSA 화이트칼라 면제 최저 급여 (주 $684 = 연 $35,568) */
  exemptSalaryWeekly: 684,
  /** Section 45B 크레딧 기준 최저임금 (1/1/2007 기준 $5.15) */
  section45BWage: 5.15,
} as const

interface Bracket {
  /** 이 구간이 시작되는 과세소득 */
  over: number
  rate: number
}

/** 2026 연방 소득세 구간 (Rev. Proc. 2025-32) */
export const federalBrackets: Record<FilingStatus, Bracket[]> = {
  single: [
    { over: 0, rate: 0.1 },
    { over: 12_400, rate: 0.12 },
    { over: 50_400, rate: 0.22 },
    { over: 105_700, rate: 0.24 },
    { over: 201_775, rate: 0.32 },
    { over: 256_225, rate: 0.35 },
    { over: 640_600, rate: 0.37 },
  ],
  married: [
    { over: 0, rate: 0.1 },
    { over: 24_800, rate: 0.12 },
    { over: 100_800, rate: 0.22 },
    { over: 211_400, rate: 0.24 },
    { over: 403_550, rate: 0.32 },
    { over: 512_450, rate: 0.35 },
    { over: 768_700, rate: 0.37 },
  ],
  hoh: [
    { over: 0, rate: 0.1 },
    { over: 17_700, rate: 0.12 },
    { over: 67_450, rate: 0.22 },
    { over: 105_700, rate: 0.24 },
    { over: 201_750, rate: 0.32 },
    { over: 256_200, rate: 0.35 },
    { over: 640_600, rate: 0.37 },
  ],
}

/** 2026 표준공제 */
export const standardDeduction: Record<FilingStatus, number> = {
  single: 16_100,
  married: 32_200,
  hoh: 24_150,
}

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
