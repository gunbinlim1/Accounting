import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { defaultTimeFor } from './config/restaurantRoles'
import { computeResults } from './lib/compute'
import { effectiveEmployee } from './lib/payroll'
import { parseISODate, subtractBusinessDays } from './lib/schedule'
import { ytdFor } from './lib/ytd'
import { currentPayDate, usePortal } from './portal'
import type {
  ActivityEvent, Authorizations, Company, CompanyData, CurrentRun, Employee, PayRun, PayrollResult, RunStatus, TaxDeposit, TaxKind, TimeEntry,
} from './types'
import { federalDepositFor, paymentsFor } from './lib/payments'

const emptyTime: TimeEntry = { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }

/** 화면에 보여 줄 급여 자료 (제출 후에는 제출 시점 스냅샷) */
export interface RunView {
  employees: Employee[]
  time: Record<string, TimeEntry>
  results: PayrollResult[]
}

interface Store {
  company: Company
  employees: Employee[]
  time: Record<string, TimeEntry>
  runs: PayRun[]
  activity: ActivityEvent[]
  payDate: string
  /** 회차 상태 (새 급여 기간이 시작되면 자동으로 draft) */
  status: RunStatus
  current: CurrentRun
  /** 고객이 수정할 수 없는 상태인지 */
  locked: boolean
  /** 제출 마감: 지급일 N 영업일 전 오후 3시 */
  deadline: Date
  results: PayrollResult[]
  view: RunView
  ytdGross: Record<string, number>
  lastRun?: PayRun
  approvedForPayDate?: PayRun
  upsertEmployee: (e: Employee, actorName?: string) => void
  toggleActive: (id: string) => void
  setTime: (id: string, patch: Partial<TimeEntry>) => void
  updateCompanyInfo: (c: Company, actorName: string) => void
  submitRun: (actorName: string) => void
  recallRun: (actorName: string) => void
  startReview: (actorName: string) => void
  requestChanges: (actorName: string, note: string) => void
  markProcessed: (actorName: string) => PayRun
  sendReminder: (actorName: string) => void
  deposits: TaxDeposit[]
  /** 회계법인: 예치 완료 처리 */
  markDepositPaid: (id: string, actorName: string) => void
  /** 회계법인: 분기 FUTA·TWC 납부 기록 */
  recordQuarterDeposit: (kind: Exclude<TaxKind, 'federal'>, period: string, amount: number, dueDate: string, actorName: string) => void
  /** 고객: 대리 신고·납부 위임 서명 */
  signAuthorization: (key: keyof Authorizations, actorName: string) => void
}

const StoreContext = createContext<Store | null>(null)

let eventSeq = 0
const event = (actor: ActivityEvent['actor'], actorName: string, kind: ActivityEvent['kind'], ko: string, en: string): ActivityEvent => ({
  id: `ev-${Date.now()}-${eventSeq++}`,
  at: new Date().toISOString(),
  actor,
  actorName,
  kind,
  ko,
  en,
})

/** 한 고객사의 데이터와 동작을 하위 화면에 제공 */
export function CompanyProvider({ companyId, children }: { companyId: string; children: ReactNode }) {
  const { companies, updateCompany } = usePortal()
  const data = companies.find((c) => c.company.id === companyId)
  const payDate = useMemo(() => currentPayDate(), [])

  const update = useCallback((fn: (c: CompanyData) => CompanyData) => updateCompany(companyId, fn), [companyId, updateCompany])

  const derived = useMemo(() => {
    if (!data) return null
    const status: RunStatus = data.current.payDate === payDate ? data.current.status : 'draft'
    const ytd = ytdFor(data.runs, payDate)
    const ytdGross = Object.fromEntries(Object.entries(ytd).map(([id, y]) => [id, y.gross]))
    const results = computeResults(data.employees, data.time, ytd, data.company.sutaRate)
    const runs = [...data.runs].sort((a, b) => b.payDate.localeCompare(a.payDate))
    const snapshot = data.current.payDate === payDate ? data.current.snapshot : undefined
    const view: RunView = snapshot && status !== 'draft' && status !== 'changes_requested'
      ? snapshot
      : { employees: data.employees, time: data.time, results }
    const deadline = subtractBusinessDays(parseISODate(payDate), data.company.cutoffBusinessDays)
    deadline.setHours(15, 0, 0, 0)
    return {
      status,
      ytdGross,
      results,
      runs,
      view,
      deadline,
      lastRun: runs.find((r) => r.payDate < payDate),
      approvedForPayDate: runs.find((r) => r.payDate === payDate),
      activity: [...data.activity].sort((a, b) => b.at.localeCompare(a.at)),
    }
  }, [data, payDate])

  const setStatus = useCallback(
    (status: RunStatus, ev: ActivityEvent, patch: Partial<CurrentRun> = {}) =>
      update((c) => ({ ...c, current: { ...c.current, payDate, status, ...patch }, activity: [ev, ...c.activity] })),
    [update, payDate],
  )

  if (!data || !derived) return null

  const value: Store = {
    company: data.company,
    deposits: data.deposits ?? [],
    employees: data.employees,
    time: data.time,
    current: data.current,
    payDate,
    locked: derived.status === 'submitted' || derived.status === 'in_review' || derived.status === 'processed',
    ...derived,

    upsertEmployee: (e, actorName) =>
      update((c) => {
        const exists = c.employees.some((x) => x.id === e.id)
        const ev = actorName
          ? [event('client', actorName, 'employee', exists ? `${e.name} 직원 정보 수정` : `${e.name} 직원 등록`, exists ? `Updated ${e.name}` : `Added employee ${e.name}`)]
          : []
        return {
          ...c,
          employees: exists ? c.employees.map((x) => (x.id === e.id ? e : x)) : [...c.employees, e],
          time: c.time[e.id] ? c.time : { ...c.time, [e.id]: defaultTimeFor(e.role) },
          activity: [...ev, ...c.activity],
        }
      }),

    toggleActive: (id) =>
      update((c) => ({ ...c, employees: c.employees.map((e) => (e.id === id ? { ...e, active: !e.active } : e)) })),

    setTime: (id, patch) =>
      update((c) => ({ ...c, time: { ...c.time, [id]: { ...(c.time[id] ?? emptyTime), ...patch } } })),

    updateCompanyInfo: (company, actorName) =>
      update((c) => ({ ...c, company, activity: [event('client', actorName, 'settings', '회사 정보 수정', 'Updated company settings'), ...c.activity] })),

    submitRun: (actorName) => {
      const overrides = data.employees.filter((e) => e.active && data.time[e.id]?.rate !== undefined).length
      setStatus(
        'submitted',
        event('client', actorName, 'submit',
          `급여 제출 (${derived.results.length}명${overrides ? `, 시급 변경 ${overrides}건` : ''})`,
          `Submitted payroll (${derived.results.length} people${overrides ? `, ${overrides} rate change(s)` : ''})`),
        {
          submittedAt: new Date().toISOString(),
          submittedBy: actorName,
          note: undefined,
          snapshot: {
            employees: data.employees.map((e) => effectiveEmployee(e, data.time[e.id], companySchedule.frequency)),
            time: { ...data.time },
            results: derived.results,
          },
        },
      )
    },

    recallRun: (actorName) =>
      setStatus('draft', event('client', actorName, 'recall', '제출 취소 (수정을 위해)', 'Recalled submission to edit'), { snapshot: undefined }),

    startReview: (actorName) =>
      setStatus('in_review', event('firm', actorName, 'review', '검토 시작', 'Started review')),

    requestChanges: (actorName, note) =>
      setStatus('changes_requested', event('firm', actorName, 'changes', `수정 요청: ${note}`, `Requested changes: ${note}`), { note, snapshot: undefined }),

    markProcessed: (actorName) => {
      const snap = data.current.snapshot ?? { time: data.time, results: derived.results }
      const people = data.current.snapshot?.employees ?? data.employees
      const run: PayRun = {
        id: `run-${payDate}`, payDate, approvedAt: new Date().toISOString(), time: snap.time, results: snap.results,
        payments: paymentsFor(people, snap.results),
      }
      const fed = federalDepositFor(run, data.company.depositSchedule, false)
      update((c) => ({
        ...c,
        runs: [...c.runs.filter((r) => r.payDate !== payDate), run],
        deposits: [...(c.deposits ?? []).filter((d) => d.id !== fed.id), fed],
        current: { ...c.current, payDate, status: 'processed' },
        activity: [event('firm', actorName, 'processed', '급여 처리 완료 — 급여명세서 발행', 'Payroll processed — pay stubs issued'), ...c.activity],
      }))
      return run
    },

    markDepositPaid: (id, actorName) =>
      update((c) => {
        const d = c.deposits.find((x) => x.id === id)
        const label = d ? (d.kind === 'federal' ? 'IRS' : d.kind.toUpperCase()) : ''
        return {
          ...c,
          deposits: c.deposits.map((x) => (x.id === id ? { ...x, status: 'paid', paidAt: new Date().toISOString().slice(0, 10) } : x)),
          activity: d
            ? [event('firm', actorName, 'settings', `세금 납부 완료: ${label} $${d.amount.toFixed(2)}`, `Tax paid: ${label} $${d.amount.toFixed(2)}`), ...c.activity]
            : c.activity,
        }
      }),

    recordQuarterDeposit: (kind, period, amount, dueDate, actorName) =>
      update((c) => {
        const label = kind === 'futa' ? 'FUTA' : 'TWC'
        return {
          ...c,
          deposits: [
            ...c.deposits.filter((x) => x.id !== `${kind}-${period}`),
            { id: `${kind}-${period}`, kind, period, amount, dueDate, status: 'paid', paidAt: new Date().toISOString().slice(0, 10) },
          ],
          activity: [event('firm', actorName, 'settings', `${label} ${period} 납부 $${amount.toFixed(2)}`, `${label} ${period} paid $${amount.toFixed(2)}`), ...c.activity],
        }
      }),

    signAuthorization: (key, actorName) =>
      update((c) => {
        const ko = { form8655: 'IRS Form 8655', twcAgent: 'TWC 대리인 권한', bankDebit: '계좌 인출 동의' }[key]
        const en = { form8655: 'IRS Form 8655', twcAgent: 'TWC agent access', bankDebit: 'Bank debit authorization' }[key]
        return {
          ...c,
          company: {
            ...c.company,
            authorizations: { form8655: 'pending', twcAgent: 'pending', bankDebit: 'pending', ...c.company.authorizations, [key]: 'signed' },
          },
          activity: [event('client', actorName, 'settings', `위임 서명: ${ko}`, `Signed: ${en}`), ...c.activity],
        }
      }),

    sendReminder: (actorName) =>
      update((c) => ({ ...c, activity: [event('firm', actorName, 'reminder', '제출 마감 알림 전송', 'Sent a deadline reminder'), ...c.activity] })),
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside CompanyProvider')
  return ctx
}

export type { Store }
