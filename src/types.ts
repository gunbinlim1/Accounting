export type PayType = 'salary' | 'hourly' | 'tipped'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

/** 직무 템플릿 ID (업종별 목록은 src/config/industries.ts) */
export type RoleId = string

/** 고객사 업종 — 업종에 따라 직무 템플릿·급여 형태·팁 기능이 달라짐 */
export type Industry = 'restaurant' | 'service' | 'retail' | 'manufacturing'

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
  /** 고용주가 받은 서류 사본 (파일 자체는 서버 단계에서 보관, 데모는 기록만) */
  copy?: DocCopy
}

export interface DocCopy {
  fileName: string
  uploadedAt: string
  /** 저장소(payroll-docs 버킷) 경로 */
  path?: string
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
  /** 법적 이름 (W-4 Step 1a·I-9 Section 1과 동일) */
  firstName: string
  /** 미들네임 첫 글자 (선택) */
  middleInitial?: string
  lastName: string
  role: RoleId
  /** 직함 직접 입력 (비우면 직무 템플릿 이름) */
  jobTitle?: string
  payType: PayType
  /** salary: 연봉, hourly/tipped: 시급(현금 지급분) */
  rate: number
  /** 401(k) 세전 공제 비율 (0.05 = 5%) */
  pretaxDeferralRate: number
  active: boolean
  hireDate: string
  /** 화면 표시용 SSN 뒤 4자리 */
  ssnLast4: string
  /** 새로 입력한 SSN 9자리 — 저장 시 서버에서 암호화하고 메모리에서 지움 */
  ssnFull?: string
  /** SSN 전체가 서버에 암호화 저장되어 있음 */
  ssnOnFile?: boolean
  dateOfBirth?: string
  email?: string
  phone?: string
  address: Address
  /** null이면 W-4 미제출 → IRS 규정상 Single·조정 없음으로 원천징수 */
  w4: W4 | null
  i9: I9
  /** 급여 지급 방식 (기본: 고객 수표) */
  payMethod?: PayMethod
  /** 직접입금 계좌 (보안상 뒤 4자리만) */
  bank?: BankAccount
  /** 급여명세서·W-2 전자 수령 동의 */
  eConsent?: boolean
  /** 업로드한 서류 기록 (파일 자체는 서버 단계에서 보관) */
  documents?: UploadedDoc[]
}

/** 1) 고객이 직접 수표 발행 2) 회계법인이 수표 인쇄 3) 직접입금 */
export type PayMethod = 'client_check' | 'firm_check' | 'direct_deposit'

export interface BankAccount {
  /** ACH 직접입금에 필요한 전체 번호 (2단계 서버에서는 암호화 보관) */
  routingNumber?: string
  accountNumber?: string
  /** 화면 표시용 뒤 4자리 */
  routingLast4: string
  accountLast4: string
  type: 'checking' | 'savings'
  /** 전체 번호가 서버에 암호화 저장되어 있음 */
  onFile?: boolean
}

export interface UploadedDoc {
  kind: 'W-4' | 'I-9'
  fileName: string
  uploadedAt: string
  /** 자동 입력된 칸 수 */
  autoFilled: number
  /** 저장소 경로 */
  path?: string
}

/** Fringe Benefit 한 건 (현금이 아닌 혜택의 가치) */
export interface FringeEntry {
  id: string
  itemId: string
  amount: number
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
  /** 이번 회차 Fringe Benefit */
  fringes?: FringeEntry[]
}

export interface YtdTotals {
  /** FICA 대상 임금 누적 (팁·과세 Fringe 포함) */
  gross: number
  futaWages: number
  sutaWages: number
  /** Fringe 항목별 연간 누적 (한도 계산용) */
  fringe: Record<string, number>
}

export interface PayrollInput {
  employee: Employee
  payFrequency: PayFrequency
  time?: Partial<TimeEntry>
  ytd?: Partial<YtdTotals>
  /** 고객사 TWC 세율 (없으면 기본값) */
  sutaRate?: number
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
  // ── Fringe Benefit
  fringeTotal: number
  /** FICA 대상 임금 (총급여 + 과세 Fringe) */
  ficaWages: number
  /** FUTA·TWC 대상 임금 */
  futaWages: number
  /** W-2 Box 1 (연방 과세 임금) */
  box1Wages: number
  fringeLines: FringeLine[]
}

export interface FringeLine {
  itemId: string
  amount: number
  /** 연방 소득세 과세분 */
  fit: number
  fica: number
  futa: number
}

export interface PayRun {
  id: string
  /** YYYY-MM-DD */
  payDate: string
  approvedAt: string
  time: Record<string, TimeEntry>
  results: PayrollResult[]
  /** 직원별 지급 처리 결과 */
  payments?: PaymentRecord[]
}

export interface PaymentRecord {
  employeeId: string
  method: PayMethod
  amount: number
  status: 'ready_for_client' | 'check_printed' | 'deposit_scheduled'
  /** 급여명세서 이메일 발송 여부 (전자 수령 동의 + 이메일) */
  stubEmailed: boolean
}

export type TaxKind = 'federal' | 'futa' | 'twc'

/** 회계법인이 고객 대신 납부하는 세금 (고객 계좌에서 인출) */
export interface TaxDeposit {
  id: string
  kind: TaxKind
  /** 대상 기간 표시 (예: 2026-11-13 급여, 2026 Q3) */
  period: string
  amount: number
  dueDate: string
  status: 'scheduled' | 'paid'
  paidAt?: string
}

// ───────── 고객 포털 ─────────

export type RunStatus = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'processed'

export type DepositSchedule = 'monthly' | 'semiweekly'

/** 고객사 정보 */
export interface Company {
  id: string
  legalName: string
  dba: string
  /** 업종 — 포털 생성 시 선택 */
  industry: Industry
  /** 팁 받는 직원 운영 여부 (팁 크레딧·팁 입력·45B). 업종 기본값에서 시작 */
  tipsEnabled: boolean
  /** 연방 고용주 번호 XX-XXXXXXX */
  ein: string
  /** 텍사스 TWC 계정번호 */
  twcAccount: string
  /** TWC 통지 실업세율 (0.027 = 2.7%) */
  sutaRate: number
  depositSchedule: DepositSchedule
  address: Address
  ownerName: string
  ownerEmail: string
  phone: string
  /** 지급일 몇 영업일 전까지 제출 */
  cutoffBusinessDays: number
  /** 회계법인 대리 신고·납부 위임 상태 */
  authorizations?: Authorizations
  /** 업로드한 회사 서류 (SS-4·CP 575, TWC 통지서) */
  documents?: CompanyDoc[]
}

export interface CompanyDoc {
  kind: 'EIN' | 'TWC'
  fileName: string
  uploadedAt: string
  /** 자동 입력된 항목 */
  filled: string[]
  /** 저장소 경로 */
  path?: string
}

export interface Authorizations {
  /** IRS Form 8655 Reporting Agent Authorization */
  form8655: 'signed' | 'pending'
  /** 텍사스 TWC 대리인 권한 */
  twcAgent: 'signed' | 'pending'
  /** 급여·세금 대행 납부용 고객 계좌 인출 동의 */
  bankDebit: 'signed' | 'pending'
}

export interface ActivityEvent {
  id: string
  at: string
  actor: 'client' | 'firm'
  actorName: string
  ko: string
  en: string
  kind: 'submit' | 'recall' | 'review' | 'changes' | 'processed' | 'employee' | 'settings' | 'reminder'
}

/** 제출 시점에 고정한 급여 자료 — 제출 후 직원 정보가 바뀌어도 검토 대상은 그대로 */
export interface RunSnapshot {
  employees: Employee[]
  time: Record<string, TimeEntry>
  results: PayrollResult[]
}

export interface CurrentRun {
  payDate: string
  status: RunStatus
  submittedAt?: string
  submittedBy?: string
  /** 회계법인이 남긴 수정 요청 메모 (작성한 언어 그대로) */
  note?: string
  /** 수정 요청 메모의 영어 문구 (있으면 영어 화면에서 사용) */
  noteEn?: string
  snapshot?: RunSnapshot
}

export interface CompanyData {
  company: Company
  employees: Employee[]
  time: Record<string, TimeEntry>
  runs: PayRun[]
  current: CurrentRun
  activity: ActivityEvent[]
  deposits: TaxDeposit[]
}

export type Session =
  | { role: 'client'; companyId: string; name: string; email: string }
  | { role: 'firm'; name: string; email: string; title?: string }
  | { role: 'employee'; companyId: string; employeeId: string; name: string; email: string }
