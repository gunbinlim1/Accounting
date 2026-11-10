import { companySchedule } from '../config/payrollConfig'
import type { Employee, PayrollResult, TimeEntry } from '../types'
import { calculatePayroll, effectiveEmployee } from './payroll'

const emptyTime: TimeEntry = { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 }

/** 재직 직원의 이번 회차 급여 계산 (회차별 시급, 연간 누적, 고객사 TWC 세율 반영) */
export function computeResults(
  employees: Employee[],
  time: Record<string, TimeEntry>,
  ytd: Record<string, number>,
  sutaRate?: number,
): PayrollResult[] {
  return employees
    .filter((e) => e.active)
    .map((employee) => {
      const g = ytd[employee.id] ?? 0
      return calculatePayroll({
        employee: effectiveEmployee(employee, time[employee.id], companySchedule.frequency),
        payFrequency: companySchedule.frequency,
        time: time[employee.id] ?? emptyTime,
        ytd: { gross: g, futaWages: g, sutaWages: g },
        sutaRate,
      })
    })
}
