import { payrollConfig, periodsPerYear } from '../config/payrollConfig'
import type { PayrollInput, PayrollResult } from '../types'

/** 센트 단위로 반올림 (부동소수점 오차 방지) */
export const roundCents = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

export function calculateGrossPay(input: PayrollInput): number {
  const { employee, regularHours = 0, overtimeHours = 0 } = input

  if (employee.payType === 'salary') {
    return roundCents(employee.rate / periodsPerYear[employee.payFrequency])
  }

  const regular = employee.rate * regularHours
  const overtime = employee.rate * payrollConfig.overtimeMultiplier * overtimeHours
  return roundCents(regular + overtime)
}

export function calculateSocialSecurity(grossPay: number, ytdGross = 0): number {
  const remainingBase = Math.max(0, payrollConfig.socialSecurityWageBase - ytdGross)
  const subjectWages = Math.min(grossPay, remainingBase)
  return roundCents(subjectWages * payrollConfig.socialSecurityRate)
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const grossPay = calculateGrossPay(input)
  const pretaxDeductions = roundCents(grossPay * input.employee.pretaxDeferralRate)
  const taxableWages = roundCents(grossPay - pretaxDeductions)

  const federalWithholding = roundCents(taxableWages * payrollConfig.federalWithholdingRate)
  const stateWithholding = roundCents(taxableWages * payrollConfig.stateWithholdingRate)
  // FICA는 401(k) 세전 공제 전 총급여 기준
  const socialSecurity = calculateSocialSecurity(grossPay, input.ytdGross)
  const medicare = roundCents(grossPay * payrollConfig.medicareRate)

  const totalDeductions = roundCents(
    pretaxDeductions + federalWithholding + stateWithholding + socialSecurity + medicare,
  )

  return {
    employeeId: input.employee.id,
    grossPay,
    pretaxDeductions,
    taxableWages,
    federalWithholding,
    stateWithholding,
    socialSecurity,
    medicare,
    totalDeductions,
    netPay: roundCents(grossPay - totalDeductions),
  }
}
