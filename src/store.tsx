import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { defaultTimeFor, industries } from './config/industries'
import { computeResults } from './lib/compute'
import { effectiveEmployee } from './lib/payroll'
import {
  addPtoAdjustment, addPtoRequest, addSchedule as apiAddSchedule, deleteSchedule as apiDeleteSchedule, moveOpenRun, savePtoPolicy as apiSavePtoPolicy,
  setPtoRequestStatus, updateSchedule as apiUpdateSchedule,
} from './lib/db/api'
import { cutoffOf, frequencyInfo, openRuns as computeOpenRuns, scheduleOf, type OpenRun } from './lib/paySchedules'
import { ytdFor } from './lib/ytd'
import { usePortal } from './portal'
import type {
  ActivityEvent, Authorizations, Company, CompanyData, CompanyPto, CurrentRun, Employee, PayFrequency, PayRun, PaySchedule, PayrollResult, PtoPolicy, PtoRequestStatus, RunStatus, TaxDeposit, TaxKind, TimeEntry,
} from './types'
import { federalDepositFor, paymentsFor } from './lib/payments'
import { fullName } from './lib/names'

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
  /** 선택된 회차 지급일 (열린 회차가 여러 개면 바꿀 수 있음) */
  payDate: string
  /** 선택된 회차 급여 기간 */
  period: { start: string; end: string }
  /** 선택된 회차의 지급 주기 (여러 스케줄이 묶였으면 첫 번째) */
  frequency: PayFrequency
  schedules: PaySchedule[]
  /** 지금 열린 회차들 (빠른 지급일 순) */
  openRuns: OpenRun[]
  /** 선택된 회차 */
  openRun: OpenRun
  selectRun: (payDate: string) => void
  /** 열린 회차의 상태 */
  openStatus: (payDate: string) => RunStatus
  /** 선택된 회차에 포함되는 직원 (이 회차 스케줄 소속) */
  runEmployees: Employee[]
  /** 회차 지급일·급여 기간 바꾸기 (제출 전만) */
  changeRunDates: (dates: { payDate: string; start: string; end: string }, actorName: string, actor?: ActivityEvent['actor']) => Promise<void>
  saveSchedule: (s: Omit<PaySchedule, 'id' | 'isDefault'> & { id?: string }, actorName: string, actor?: ActivityEvent['actor']) => Promise<void>
  removeSchedule: (id: string, actorName: string, actor?: ActivityEvent['actor']) => Promise<void>
  /** PTO: 규칙·조정·신청 */
  pto: CompanyPto
  savePtoPolicy: (p: Omit<PtoPolicy, 'id'> & { id?: string }, actorName: string, actor?: ActivityEvent['actor']) => Promise<void>
  adjustPto: (a: { employeeId: string; policyId: string; hours: number; effectiveDate: string; reason: string }, actorName: string, actor?: ActivityEvent['actor']) => Promise<void>
  /** 휴가 신청(직원) 또는 기록(고객사·회계법인 — 바로 승인) */
  requestPto: (r: { employeeId: string; policyId: string; startDate: string; endDate: string; hours: number; note: string }, by: 'employee' | ActivityEvent['actor'], actorName: string) => Promise<void>
  decidePto: (id: string, status: PtoRequestStatus, actorName: string, actor?: ActivityEvent['actor'] | 'employee', note?: string) => Promise<void>
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
export function CompanyProvider({ companyId, initialRun, children }: { companyId: string; initialRun?: string; children: ReactNode }) {
  const { companies, updateCompany, applyAndReload } = usePortal()
  const data = companies.find((c) => c.company.id === companyId)
  const [today] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(initialRun ?? null)

  const update = useCallback((fn: (c: CompanyData) => CompanyData) => updateCompany(companyId, fn), [companyId, updateCompany])

  const runsOpen = useMemo(() => (data ? computeOpenRuns(data.schedules, today) : []), [data, today])
  const openRun: OpenRun | undefined = runsOpen.find((r) => r.payDate === selected) ?? runsOpen[0]
  const payDate = openRun?.payDate ?? ''

  const derived = useMemo(() => {
    if (!data || !openRun) return null
    const current: CurrentRun = data.open[payDate] ?? { payDate, status: 'draft' }
    const status: RunStatus = current.status
    const ids = new Set(openRun.schedules.map((x) => x.schedule.id))
    const runEmployees = data.employees.filter((e) => {
      const s = scheduleOf(e, data.schedules)
      return s && ids.has(s.id) && data.timeDates[e.id] === payDate
    })
    const ytd = ytdFor(data.runs, payDate)
    const ytdGross = Object.fromEntries(Object.entries(ytd).map(([id, y]) => [id, y.gross]))
    const results = computeResults(runEmployees, data.time, ytd, data.company.sutaRate)
    const runs = [...data.runs].sort((a, b) => b.payDate.localeCompare(a.payDate))
    const snapshot = current.snapshot
    const view: RunView = snapshot && status !== 'draft' && status !== 'changes_requested'
      ? snapshot
      : { employees: runEmployees, time: data.time, results }
    const deadline = cutoffOf(payDate, data.company.cutoffBusinessDays)
    return {
      current,
      status,
      runEmployees,
      ytdGross,
      results,
      runs,
      view,
      deadline,
      frequency: openRun.schedules[0].schedule.frequency,
      period: { start: current.periodStart ?? openRun.start, end: current.periodEnd ?? openRun.end },
      lastRun: runs.find((r) => r.payDate < payDate),
      approvedForPayDate: runs.find((r) => r.payDate === payDate),
      activity: [...data.activity].sort((a, b) => b.at.localeCompare(a.at)),
    }
  }, [data, payDate, openRun])

  const setStatus = useCallback(
    (status: RunStatus, ev: ActivityEvent, patch: Partial<CurrentRun> = {}) =>
      update((c) => ({
        ...c,
        open: {
          ...c.open,
          [payDate]: {
            ...(c.open[payDate] ?? { payDate, status: 'draft' }), payDate, status,
            periodStart: openRun?.start, periodEnd: openRun?.end, ...patch,
          },
        },
        activity: [ev, ...c.activity],
      })),
    [update, payDate, openRun],
  )

  if (!data || !derived) return null

  const value: Store = {
    company: data.company,
    deposits: data.deposits ?? [],
    employees: data.employees,
    time: data.time,
    payDate,
    schedules: data.schedules,
    openRuns: runsOpen,
    openRun: openRun!,
    selectRun: setSelected,
    openStatus: (d) => data.open[d]?.status ?? 'draft',
    locked: derived.status === 'submitted' || derived.status === 'in_review' || derived.status === 'processed',
    ...derived,

    upsertEmployee: (e, actorName) =>
      update((c) => {
        const exists = c.employees.some((x) => x.id === e.id)
        const ev = actorName
          ? [event('client', actorName, 'employee', exists ? `${fullName(e)} 직원 정보 수정` : `${fullName(e)} 직원 등록`, exists ? `Updated ${fullName(e)}` : `Added employee ${fullName(e)}`)]
          : []
        return {
          ...c,
          employees: exists ? c.employees.map((x) => (x.id === e.id ? e : x)) : [...c.employees, e],
          time: c.time[e.id] ? c.time : { ...c.time, [e.id]: defaultTimeFor(e.role, c.company.tipsEnabled) },
          activity: [...ev, ...c.activity],
        }
      }),

    toggleActive: (id) =>
      update((c) => ({ ...c, employees: c.employees.map((e) => (e.id === id ? { ...e, active: !e.active } : e)) })),

    setTime: (id, patch) =>
      update((c) => ({ ...c, time: { ...c.time, [id]: { ...(c.time[id] ?? emptyTime), ...patch } } })),

    updateCompanyInfo: (company, actorName) =>
      update((c) => {
        const changed = c.company.industry !== company.industry || c.company.tipsEnabled !== company.tipsEnabled
        const ko = changed ? `업종·급여 구성 변경: ${industries[company.industry].ko}${company.tipsEnabled ? ' (팁 사용)' : ' (팁 없음)'}` : '회사 정보 수정'
        const en = changed ? `Industry set: ${industries[company.industry].en}${company.tipsEnabled ? ' (tips on)' : ' (no tips)'}` : 'Updated company settings'
        return { ...c, company, activity: [event('client', actorName, 'settings', ko, en), ...c.activity] }
      }),

    submitRun: (actorName) => {
      const overrides = derived.runEmployees.filter((e) => e.active && data.time[e.id]?.rate !== undefined).length
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
            employees: derived.runEmployees.map((e) => effectiveEmployee(e, data.time[e.id], e.payFrequency ?? derived.frequency)),
            time: Object.fromEntries(derived.runEmployees.flatMap((e) => (data.time[e.id] ? [[e.id, data.time[e.id]]] : []))),
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
      setStatus('changes_requested', event('firm', actorName, 'changes', `수정 요청: ${note}`, `Requested changes: ${note}`), { note, noteEn: undefined, snapshot: undefined }),

    markProcessed: (actorName) => {
      const snap = derived.current.snapshot ?? { time: data.time, results: derived.results }
      const people = derived.current.snapshot?.employees ?? derived.runEmployees
      const run: PayRun = {
        id: `run-${payDate}`, payDate, approvedAt: new Date().toISOString(), time: snap.time, results: snap.results,
        payments: paymentsFor(people, snap.results),
        periodStart: derived.period.start, periodEnd: derived.period.end,
      }
      const fed = federalDepositFor(run, data.company.depositSchedule, false)
      update((c) => ({
        ...c,
        runs: [...c.runs.filter((r) => r.payDate !== payDate), run],
        deposits: [...(c.deposits ?? []).filter((d) => d.id !== fed.id), fed],
        open: { ...c.open, [payDate]: { ...(c.open[payDate] ?? { payDate }), payDate, status: 'processed', periodStart: derived.period.start, periodEnd: derived.period.end } },
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

    changeRunDates: async (dates, actorName, actor = 'client') => {
      const label = (iso: string) => iso.slice(5).replace('-', '/')
      update((c) => ({
        ...c,
        activity: [event(actor, actorName, 'settings',
          `급여 일정 변경: 지급일 ${label(payDate)} → ${label(dates.payDate)}, 기간 ${label(dates.start)}–${label(dates.end)}`,
          `Pay dates changed: pay date ${label(payDate)} → ${label(dates.payDate)}, period ${label(dates.start)}–${label(dates.end)}`), ...c.activity],
      }))
      const run = openRun!
      await applyAndReload(async () => {
        for (const { schedule, period } of run.schedules) {
          const { id, isDefault: _d, ...rest } = schedule
          void _d
          await apiUpdateSchedule(companyId, id, { ...rest, overrides: { ...schedule.overrides, [period.scheduled]: dates } })
          if (dates.payDate !== period.payDate) await moveOpenRun(id, period.payDate, dates.payDate)
        }
      })
      setSelected(dates.payDate)
    },

    saveSchedule: async (s, actorName, actor = 'client') => {
      const info = frequencyInfo(s.frequency, (ko) => ko)
      const infoEn = frequencyInfo(s.frequency, (_ko, en) => en)
      update((c) => ({
        ...c,
        activity: [event(actor, actorName, 'settings',
          s.id ? `급여 스케줄 수정: ${s.name || info.label} (${info.label})` : `급여 스케줄 추가: ${s.name || info.label} (${info.label})`,
          s.id ? `Pay schedule updated: ${s.name || infoEn.label} (${infoEn.label})` : `Pay schedule added: ${s.name || infoEn.label} (${infoEn.label})`), ...c.activity],
      }))
      const { id, ...rest } = s
      await applyAndReload(() => (id ? apiUpdateSchedule(companyId, id, rest) : apiAddSchedule(companyId, rest)))
    },

    removeSchedule: async (id, actorName, actor = 'client') => {
      const s = data.schedules.find((x) => x.id === id)
      update((c) => ({
        ...c,
        activity: [event(actor, actorName, 'settings', `급여 스케줄 삭제: ${s?.name || ''}`, `Pay schedule removed: ${s?.name || ''}`), ...c.activity],
      }))
      await applyAndReload(() => apiDeleteSchedule(id))
    },

    pto: data.pto,

    savePtoPolicy: async (p, actorName, actor = 'client') => {
      update((c) => ({ ...c, activity: [event(actor, actorName, 'settings', p.id ? `PTO 규칙 수정: ${p.name}` : `PTO 규칙 추가: ${p.name}`, p.id ? `PTO policy updated: ${p.name}` : `PTO policy added: ${p.name}`), ...c.activity] }))
      await applyAndReload(() => apiSavePtoPolicy(companyId, p))
    },

    adjustPto: async (a, actorName, actor = 'client') => {
      const who = data.employees.find((e) => e.id === a.employeeId)
      const sign = a.hours > 0 ? '+' : ''
      update((c) => ({ ...c, activity: [event(actor, actorName, 'employee', `PTO 잔액 조정: ${who ? fullName(who) : ''} ${sign}${a.hours}시간 (${a.reason})`, `PTO adjusted: ${who ? fullName(who) : ''} ${sign}${a.hours}h (${a.reason})`), ...c.activity] }))
      await applyAndReload(() => addPtoAdjustment(companyId, a))
    },

    requestPto: async (r, by, actorName) => {
      const who = data.employees.find((e) => e.id === r.employeeId)
      if (by !== 'employee') {
        update((c) => ({ ...c, activity: [event(by, actorName, 'employee', `휴가 등록: ${who ? fullName(who) : ''} ${r.startDate}${r.endDate !== r.startDate ? `~${r.endDate}` : ''} (${r.hours}시간)`, `Time off recorded: ${who ? fullName(who) : ''} ${r.startDate}${r.endDate !== r.startDate ? `–${r.endDate}` : ''} (${r.hours}h)`), ...c.activity] }))
      }
      await applyAndReload(() => addPtoRequest(companyId, { ...r, status: by === 'employee' ? 'pending' : 'approved' }))
    },

    decidePto: async (id, status, actorName, actor = 'client', note) => {
      const req = data.pto.requests.find((x) => x.id === id)
      const who = req ? data.employees.find((e) => e.id === req.employeeId) : undefined
      if (actor !== 'employee' && req) {
        const ko = { approved: '휴가 승인', denied: '휴가 거절', cancelled: '휴가 취소', pending: '휴가 대기' }[status]
        const en = { approved: 'Time off approved', denied: 'Time off denied', cancelled: 'Time off cancelled', pending: 'Time off pending' }[status]
        update((c) => ({ ...c, activity: [event(actor, actorName, 'employee', `${ko}: ${who ? fullName(who) : ''} ${req.startDate} (${req.hours}시간)`, `${en}: ${who ? fullName(who) : ''} ${req.startDate} (${req.hours}h)`), ...c.activity] }))
      }
      await applyAndReload(() => setPtoRequestStatus(id, status, note))
    },

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
