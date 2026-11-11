import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { defaultTimeFor } from './config/industries'
import { demoCompanies, demoTimeTweaks, recurringFringes } from './data/demoPortal'
import { computeResults } from './lib/compute'
import { nextPayDate, parseISODate, toISODate } from './lib/schedule'
import { federalDepositFor, paymentsFor } from './lib/payments'
import { federalDueDate, futaSchedule, quarterDueDate, twcQuarter, type Quarter } from './lib/taxes'
import { splitName } from './lib/names'
import { ytdFor } from './lib/ytd'
import type { Company, CompanyData, Employee, PayRun, Session, TaxDeposit, TimeEntry } from './types'

const STORAGE_KEY = 'payday-portal-v5'
/**
 * 옛 저장 데이터: v2(이름 한 칸·업종 없음), v3(계좌 뒤 4자리만·서류 사본 없음), v4(업종별 데모 2곳 더 있음).
 * 데모 고객사는 새 시드로 바꾸고, 사용자가 직접 만든 고객사만 옮겨 옴.
 */
const LEGACY_KEYS = ['payday-portal-v4', 'payday-portal-v3', 'payday-portal-v2']
const SESSION_KEY = 'payday-portal-session-v1'

export const currentPayDate = (from = new Date()) =>
  toISODate(nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), from))

/** 데모용 결정적 변동 (매번 같은 값) */
const wobble = (i: number, k: number) => 1 + 0.09 * Math.sin(i * 1.7 + k * 0.9)

function timeFor(e: Employee, i: number, tipsEnabled: boolean): TimeEntry {
  const base = defaultTimeFor(e.role, tipsEnabled)
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
      const time = Object.fromEntries(eligible.map((e) => [e.id, timeFor(e, i, company.tipsEnabled)]))
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
    const time: Record<string, TimeEntry> = Object.fromEntries(employees.map((e) => [e.id, timeFor(e, pastDates.length, company.tipsEnabled)]))
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
        noteEn: seed.noteEn,
        snapshot,
        submittedAt: submitEvent?.at,
        submittedBy: submitEvent?.actorName,
      },
      activity: seed.activity,
    }
  })
}

type LegacyEmployee = Omit<Employee, 'firstName' | 'lastName'> & { name?: string; firstName?: string; lastName?: string }

/** 옛 데이터 → 현재 모양 (이름 분리, 업종 기본값) */
function migrateCompany(c: CompanyData): CompanyData {
  const fixEmp = (e: LegacyEmployee): Employee => {
    if (typeof e.firstName === 'string' && typeof e.lastName === 'string') return e as Employee
    const { name, ...rest } = e
    return { ...rest, ...splitName(name ?? '') } as Employee
  }
  const company: Company = { ...c.company, industry: c.company.industry ?? 'restaurant', tipsEnabled: c.company.tipsEnabled ?? true }
  const snap = c.current.snapshot
  return {
    ...c,
    company,
    employees: (c.employees as LegacyEmployee[]).map(fixEmp),
    current: snap ? { ...c.current, snapshot: { ...snap, employees: (snap.employees as LegacyEmployee[]).map(fixEmp) } } : c.current,
  }
}

/**
 * 일회성 정리: 사용자가 시험 삼아 만든 "test"·"123" 고객사 삭제 (요청 2026-11-11).
 * 한 번 실행한 뒤에는 표시를 남겨, 같은 이름으로 새로 만든 회사는 지우지 않음.
 */
const CLEANUP_KEY = 'payday-cleanup-2026-11-11'
const cleanupTestClients = (list: CompanyData[]): CompanyData[] => {
  if (load<boolean>(CLEANUP_KEY, () => false, (v) => v === true)) return list
  save(CLEANUP_KEY, true)
  const junk = (s: string) => ['test', '123'].includes(s.trim().toLowerCase())
  return list.filter((c) => !(junk(c.company.dba) || junk(c.company.legalName)))
}

function loadCompanies(): CompanyData[] {
  return cleanupTestClients(loadStoredCompanies())
}

function loadStoredCompanies(): CompanyData[] {
  const valid = (v: unknown) => Array.isArray(v) && v.length > 0 && 'deposits' in (v as object[])[0]
  const current = load<CompanyData[] | null>(STORAGE_KEY, () => null, valid)
  if (current) return current.map(migrateCompany)
  for (const key of LEGACY_KEYS) {
    const legacy = load<CompanyData[] | null>(key, () => null, valid)
    if (!legacy) continue
    for (const k of LEGACY_KEYS) save(k, null)
    const seed = initialCompanies()
    const demoIds = new Set([...seed.map((c) => c.company.id), 'seoul-garden', 'el-sol', 'pho-bellaire', 'lone-star-fab'])
    return [...seed, ...legacy.filter((c) => !demoIds.has(c.company.id)).map(migrateCompany)]
  }
  return initialCompanies()
}

/** 새로 만든 고객사 포털의 빈 데이터 (직원·급여 기록 없음) */
export function newCompanyData(company: Company, actorName: string, actor: 'client' | 'firm'): CompanyData {
  const at = new Date().toISOString()
  return {
    company,
    employees: [],
    time: {},
    runs: [],
    deposits: [],
    current: { payDate: currentPayDate(), status: 'draft' },
    activity: [{ id: `ev-${Date.now()}-setup`, at, actor, actorName, kind: 'settings', ko: '고객 포털 생성', en: 'Client portal created' }],
  }
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
  /** 새 고객사 포털 생성 */
  addCompany: (c: CompanyData) => void
  /** 고객사 삭제 (회계법인) — 그 고객사로 로그인한 세션도 끝냄 */
  removeCompany: (id: string) => void
  resetDemo: () => void
}

const PortalContext = createContext<Portal | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanyData[]>(loadCompanies)
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
      addCompany: (c: CompanyData) => setCompanies((list) => [...list.filter((x) => x.company.id !== c.company.id), c]),
      removeCompany: (id: string) => {
        setCompanies((list) => list.filter((x) => x.company.id !== id))
        setSession((s) => (s && s.role !== 'firm' && s.companyId === id ? null : s))
      },
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
