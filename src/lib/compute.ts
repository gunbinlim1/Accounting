import type { Employee, PayrollResult, TimeEntry, YtdTotals } from '../types'
import { calculatePayroll, effectiveEmployee } from './payroll'

const emptyTime: TimeEntry = { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }

/** 이번 회차 급여 대상 직원(호출하는 쪽에서 입사·퇴사일로 골라 줌)의 급여 계산 (직원별 지급 주기·회차별 시급·연간 누적·고객사 TWC 세율 반영) */
export function computeResults(
  employees: Employee[],
  time: Record<string, TimeEntry>,
  ytd: Record<string, YtdTotals>,
  sutaRate?: number,
): PayrollResult[] {
  return employees
    .map((employee) => {
      const frequency = employee.payFrequency ?? 'biweekly'
      return calculatePayroll({
        employee: effectiveEmployee(employee, time[employee.id], frequency),
        payFrequency: frequency,
        time: time[employee.id] ?? emptyTime,
        ytd: ytd[employee.id],
        sutaRate,
      })
    })
}
