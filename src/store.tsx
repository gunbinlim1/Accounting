import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { defaultTimeFor } from './config/restaurantRoles'
import { sampleEmployees } from './data/sampleEmployees'
import { calculatePayroll, effectiveEmployee } from './lib/payroll'
import { nextPayDate, parseISODate, previousPayDate, toISODate } from './lib/schedule'
import { ytdGrossFor } from './lib/ytd'
import type { Employee, PayRun, PayrollResult, TimeEntry } from './types'

const STORAGE_KEY = 'payroll-restaurant-tx-v1'

interface State {
  employees: Employee[]
  time: Record<string, TimeEntry>
  runs: PayRun[]
}

const emptyTime: TimeEntry = { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }
const defaultTime = (e: Employee): TimeEntry => defaultTimeFor(e.role)

function computeResults(employees: Employee[], time: Record<string, TimeEntry>, ytd: Record<string, number>): PayrollResult[] {
  return employees
    .filter((e) => e.active)
    .map((employee) => {
      const g = ytd[employee.id] ?? 0
      return calculatePayroll({
        employee: effectiveEmployee(employee, time[employee.id], companySchedule.frequency),
        payFrequency: companySchedule.frequency,
        time: time[employee.id] ?? emptyTime,
        ytd: { gross: g, futaWages: g, sutaWages: g },
      })
    })
}

function initialState(): State {
  const today = new Date()
  const employees = sampleEmployees(today)
  const time = Object.fromEntries(employees.map((e) => [e.id, defaultTime(e)]))
  const upcoming = nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), today)
  const last = previousPayDate(companySchedule.frequency, upcoming)

  // 직전 회차 기록 (신입 Jenny 제외)
  const lastEmployees = employees.filter((e) => e.id !== 'EMP-005')
  const lastRun: PayRun = {
    id: `run-${toISODate(last)}`,
    payDate: toISODate(last),
    approvedAt: last.toISOString(),
    time: { ...time },
    results: computeResults(lastEmployees, time, {}),
  }

  // 이번 회차: 바쁜 2주 + 신입의 첫 급여 (팁이 적어 최저임금 보전 발생)
  time['EMP-001'] = { regular: 72, overtime: 6, cashTips: 380, cardTips: 1040 }
  time['EMP-004'] = { regular: 80, overtime: 9, cashTips: 0, cardTips: 0 }
  time['EMP-005'] = { regular: 30, overtime: 0, cashTips: 15, cardTips: 40 }

  return { employees, time, runs: [lastRun] }
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (Array.isArray(parsed.employees) && parsed.time && Array.isArray(parsed.runs)) return parsed
    }
  } catch {
    /* fall through to demo data */
  }
  return initialState()
}

interface Store extends State {
  payDate: string
  /** 이번 회차 예상 결과 (재직자) */
  results: PayrollResult[]
  ytdGross: Record<string, number>
  lastRun?: PayRun
  approvedForPayDate?: PayRun
  upsertEmployee: (e: Employee) => void
  toggleActive: (id: string) => void
  setTime: (id: string, patch: Partial<TimeEntry>) => void
  approveRun: () => PayRun
  resetDemo: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(loadState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable */
    }
  }, [state])

  const [payDate] = useState(() =>
    toISODate(nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), new Date())),
  )

  const ytdGross = useMemo(() => ytdGrossFor(state.runs, payDate), [state.runs, payDate])
  const results = useMemo(() => computeResults(state.employees, state.time, ytdGross), [state.employees, state.time, ytdGross])

  const sortedRuns = useMemo(() => [...state.runs].sort((a, b) => b.payDate.localeCompare(a.payDate)), [state.runs])
  const approvedForPayDate = sortedRuns.find((r) => r.payDate === payDate)
  const lastRun = sortedRuns.find((r) => r.payDate < payDate)

  const upsertEmployee = useCallback((e: Employee) => {
    setState((s) => {
      const exists = s.employees.some((x) => x.id === e.id)
      return {
        ...s,
        employees: exists ? s.employees.map((x) => (x.id === e.id ? e : x)) : [...s.employees, e],
        time: s.time[e.id] ? s.time : { ...s.time, [e.id]: defaultTime(e) },
      }
    })
  }, [])

  const toggleActive = useCallback((id: string) => {
    setState((s) => ({ ...s, employees: s.employees.map((e) => (e.id === id ? { ...e, active: !e.active } : e)) }))
  }, [])

  const setTime = useCallback((id: string, patch: Partial<TimeEntry>) => {
    setState((s) => ({ ...s, time: { ...s.time, [id]: { ...(s.time[id] ?? emptyTime), ...patch } } }))
  }, [])

  const approveRun = useCallback((): PayRun => {
    const run: PayRun = { id: `run-${payDate}`, payDate, approvedAt: new Date().toISOString(), time: state.time, results }
    setState((s) => ({ ...s, runs: [...s.runs.filter((r) => r.payDate !== payDate), run] }))
    return run
  }, [payDate, results, state.time])

  const resetDemo = useCallback(() => setState(initialState()), [])

  const value: Store = {
    ...state,
    runs: sortedRuns,
    payDate,
    results,
    ytdGross,
    lastRun,
    approvedForPayDate,
    upsertEmployee,
    toggleActive,
    setTime,
    approveRun,
    resetDemo,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
