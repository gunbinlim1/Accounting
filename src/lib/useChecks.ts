import { useMemo, useState } from 'react'
import { companySchedule, standardHours } from '../config/payrollConfig'
import { useStore } from '../store'
import { runChecks } from './checks'
import { effectiveEmployee } from './payroll'

/** 이번 회차 급여에 대한 자동 점검 결과 */
export function useChecks() {
  const { employees, time, results, lastRun, ytdGross } = useStore()
  const [today] = useState(() => new Date())
  return useMemo(
    () =>
      runChecks({
        employees: employees.filter((e) => e.active).map((e) => effectiveEmployee(e, time[e.id], companySchedule.frequency)),
        time,
        results,
        previous: lastRun?.results,
        ytdGross,
        standardHours: standardHours[companySchedule.frequency],
        today,
      }),
    [employees, time, results, lastRun, ytdGross, today],
  )
}
