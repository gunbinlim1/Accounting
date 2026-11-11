/**
 * Supabase 테이블 행 ↔ 앱 객체 변환 (순수 함수)
 * 테이블 구조는 supabase/migrations/20261111000000_payroll_schema.sql
 */
import type {
  ActivityEvent, Company, CompanyDoc, CurrentRun, Employee, I9, PaymentRecord, PayrollResult, PayRun, RunSnapshot, TaxDeposit, TimeEntry, W4,
} from '../../types'

const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v))

// ───────── companies

export interface CompanyRow {
  id: string
  legal_name: string
  dba: string
  industry: Company['industry']
  tips_enabled: boolean
  ein: string
  twc_account: string
  suta_rate: number | string
  deposit_schedule: Company['depositSchedule']
  street: string
  city: string
  state: string
  zip: string
  owner_name: string
  owner_email: string
  phone: string
  cutoff_business_days: number
  auth_form8655: 'signed' | 'pending'
  auth_twc_agent: 'signed' | 'pending'
  auth_bank_debit: 'signed' | 'pending'
  documents: CompanyDoc[] | null
  created_at?: string
  firm_seen_at?: string | null
}

export const companyFromRow = (r: CompanyRow): Company => ({
  id: r.id,
  legalName: r.legal_name,
  dba: r.dba || r.legal_name,
  industry: r.industry,
  tipsEnabled: r.tips_enabled,
  ein: r.ein,
  twcAccount: r.twc_account,
  sutaRate: num(r.suta_rate),
  depositSchedule: r.deposit_schedule,
  address: { street: r.street, city: r.city, state: r.state, zip: r.zip },
  ownerName: r.owner_name,
  ownerEmail: r.owner_email,
  phone: r.phone,
  cutoffBusinessDays: r.cutoff_business_days,
  authorizations: { form8655: r.auth_form8655, twcAgent: r.auth_twc_agent, bankDebit: r.auth_bank_debit },
  documents: r.documents ?? [],
  createdAt: r.created_at,
  firmSeenAt: r.firm_seen_at ?? null,
})

/** 고객·회계법인이 바꿀 수 있는 회사 칸 (확인 표시·생성 시각은 제외) */
export const companyToRow = (c: Company): Omit<CompanyRow, 'id' | 'created_at' | 'firm_seen_at'> => ({
  legal_name: c.legalName.trim(),
  dba: c.dba.trim(),
  industry: c.industry,
  tips_enabled: c.tipsEnabled,
  ein: c.ein.trim(),
  twc_account: c.twcAccount.trim(),
  suta_rate: c.sutaRate,
  deposit_schedule: c.depositSchedule,
  street: c.address.street,
  city: c.address.city,
  state: c.address.state,
  zip: c.address.zip,
  owner_name: c.ownerName,
  owner_email: c.ownerEmail.trim().toLowerCase(),
  phone: c.phone,
  cutoff_business_days: c.cutoffBusinessDays,
  auth_form8655: c.authorizations?.form8655 ?? 'pending',
  auth_twc_agent: c.authorizations?.twcAgent ?? 'pending',
  auth_bank_debit: c.authorizations?.bankDebit ?? 'pending',
  documents: c.documents ?? [],
})

// ───────── employees

export interface EmployeeRow {
  id: string
  company_id: string
  first_name: string
  middle_initial: string | null
  last_name: string
  role: string
  job_title: string | null
  pay_type: Employee['payType']
  rate: number | string
  pretax_deferral_rate: number | string
  active: boolean
  hire_date: string
  ssn_last4: string
  date_of_birth: string | null
  email: string | null
  phone: string | null
  street: string
  city: string
  state: string
  zip: string
  w4: W4 | null
  i9: I9
  pay_method: NonNullable<Employee['payMethod']>
  bank_type: 'checking' | 'savings' | null
  routing_last4: string
  account_last4: string
  bank_on_file?: boolean
  ssn_on_file?: boolean
  e_consent: boolean
  documents: Employee['documents'] | null
}

export const employeeFromRow = (r: EmployeeRow): Employee => ({
  id: r.id,
  firstName: r.first_name,
  middleInitial: r.middle_initial ?? undefined,
  lastName: r.last_name,
  role: r.role,
  jobTitle: r.job_title ?? undefined,
  payType: r.pay_type,
  rate: num(r.rate),
  pretaxDeferralRate: num(r.pretax_deferral_rate),
  active: r.active,
  hireDate: r.hire_date,
  ssnLast4: r.ssn_last4,
  ssnOnFile: !!r.ssn_on_file,
  dateOfBirth: r.date_of_birth ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  address: { street: r.street, city: r.city, state: r.state, zip: r.zip },
  w4: r.w4,
  i9: r.i9,
  payMethod: r.pay_method,
  bank:
    r.pay_method === 'direct_deposit' || r.routing_last4 || r.account_last4
      ? { routingLast4: r.routing_last4, accountLast4: r.account_last4, type: r.bank_type ?? 'checking', onFile: !!r.bank_on_file }
      : undefined,
  eConsent: r.e_consent,
  documents: r.documents ?? [],
})

/**
 * 저장할 직원 칸 (전체 SSN·계좌번호는 빼고 set_employee_secrets로 따로 보냄).
 * 뒤 4자리도 함수가 정하므로, 전체 번호를 새로 입력한 경우에는 보내지 않음.
 */
export function employeeToRow(e: Employee, companyId: string): Omit<EmployeeRow, 'bank_on_file' | 'ssn_on_file'> {
  return {
    id: e.id,
    company_id: companyId,
    first_name: e.firstName.trim(),
    middle_initial: e.middleInitial?.trim().toUpperCase() || null,
    last_name: e.lastName.trim(),
    role: e.role,
    job_title: e.jobTitle?.trim() || null,
    pay_type: e.payType,
    rate: e.rate,
    pretax_deferral_rate: e.pretaxDeferralRate,
    active: e.active,
    hire_date: e.hireDate,
    ssn_last4: e.ssnLast4,
    date_of_birth: e.dateOfBirth || null,
    email: e.email?.trim() || null,
    phone: e.phone?.trim() || null,
    street: e.address.street,
    city: e.address.city,
    state: e.address.state,
    zip: e.address.zip,
    w4: e.w4,
    i9: e.i9,
    pay_method: e.payMethod ?? 'client_check',
    bank_type: e.bank?.type ?? null,
    routing_last4: e.bank?.routingLast4 ?? '',
    account_last4: e.bank?.accountLast4 ?? '',
    e_consent: !!e.eConsent,
    documents: e.documents ?? [],
  }
}

/** 새로 입력된 전체 번호 (없으면 null) */
export function secretsOf(e: Employee): { ssn: string | null; routing: string | null; account: string | null } | null {
  const ssn = e.ssnFull?.replace(/\D/g, '') || null
  const routing = e.bank?.routingNumber?.replace(/\D/g, '') || null
  const account = e.bank?.accountNumber?.replace(/[\s-]/g, '') || null
  return ssn || routing || account ? { ssn, routing, account } : null
}

/** 화면 상태에서 전체 번호를 지움 (서버에 저장한 뒤) */
export function withoutSecrets(e: Employee): Employee {
  const { ssnFull, ...rest } = e
  const ssnOnFile = ssnFull ? true : e.ssnOnFile
  if (!rest.bank) return { ...rest, ssnOnFile }
  const { routingNumber, accountNumber, ...bank } = rest.bank
  return { ...rest, ssnOnFile, bank: { ...bank, onFile: routingNumber && accountNumber ? true : bank.onFile } }
}

// ───────── time entries

export interface TimeRow {
  company_id: string
  pay_date: string
  employee_id: string
  regular: number | string
  overtime: number | string
  cash_tips: number | string
  card_tips: number | string
  rate: number | string | null
  fringes: TimeEntry['fringes'] | null
}

export const timeFromRow = (r: TimeRow): TimeEntry => ({
  regular: num(r.regular),
  overtime: num(r.overtime),
  cashTips: num(r.cash_tips),
  cardTips: num(r.card_tips),
  ...(r.rate !== null && r.rate !== undefined ? { rate: num(r.rate) } : {}),
  ...(r.fringes && r.fringes.length ? { fringes: r.fringes } : {}),
})

export const timeToRow = (companyId: string, payDate: string, employeeId: string, t: TimeEntry): TimeRow => ({
  company_id: companyId,
  pay_date: payDate,
  employee_id: employeeId,
  regular: t.regular,
  overtime: t.overtime,
  cash_tips: t.cashTips,
  card_tips: t.cardTips,
  rate: t.rate ?? null,
  fringes: t.fringes ?? [],
})

// ───────── pay runs

export interface RunRow {
  company_id: string
  pay_date: string
  status: CurrentRun['status']
  submitted_at: string | null
  submitted_by: string | null
  note: string | null
  note_en: string | null
  snapshot: RunSnapshot | null
  approved_at: string | null
}

export interface ResultRow {
  company_id: string
  pay_date: string
  employee_id: string
  entry: TimeEntry
  result: PayrollResult
  gross_pay: number | string
  net_pay: number | string
  federal_withholding: number | string
  social_security: number | string
  medicare: number | string
  employer_taxes: number | string
}

export interface PaymentRow {
  company_id: string
  pay_date: string
  employee_id: string
  method: PaymentRecord['method']
  amount: number | string
  status: PaymentRecord['status']
  stub_emailed: boolean
}

export const currentFromRow = (row: RunRow | undefined, payDate: string): CurrentRun =>
  row
    ? {
        payDate: row.pay_date,
        status: row.status,
        submittedAt: row.submitted_at ?? undefined,
        submittedBy: row.submitted_by ?? undefined,
        note: row.note ?? undefined,
        noteEn: row.note_en ?? undefined,
        snapshot: row.snapshot ?? undefined,
      }
    : { payDate, status: 'draft' }

export const currentToRow = (companyId: string, c: CurrentRun): Omit<RunRow, 'approved_at'> => ({
  company_id: companyId,
  pay_date: c.payDate,
  status: c.status,
  submitted_at: c.submittedAt ?? null,
  submitted_by: c.submittedBy ?? null,
  note: c.note ?? null,
  note_en: c.noteEn ?? null,
  snapshot: c.snapshot ?? null,
})

/**
 * 처리된 회차 묶기. 직원 계정은 pay_runs를 볼 수 없으므로 결과 행만으로도 만듦
 */
export function runsFromRows(runs: RunRow[], results: ResultRow[], payments: PaymentRow[]): PayRun[] {
  const dates = new Set([...runs.filter((r) => r.status === 'processed').map((r) => r.pay_date), ...results.map((r) => r.pay_date)])
  return [...dates].sort().map((payDate) => {
    const run = runs.find((r) => r.pay_date === payDate)
    const rs = results.filter((r) => r.pay_date === payDate)
    return {
      id: `run-${payDate}`,
      payDate,
      approvedAt: run?.approved_at ?? `${payDate}T12:00:00.000Z`,
      time: Object.fromEntries(rs.map((r) => [r.employee_id, r.entry])),
      results: rs.map((r) => r.result),
      payments: payments
        .filter((p) => p.pay_date === payDate)
        .map((p) => ({ employeeId: p.employee_id, method: p.method, amount: num(p.amount), status: p.status, stubEmailed: p.stub_emailed })),
    }
  })
}

export const resultToRow = (companyId: string, run: PayRun, r: PayrollResult): ResultRow => ({
  company_id: companyId,
  pay_date: run.payDate,
  employee_id: r.employeeId,
  entry: run.time[r.employeeId] ?? { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 },
  result: r,
  gross_pay: r.grossPay,
  net_pay: r.netPay,
  federal_withholding: r.federalWithholding,
  social_security: r.socialSecurity,
  medicare: r.medicare,
  employer_taxes: r.employerTaxes,
})

export const paymentToRow = (companyId: string, payDate: string, p: PaymentRecord): PaymentRow => ({
  company_id: companyId,
  pay_date: payDate,
  employee_id: p.employeeId,
  method: p.method,
  amount: p.amount,
  status: p.status,
  stub_emailed: p.stubEmailed,
})

// ───────── tax deposits · activity

export interface DepositRow {
  company_id: string
  id: string
  kind: TaxDeposit['kind']
  period: string
  amount: number | string
  due_date: string
  status: TaxDeposit['status']
  paid_at: string | null
}

export const depositFromRow = (r: DepositRow): TaxDeposit => ({
  id: r.id,
  kind: r.kind,
  period: r.period,
  amount: num(r.amount),
  dueDate: r.due_date,
  status: r.status,
  ...(r.paid_at ? { paidAt: r.paid_at } : {}),
})

export const depositToRow = (companyId: string, d: TaxDeposit): DepositRow => ({
  company_id: companyId,
  id: d.id,
  kind: d.kind,
  period: d.period,
  amount: d.amount,
  due_date: d.dueDate,
  status: d.status,
  paid_at: d.paidAt ?? null,
})

export interface ActivityRow {
  id: string
  company_id: string
  at: string
  actor: ActivityEvent['actor']
  actor_name: string
  kind: ActivityEvent['kind']
  ko: string
  en: string
}

export const activityFromRow = (r: ActivityRow): ActivityEvent => ({
  id: r.id, at: r.at, actor: r.actor, actorName: r.actor_name, kind: r.kind, ko: r.ko, en: r.en,
})

export const activityToRow = (companyId: string, a: ActivityEvent): Omit<ActivityRow, 'at'> => ({
  id: a.id, company_id: companyId, actor: a.actor, actor_name: a.actorName, kind: a.kind, ko: a.ko, en: a.en,
})
