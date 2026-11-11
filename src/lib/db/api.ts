/**
 * Supabase 읽기·쓰기. 모든 권한 판단은 DB의 RLS가 하고, 여기서는 요청만 보냄.
 */
import type { CompanyData, Session } from '../../types'
import { DOCS_BUCKET, db } from '../supabase'
import {
  activityFromRow, companyFromRow, currentFromRow, depositFromRow, employeeFromRow, runsFromRows, timeFromRow,
  type ActivityRow, type CompanyRow, type DepositRow, type EmployeeRow, type PaymentRow, type ResultRow, type RunRow, type TimeRow,
} from './mappers'
import type { Write } from './plan'

const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** 이 계정의 역할 판단 (2단계 인증 후). 초대 연결도 함께 처리 */
export async function resolveSession(): Promise<Session | null> {
  const client = db()
  const { data: u } = await client.auth.getUser()
  const user = u.user
  if (!user) return null
  const email = user.email ?? ''
  await client.rpc('claim_invites')

  const staff = must(await client.from('firm_staff').select('name, title').eq('user_id', user.id).maybeSingle()) as { name: string; title: string | null } | null
  if (staff) return { role: 'firm', name: staff.name, email, title: staff.title ?? undefined }

  const member = must(
    await client.from('company_members').select('company_id, companies(owner_name)').eq('user_id', user.id).order('created_at').limit(1).maybeSingle(),
  ) as { company_id: string; companies: { owner_name: string } | null } | null
  if (member) return { role: 'client', companyId: member.company_id, name: member.companies?.owner_name || email, email }

  const emp = must(
    await client.from('employees').select('id, company_id, first_name, last_name').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle(),
  ) as { id: string; company_id: string; first_name: string; last_name: string } | null
  if (emp) return { role: 'employee', companyId: emp.company_id, employeeId: emp.id, name: `${emp.first_name} ${emp.last_name}`, email }

  return null
}

/** 이 계정이 볼 수 있는 모든 고객사 데이터 (RLS가 범위를 정함) */
export async function loadCompanies(payDate: string): Promise<CompanyData[]> {
  const client = db()
  const [companies, employees, time, runs, results, payments, deposits, activity] = await Promise.all([
    client.from('companies').select('*').order('dba'),
    client.from('employees').select('*').order('last_name'),
    client.from('time_entries').select('*').eq('pay_date', payDate),
    client.from('pay_runs').select('*'),
    client.from('pay_results').select('*'),
    client.from('payments').select('*'),
    client.from('tax_deposits').select('*').order('due_date'),
    client.from('activity').select('*').order('at', { ascending: false }).limit(2000),
  ])
  const C = must(companies) as CompanyRow[]
  const E = must(employees) as EmployeeRow[]
  const T = must(time) as TimeRow[]
  const R = must(runs) as RunRow[]
  const RS = must(results) as ResultRow[]
  const P = must(payments) as PaymentRow[]
  const D = must(deposits) as DepositRow[]
  const A = must(activity) as ActivityRow[]

  return C.map((c) => {
    const byCo = <X extends { company_id: string }>(xs: X[]) => xs.filter((x) => x.company_id === c.id)
    const coRuns = byCo(R)
    return {
      company: companyFromRow(c),
      employees: byCo(E).map(employeeFromRow),
      time: Object.fromEntries(byCo(T).map((t) => [t.employee_id, timeFromRow(t)])),
      runs: runsFromRows(coRuns, byCo(RS), byCo(P)),
      current: currentFromRow(coRuns.find((r) => r.pay_date === payDate), payDate),
      deposits: byCo(D).map(depositFromRow),
      activity: byCo(A).map(activityFromRow),
    }
  })
}

/** 쓰기 하나 실행 */
export async function runWrite(w: Write): Promise<void> {
  const client = db()
  switch (w.kind) {
    case 'company':
      must(await client.from('companies').update(w.row).eq('id', w.id))
      return
    case 'employee':
      if (w.isNew) must(await client.from('employees').insert(w.row))
      else {
        const { id, company_id: _c, ...rest } = w.row
        void _c
        must(await client.from('employees').update(rest).eq('id', id))
      }
      return
    case 'secrets':
      must(await client.rpc('set_employee_secrets', { p_employee_id: w.employeeId, p_ssn: w.ssn, p_routing: w.routing, p_account: w.account }))
      return
    case 'time':
      must(await client.from('time_entries').upsert(w.row))
      return
    case 'run':
      must(await client.from('pay_runs').upsert(w.row))
      return
    case 'processed':
      must(await client.from('pay_runs').upsert({ company_id: w.companyId, pay_date: w.payDate, status: 'processed', approved_at: w.approvedAt }))
      must(await client.from('pay_results').delete().eq('company_id', w.companyId).eq('pay_date', w.payDate))
      if (w.results.length) must(await client.from('pay_results').insert(w.results))
      must(await client.from('payments').delete().eq('company_id', w.companyId).eq('pay_date', w.payDate))
      if (w.payments.length) must(await client.from('payments').insert(w.payments))
      return
    case 'deposit':
      must(await client.from('tax_deposits').upsert(w.row))
      return
    case 'activity':
      must(await client.from('activity').insert(w.row))
      return
  }
}

/** 대표가 자기 회사 포털을 만듦 (회사 + 구성원) */
export async function createOwnCompany(row: Record<string, unknown>): Promise<string> {
  return must(await db().rpc('create_company', { company: row })) as string
}

/** 회계법인이 고객사를 추가 (대표는 같은 이메일로 가입하면 자동 연결) */
export async function createClientCompany(row: Record<string, unknown>): Promise<string> {
  const data = must(await db().from('companies').insert(row).select('id').single()) as { id: string }
  return data.id
}

/** 회계법인: 새로 가입한 고객사를 확인함 */
export async function markCompanySeen(id: string): Promise<void> {
  must(await db().from('companies').update({ firm_seen_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteCompany(id: string): Promise<void> {
  must(await db().from('companies').delete().eq('id', id))
}

/** 파일 업로드 → 저장소 경로. 경로 첫 폴더는 고객사 ID (저장소 권한이 이걸로 판단) */
export async function uploadDoc(companyId: string, folder: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${companyId}/${folder}/${crypto.randomUUID()}-${safe}`
  must(await db().storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }))
  return path
}

/** 업로드한 파일을 잠깐 열 수 있는 링크 (5분) */
export async function docUrl(path: string): Promise<string> {
  const data = must(await db().storage.from(DOCS_BUCKET).createSignedUrl(path, 300)) as { signedUrl: string }
  return data.signedUrl
}
