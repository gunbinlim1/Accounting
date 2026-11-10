export type PayType = 'salary' | 'hourly' | 'tipped'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export type RoleId = 'server' | 'bartender' | 'host' | 'busser' | 'runner' | 'cook' | 'dishwasher' | 'manager'

export type FilingStatus = 'single' | 'married' | 'hoh'

/** Form W-4 (2020 이후 양식) 주요 항목 */
export interface W4 {
  /** Step 1(c) */
  filingStatus: FilingStatus
  /** Step 2(c) 복수 직장/맞벌이 체크 */
  multipleJobs: boolean
  /** Step 3 부양가족 공제액 (연간 $) */
  dependentsAmount: number
  /** Step 4(a) 기타 소득 (연간 $) */
  otherIncome: number
  /** Step 4(b) 추가 공제 (연간 $) */
  deductions: number
  /** Step 4(c) 회당 추가 원천징수 ($) */
  extraWithholding: number
  /** 면세(Exempt) 신청 */
  exempt: boolean
  /** 서명일 YYYY-MM-DD */
  signedDate: string
}

export type CitizenshipStatus = 'citizen' | 'national' | 'lpr' | 'authorized'

export interface I9Document {
  title: string
  issuer: string
  /** 보안상 뒤 4자리만 저장 */
  numberLast4: string
  expires?: string
}

/** Form I-9 주요 항목 */
export interface I9 {
  /** Section 1 */
  citizenship: CitizenshipStatus
  /** LPR/취업허가자: A-Number 또는 USCIS 번호 뒤 4자리 */
  uscisLast4?: string
  /** 취업허가 만료일 (authorized인 경우) */
  workAuthExpires?: string
  section1Date?: string
  /** Section 2: 고용주 서류 확인 */
  documentPath: 'A' | 'BC'
  documents: I9Document[]
  section2Date?: string
}

export interface Address {
  street: string
  city: string
  state: string
  zip: string
}

export interface Employee {
  id: string
  name: string
  role: RoleId
  payType: PayType
  /** salary: 연봉, hourly/tipped: 시급(현금 지급분) */
  rate: number
  /** 401(k) 세전 공제 비율 (0.05 = 5%) */
  pretaxDeferralRate: number
  active: boolean
  hireDate: string
  /** 보안상 SSN은 뒤 4자리만 저장 */
  ssnLast4: string
  dateOfBirth?: string
  email?: string
  phone?: string
  address: Address
  /** null이면 W-4 미제출 → IRS 규정상 Single·조정 없음으로 원천징수 */
  w4: W4 | null
  i9: I9
}

/** 급여 기간별 근무·팁 입력 */
export interface TimeEntry {
  regular: number
  overtime: number
  /** 직원이 신고한 현금 팁 (이미 직원이 받음) */
  cashTips: number
  /** 카드 팁 (급여로 지급) */
  cardTips: number
  /**
   * 이번 회차에만 적용할 급여 금액 (비우면 직원 기본값).
   * hourly/tipped: 시급, salary: 회당 급여
   */
  rate?: number
}

export interface YtdTotals {
  /** FICA 대상 총급여 (팁 포함) */
  gross: number
  futaWages: number
  sutaWages: number
}

export interface PayrollInput {
  employee: Employee
  payFrequency: PayFrequency
  time?: Partial<TimeEntry>
  ytd?: Partial<YtdTotals>
}

export interface PayrollResult {
  employeeId: string
  hours: number
  // ── 지급 항목
  regularPay: number
  overtimePay: number
  /** 팁 포함 시급이 최저임금 미달 시 고용주가 보전한 금액 */
  tipMakeUp: number
  cashTips: number
  cardTips: number
  /** 과세 총급여 = 위 항목 합계 */
  grossPay: number
  // ── 공제 (실제 원천징수액)
  pretaxDeductions: number
  federalTaxableWages: number
  federalWithholding: number
  socialSecurity: number
  medicare: number
  /** 급여가 부족해 원천징수하지 못한 FICA (W-2 Box 12 A/B) */
  uncollectedFica: number
  totalDeductions: number
  /** 실제 수표/계좌 입금액 (현금 팁 제외) */
  netPay: number
  // ── 고용주 부담
  employerSocialSecurity: number
  employerMedicare: number
  futa: number
  suta: number
  employerTaxes: number
  /** 고용주 현금 지출: 임금(현금팁 제외) + 고용주 세금 */
  employerCost: number
  /** Section 45B FICA 팁 크레딧 추정액 */
  tipCredit45B: number
  // ── W-2 보고용 (2026~)
  qualifiedOvertimePremium: number
}

export interface PayRun {
  id: string
  /** YYYY-MM-DD */
  payDate: string
  approvedAt: string
  time: Record<string, TimeEntry>
  results: PayrollResult[]
}
