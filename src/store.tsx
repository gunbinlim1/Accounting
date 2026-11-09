import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { companySchedule, standardHours } from './config/payrollConfig'
import { sampleEmployees } from './data/sampleEmployees'
import { calculatePayroll } from './lib/payroll'
import { ytdGrossFor } from './lib/ytd'
import { nextPayDate, parseISODate, previousPayDate, toISODate } from './lib/schedule'
import type { Employee, Hours, PayRun, PayrollResult } from './types'

const STORAGE_KEY = 'payroll-demo-v2'

interface State {
  employees: Employee[]
  hours: Record<string, Hours>
  runs: PayRun[]
}

const defaultHours = (e: Employee): Hours => ({
  regular: e.payType === 'hourly' ? standardHours[companySchedule.frequency] : 0,
  overtime: 0,
})

function computeResults(
  employees: Employee[],
  hours: Record<string, Hours>,
  ytd: Record<string, number>,
): PayrollResult[] {
  return employees
    .filter((e) => e.active)
    .map((employee) =>
      calculatePayroll({
        employee,
        payFrequency: companySchedule.frequency,
        regularHours: hours[employee.id]?.regular,
        overtimeHours: hours[employee.id]?.overtime,
        ytdGross: ytd[employee.id],
      }),
    )
}

function initialState(): State {
  const hours = Object.fromEntries(sampleEmployees.map((e) => [e.id, defaultHours(e)]))
  const anchor = parseISODate(companySchedule.anchorDate)
  const upcoming = nextPayDate(companySchedule.frequency, anchor, new Date())
  const last = previousPayDate(companySchedule.frequency, upcoming)
  // 직전 회차는 Riley Han이 초과근무 없이 근무했다고 가정한 샘플 기록
  const seedHours = { ...hours }
  const results = computeResults(sampleEmployees, seedHours, {})
  const runs: PayRun[] = [
    { id: `run-${toISODate(last)}`, payDate: toISODate(last), approvedAt: last.toISOString(), hours: seedHours, results },
  ]
  // 이번 회차에는 눈에 띄는 변화를 넣어 자동 점검을 체험할 수 있게 함
  hours['EMP-004'] = { regular: 80, overtime: 12 }
  return { employees: sampleEmployees, hours, runs }
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (Array.isArray(parsed.employees) && parsed.hours && Array.isArray(parsed.runs)) return parsed
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
  setHours: (id: string, patch: Partial<Hours>) => void
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
  const results = useMemo(
    () => computeResults(state.employees, state.hours, ytdGross),
    [state.employees, state.hours, ytdGross],
  )

  const sortedRuns = useMemo(() => [...state.runs].sort((a, b) => b.payDate.localeCompare(a.payDate)), [state.runs])
  const approvedForPayDate = sortedRuns.find((r) => r.payDate === payDate)
  const lastRun = sortedRuns.find((r) => r.payDate < payDate)

  const upsertEmployee = useCallback((e: Employee) => {
    setState((s) => {
      const exists = s.employees.some((x) => x.id === e.id)
      return {
        ...s,
        employees: exists ? s.employees.map((x) => (x.id === e.id ? e : x)) : [...s.employees, e],
        hours: s.hours[e.id] ? s.hours : { ...s.hours, [e.id]: defaultHours(e) },
      }
    })
  }, [])

  const toggleActive = useCallback((id: string) => {
    setState((s) => ({ ...s, employees: s.employees.map((e) => (e.id === id ? { ...e, active: !e.active } : e)) }))
  }, [])

  const setHours = useCallback((id: string, patch: Partial<Hours>) => {
    setState((s) => ({ ...s, hours: { ...s.hours, [id]: { ...(s.hours[id] ?? { regular: 0, overtime: 0 }), ...patch } } }))
  }, [])

  const approveRun = useCallback((): PayRun => {
    const run: PayRun = {
      id: `run-${payDate}`,
      payDate,
      approvedAt: new Date().toISOString(),
      hours: state.hours,
      results,
    }
    setState((s) => ({ ...s, runs: [...s.runs.filter((r) => r.payDate !== payDate), run] }))
    return run
  }, [payDate, results, state.hours])

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
    setHours,
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
