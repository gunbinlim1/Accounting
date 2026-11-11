/**
 * 화면 상태(CompanyData)가 바뀌면 → 필요한 DB 쓰기 목록을 순서대로 만듦 (순수 함수)
 *
 * 화면 코드는 지금처럼 CompanyData를 고치기만 하고, 저장은 이 목록을 실행해서 이뤄짐.
 * 순서가 중요한 경우:
 * - 제출(잠금): 근무 입력을 먼저 저장한 뒤 회차 상태를 바꿈 (잠긴 뒤에는 입력 저장이 막힘)
 * - 제출 취소: 회차 상태를 먼저 풀고 근무 입력을 저장
 */
import type { CompanyData } from '../../types'
import {
  activityToRow, companyToRow, currentToRow, depositToRow, employeeToRow, paymentToRow, resultToRow, secretsOf, timeToRow,
  type ActivityRow, type CompanyRow, type DepositRow, type EmployeeRow, type PaymentRow, type ResultRow, type RunRow, type TimeRow,
} from './mappers'

export type Write =
  | { kind: 'company'; id: string; row: Omit<CompanyRow, 'id'> }
  | { kind: 'employee'; row: Omit<EmployeeRow, 'bank_on_file' | 'ssn_on_file'>; isNew: boolean }
  | { kind: 'secrets'; employeeId: string; ssn: string | null; routing: string | null; account: string | null }
  | { kind: 'time'; row: TimeRow }
  | { kind: 'run'; row: Omit<RunRow, 'approved_at'> }
  | { kind: 'processed'; companyId: string; payDate: string; approvedAt: string; results: ResultRow[]; payments: PaymentRow[] }
  | { kind: 'deposit'; row: DepositRow }
  | { kind: 'activity'; row: Omit<ActivityRow, 'at'> }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const LOCKED = new Set(['submitted', 'in_review', 'processed'])

export function planWrites(prev: CompanyData, next: CompanyData): Write[] {
  const cid = next.company.id
  const out: Write[] = []

  if (!same(companyToRow(prev.company), companyToRow(next.company))) out.push({ kind: 'company', id: cid, row: companyToRow(next.company) })

  // 직원 (+ 새로 입력된 전체 SSN·계좌번호)
  for (const e of next.employees) {
    const before = prev.employees.find((x) => x.id === e.id)
    const row = employeeToRow(e, cid)
    if (!before || !same(employeeToRow(before, cid), row)) out.push({ kind: 'employee', row, isNew: !before })
    const s = secretsOf(e)
    if (s) out.push({ kind: 'secrets', employeeId: e.id, ...s })
  }

  // 이번 회차 근무 입력 / 회차 상태
  const payDate = next.current.payDate
  const timeWrites: Write[] = Object.entries(next.time)
    .filter(([id, t]) => !same(prev.time[id], t) || prev.current.payDate !== payDate)
    .filter(([id]) => next.employees.some((e) => e.id === id))
    .map(([id, t]) => ({ kind: 'time', row: timeToRow(cid, payDate, id, t) }))
  const runChanged = !same(currentToRow(cid, prev.current), currentToRow(cid, next.current))
  const runWrite: Write[] = runChanged ? [{ kind: 'run', row: currentToRow(cid, next.current) }] : []
  if (LOCKED.has(next.current.status)) out.push(...timeWrites, ...runWrite)
  else out.push(...runWrite, ...timeWrites)

  // 처리 완료된 회차 (새로 생기거나 다시 처리됨)
  for (const run of next.runs) {
    const before = prev.runs.find((r) => r.payDate === run.payDate)
    if (before && same(before, run)) continue
    out.push({
      kind: 'processed',
      companyId: cid,
      payDate: run.payDate,
      approvedAt: run.approvedAt,
      results: run.results.map((r) => resultToRow(cid, run, r)),
      payments: (run.payments ?? []).map((p) => paymentToRow(cid, run.payDate, p)),
    })
  }

  for (const d of next.deposits) {
    const before = prev.deposits.find((x) => x.id === d.id)
    if (!before || !same(before, d)) out.push({ kind: 'deposit', row: depositToRow(cid, d) })
  }

  const known = new Set(prev.activity.map((a) => a.id))
  for (const a of next.activity) if (!known.has(a.id)) out.push({ kind: 'activity', row: activityToRow(cid, a) })

  return out
}
