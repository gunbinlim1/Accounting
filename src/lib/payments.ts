import type { DepositSchedule, Employee, PaymentRecord, PayRun, PayrollResult, TaxDeposit } from '../types'
import { federalDueDate, federalLiability } from './taxes'

/** 처리 완료 시 직원별 지급 기록: 지급 방식별 상태 + 급여명세서 이메일 여부 */
export const paymentsFor = (employees: Employee[], results: PayrollResult[]): PaymentRecord[] =>
  results.map((r) => {
    const e = employees.find((x) => x.id === r.employeeId)!
    const method = e.payMethod ?? 'client_check'
    return {
      employeeId: r.employeeId,
      method,
      amount: r.netPay,
      status: method === 'direct_deposit' ? 'deposit_scheduled' : method === 'firm_check' ? 'check_printed' : 'ready_for_client',
      stubEmailed: !!e.eConsent && !!e.email,
    }
  })

/** 처리 완료된 회차의 연방 예치 기록 */
export const federalDepositFor = (run: PayRun, schedule: DepositSchedule, paid: boolean): TaxDeposit => {
  const due = federalDueDate(run.payDate, schedule)
  return { id: `fed-${run.payDate}`, kind: 'federal', period: run.payDate, amount: federalLiability(run.results), dueDate: due, status: paid ? 'paid' : 'scheduled', paidAt: paid ? due : undefined }
}

