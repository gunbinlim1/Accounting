import { useMemo } from 'react'
import { companySchedule, standardHours } from '../config/payrollConfig'
import { useStore } from '../store'
import { runChecks } from './checks'

/** 이번 회차 급여에 대한 자동 점검 결과 */
export function useChecks() {
  const { employees, hours, results, lastRun, ytdGross } = useStore()
  return useMemo(
    () =>
      runChecks({
        employees: employees.filter((e) => e.active),
        hours,
        results,
        previous: lastRun?.results,
        ytdGross,
        standardHours: standardHours[companySchedule.frequency],
      }),
    [employees, hours, results, lastRun, ytdGross],
  )
}
