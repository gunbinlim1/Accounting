import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { defaultTimeFor } from './config/restaurantRoles'
import { demoCompanies, demoTimeTweaks, recurringFringes } from './data/demoPortal'
import { computeResults } from './lib/compute'
import { nextPayDate, parseISODate, toISODate } from './lib/schedule'
import { federalDepositFor, paymentsFor } from './lib/payments'
import { federalDueDate, futaSchedule, quarterDueDate, twcQuarter, type Quarter } from './lib/taxes'
import { ytdFor } from './lib/ytd'
import type { CompanyData, Employee, PayRun, Session, TaxDeposit, TimeEntry } from './types'

const STORAGE_KEY = 'payday-portal-v2'
const SESSION_KEY = 'payday-portal-session-v1'

export const currentPayDate = (from = new Date()) =>
  toISODate(nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), from))

/** 데모용 결정적 변동 (매번 같은 값) */
const wobble = (i: number, k: number) => 1 + 0.09 * Math.sin(i * 1.7 + k * 0.9)

function timeFor(e: Employee, i: number): TimeEntry {
  const base = defaultTimeFor(e.role)
  const f = wobble(i, e.id.charCodeAt(e.id.length - 1))
  const fringes = (recurringFringes[e.id] ?? []).map((x, j) => ({ ...x, id: `${e.id}-f${j}` }))
  if (e.payType === 'salary') return { ...base, fringes }
  return {
    regular: Math.min(80, Math.round(base.regular * f)),
    overtime: base.overtime + (i % 4 === 0 ? 2 : 0),
    cashTips: Math.round(base.cashTips * wobble(i + 3, 2)),
    cardTips: Math.round(base.cardTips * wobble(i + 5, 3)),
    fringes,
  }
}

function initialCompanies(): CompanyData[] {
  const today = new Date()
  const todayIso = toISODate(today)
  const payDate = currentPayDate(today)
  const year = Number(payDate.slice(0, 4))
  const anchor = parseISODate(companySchedule.anchorDate)

  // 올해 기준일부터 이번 회차 직전까지 모든 급여일
  const pastDates: string[] = []
  for (let d = anchor; toISODate(d) < payDate; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14)) pastDates.push(toISODate(d))

  return demoCompanies(today).map((seed) => {
    const { company, employees } = seed
    const schedule = company.depositSchedule

    // ── 지난 회차 기록 생성
    const runs: PayRun[] = []
    pastDates.forEach((pd, i) => {
      const eligible = employees.filter((e) => e.hireDate <= pd && (e.active || pd < `${year}-06-01`)).map((e) => ({ ...e, active: true }))
      const time = Object.fromEntries(eligible.map((e) => [e.id, timeFor(e, i)]))
      const results = computeResults(eligible, time, ytdFor(runs, pd), company.sutaRate)
      runs.push({ id: `run-${pd}`, payDate: pd, approvedAt: `${pd}T12:00:00.000Z`, time, results, payments: paymentsFor(employees, results) })
    })

    // ── 납부 기록: 연방은 회차별, FUTA·TWC는 지난 분기
    const deposits: TaxDeposit[] = runs.map((r) => federalDepositFor(r, schedule, federalDueDate(r.payDate, schedule) < todayIso))
    for (const q of [1, 2, 3, 4] as Quarter[]) {
      const due = quarterDueDate(year, q)
      if (due >= todayIso) continue
      const tw = twcQuarter(runs, year, q, company.sutaRate)
      if (tw.tax > 0) deposits.push({ id: `twc-${year} Q${q}`, kind: 'twc', period: `${year} Q${q}`, amount: tw.tax, dueDate: due, status: 'paid', paidAt: due })
      const fu = futaSchedule(runs, year).find((x) => x.q === q)!
      if (fu.mustDeposit && fu.accumulated > 0) deposits.push({ id: `futa-${year} Q${q}`, kind: 'futa', period: `${year} Q${q}`, amount: fu.accumulated, dueDate: due, status: 'paid', paidAt: due })
    }

    // ── 이번 회차 입력
    const time: Record<string, TimeEntry> = Object.fromEntries(employees.map((e) => [e.id, timeFor(e, pastDates.length)]))
    for (const [id, tweak] of Object.entries(demoTimeTweaks)) if (time[id]) time[id] = { ...time[id], ...tweak }

    const ytd = ytdFor(runs, payDate)
    const snapshot = seed.status === 'submitted'
      ? { employees, time: { ...time }, results: computeResults(employees, time, ytd, company.sutaRate) }
      : undefined
    const submitEvent = seed.activity.find((a) => a.kind === 'submit')

    return {
      company,
      employees,
      time,
      runs,
      deposits,
      current: {
        payDate,
        status: seed.status,
        note: seed.note,
        snapshot,
        submittedAt: submitEvent?.at,
        submittedBy: submitEvent?.actorName,
      },
      activity: seed.activity,
    }
  })
}

function load<T>(key: string, fallback: () => T, valid: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (valid(parsed)) return parsed as T
    }
  } catch {
    /* ignore */
  }
  return fallback()
}

const save = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

interface Portal {
  companies: CompanyData[]
  session: Session | null
  login: (session: Session) => void
  logout: () => void
  updateCompany: (id: string, fn: (c: CompanyData) => CompanyData) => void
  resetDemo: () => void
}

const PortalContext = createContext<Portal | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanyData[]>(() =>
    load(STORAGE_KEY, initialCompanies, (v) => Array.isArray(v) && v.length > 0 && 'deposits' in (v as object[])[0]),
  )
  const [session, setSession] = useState<Session | null>(() =>
    load<Session | null>(SESSION_KEY, () => null, (v) => !!v && typeof v === 'object' && 'role' in (v as object)),
  )

  useEffect(() => save(STORAGE_KEY, companies), [companies])
  useEffect(() => save(SESSION_KEY, session), [session])

  const updateCompany = useCallback((id: string, fn: (c: CompanyData) => CompanyData) => {
    setCompanies((list) => list.map((c) => (c.company.id === id ? fn(c) : c)))
  }, [])

  const value = useMemo<Portal>(
    () => ({
      companies,
      session,
      login: setSession,
      logout: () => setSession(null),
      updateCompany,
      resetDemo: () => setCompanies(initialCompanies()),
    }),
    [companies, session, updateCompany],
  )

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal(): Portal {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider')
  return ctx
}
