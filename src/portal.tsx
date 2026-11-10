import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { defaultTimeFor } from './config/restaurantRoles'
import { demoCompanies, demoTimeTweaks } from './data/demoPortal'
import { computeResults } from './lib/compute'
import { nextPayDate, parseISODate, previousPayDate, toISODate } from './lib/schedule'
import type { CompanyData, PayRun, Session, TimeEntry } from './types'

const STORAGE_KEY = 'payday-portal-v1'
const SESSION_KEY = 'payday-portal-session-v1'

export const currentPayDate = (from = new Date()) =>
  toISODate(nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), from))

function initialCompanies(): CompanyData[] {
  const today = new Date()
  const payDate = currentPayDate(today)
  const last = previousPayDate(companySchedule.frequency, parseISODate(payDate))

  return demoCompanies(today).map((seed) => {
    const { company, employees } = seed
    const time: Record<string, TimeEntry> = Object.fromEntries(employees.map((e) => [e.id, defaultTimeFor(e.role)]))

    // 직전 회차 기록 (입사 1주 이내 신입 제외)
    const veterans = employees.filter((e) => e.hireDate <= toISODate(last))
    const lastRun: PayRun = {
      id: `run-${toISODate(last)}`,
      payDate: toISODate(last),
      approvedAt: last.toISOString(),
      time: { ...time },
      results: computeResults(veterans, time, {}, company.sutaRate),
    }

    for (const [id, tweak] of Object.entries(demoTimeTweaks)) if (time[id]) time[id] = { ...time[id], ...tweak }

    const submitted = seed.status !== 'draft'
    const snapshot = submitted ? { employees, time: { ...time }, results: computeResults(employees, time, {}, company.sutaRate) } : undefined
    const submitEvent = seed.activity.find((a) => a.kind === 'submit')

    return {
      company,
      employees,
      time,
      runs: [lastRun],
      current: {
        payDate,
        status: seed.status,
        note: seed.note,
        snapshot: seed.status === 'submitted' ? snapshot : undefined,
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
    load(STORAGE_KEY, initialCompanies, (v) => Array.isArray(v) && v.length > 0 && 'company' in (v as object[])[0]),
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
