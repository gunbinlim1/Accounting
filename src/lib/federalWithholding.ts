import { federalBrackets, periodsPerYear, standardDeduction } from '../config/payrollConfig'
import type { FilingStatus, PayFrequency, W4 } from '../types'
import { roundCents } from './money'

/** IRS 규정: W-4를 받지 못한 신규 직원은 Single, 조정 없음으로 원천징수 */
export const defaultW4: W4 = {
  filingStatus: 'single',
  multipleJobs: false,
  dependentsAmount: 0,
  otherIncome: 0,
  deductions: 0,
  extraWithholding: 0,
  exempt: false,
  signedDate: '',
}

function bracketTax(taxable: number, status: FilingStatus, half: boolean): number {
  if (taxable <= 0) return 0
  const brackets = federalBrackets[status]
  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const lo = brackets[i].over * (half ? 0.5 : 1)
    const hi = i + 1 < brackets.length ? brackets[i + 1].over * (half ? 0.5 : 1) : Infinity
    if (taxable <= lo) break
    tax += (Math.min(taxable, hi) - lo) * brackets[i].rate
  }
  return tax
}

/**
 * Pub. 15-T 연간 퍼센트 방식 (2020 이후 W-4, 자동 급여 시스템).
 * Step 2 체크 시 표준공제와 구간 폭을 절반으로 적용합니다.
 */
export function federalIncomeTaxWithholding(
  taxableWagesThisPeriod: number,
  frequency: PayFrequency,
  w4: W4 | null,
): number {
  const form = w4 ?? defaultW4
  if (form.exempt || taxableWagesThisPeriod <= 0) return 0

  const periods = periodsPerYear[frequency]
  const half = form.multipleJobs
  const annualWages = taxableWagesThisPeriod * periods + form.otherIncome
  const deductionBase = standardDeduction[form.filingStatus] * (half ? 0.5 : 1)
  const taxable = annualWages - form.deductions - deductionBase

  const annualTax = Math.max(0, bracketTax(taxable, form.filingStatus, half) - form.dependentsAmount)
  return roundCents(Math.max(0, annualTax / periods) + form.extraWithholding)
}
