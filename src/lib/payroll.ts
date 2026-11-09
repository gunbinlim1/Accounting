import { payrollConfig, periodsPerYear } from '../config/payrollConfig'
import type { PayrollInput, PayrollResult } from '../types'

/** 센트 단위로 반올림 (부동소수점 오차 방지) */
export const roundCents = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

export function calculateGrossPay(input: PayrollInput): number {
  const { employee, payFrequency, regularHours = 0, overtimeHours = 0 } = input

  if (employee.payType === 'salary') {
    return roundCents(employee.rate / periodsPerYear[payFrequency])
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
  // FICA는 401(k) 세전 공제 전 총급여 기준이며, 회사도 같은 금액을 부담
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
    employerSocialSecurity: socialSecurity,
    employerMedicare: medicare,
    employerCost: roundCents(grossPay + socialSecurity + medicare),
  }
}

export interface PayrollTotals {
  gross: number
  net: number
  pretax: number
  federal: number
  state: number
  socialSecurity: number
  medicare: number
  employerTaxes: number
  employerCost: number
  /** IRS에 예치할 금액: 연방 원천징수 + 직원·회사 FICA */
  federalDeposit: number
}

export function sumResults(results: PayrollResult[]): PayrollTotals {
  const t = results.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      net: acc.net + r.netPay,
      pretax: acc.pretax + r.pretaxDeductions,
      federal: acc.federal + r.federalWithholding,
      state: acc.state + r.stateWithholding,
      socialSecurity: acc.socialSecurity + r.socialSecurity,
      medicare: acc.medicare + r.medicare,
      employerTaxes: acc.employerTaxes + r.employerSocialSecurity + r.employerMedicare,
      employerCost: acc.employerCost + r.employerCost,
    }),
    {
      gross: 0, net: 0, pretax: 0, federal: 0, state: 0,
      socialSecurity: 0, medicare: 0, employerTaxes: 0, employerCost: 0,
    },
  )
  const rounded = Object.fromEntries(
    Object.entries(t).map(([k, v]) => [k, roundCents(v)]),
  ) as Omit<PayrollTotals, 'federalDeposit'>
  return {
    ...rounded,
    federalDeposit: roundCents(
      rounded.federal + rounded.socialSecurity + rounded.medicare + rounded.employerTaxes,
    ),
  }
}
