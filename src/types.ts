export type PayType = 'salary' | 'hourly'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export interface Employee {
  id: string
  name: string
  department: string
  payType: PayType
  /** salary: 연봉(USD), hourly: 시급(USD) */
  rate: number
  /** 401(k) 등 세전 공제 비율 (0.05 = 5%) */
  pretaxDeferralRate: number
  active: boolean
}

export interface Hours {
  regular: number
  overtime: number
}

export interface PayrollInput {
  employee: Employee
  payFrequency: PayFrequency
  /** 시급 근로자의 정규 근무시간 */
  regularHours?: number
  /** 시급 근로자의 초과 근무시간 */
  overtimeHours?: number
  /** 이번 지급 전까지의 연간 누적 총급여 (Social Security 상한 계산용) */
  ytdGross?: number
}

export interface PayrollResult {
  employeeId: string
  grossPay: number
  pretaxDeductions: number
  taxableWages: number
  federalWithholding: number
  stateWithholding: number
  socialSecurity: number
  medicare: number
  totalDeductions: number
  netPay: number
  /** 회사 부담분 */
  employerSocialSecurity: number
  employerMedicare: number
  /** 총급여 + 회사 부담 세금 */
  employerCost: number
}

export interface PayRun {
  id: string
  /** YYYY-MM-DD */
  payDate: string
  approvedAt: string
  hours: Record<string, Hours>
  results: PayrollResult[]
}
