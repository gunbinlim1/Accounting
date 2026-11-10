import { useMemo, useState } from 'react'
import { companySchedule, standardHours } from '../config/payrollConfig'
import { useStore, type RunView } from '../store'
import { runChecks } from './checks'
import { effectiveEmployee } from './payroll'

/** 급여 자동 점검 결과. view를 주면 그 자료(예: 제출 스냅샷)를 점검 */
export function useChecks(view?: RunView) {
  const store = useStore()
  const src = view ?? store.view
  const { lastRun, ytdGross } = store
  const [today] = useState(() => new Date())
  return useMemo(
    () =>
      runChecks({
        employees: src.employees.filter((e) => e.active).map((e) => effectiveEmployee(e, src.time[e.id], companySchedule.frequency)),
        time: src.time,
        results: src.results,
        previous: lastRun?.results,
        ytdGross,
        standardHours: standardHours[companySchedule.frequency],
        today,
      }),
    [src, lastRun, ytdGross, today],
  )
}
