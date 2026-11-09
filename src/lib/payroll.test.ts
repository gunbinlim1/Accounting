import { describe, expect, it } from 'vitest'
import type { Employee } from '../types'
import { calculateGrossPay, calculatePayroll, calculateSocialSecurity } from './payroll'

const salaried: Employee = {
  id: 'e1',
  name: 'Test Salaried',
  department: 'Audit',
  payType: 'salary',
  rate: 78_000,
  payFrequency: 'biweekly',
  pretaxDeferralRate: 0.05,
  active: true,
}

const hourly: Employee = {
  ...salaried,
  id: 'e2',
  payType: 'hourly',
  rate: 20,
  payFrequency: 'weekly',
  pretaxDeferralRate: 0,
}

describe('calculateGrossPay', () => {
  it('연봉을 지급 주기로 나눈다', () => {
    expect(calculateGrossPay({ employee: salaried })).toBe(3000)
  })

  it('시급 근로자의 초과근무에 1.5배를 적용한다', () => {
    expect(calculateGrossPay({ employee: hourly, regularHours: 40, overtimeHours: 5 })).toBe(950)
  })
})

describe('calculateSocialSecurity', () => {
  it('연간 상한을 넘는 금액에는 부과하지 않는다', () => {
    expect(calculateSocialSecurity(5000, 183_500)).toBe(62)
    expect(calculateSocialSecurity(5000, 200_000)).toBe(0)
  })
})

describe('calculatePayroll', () => {
  it('공제 합계와 실수령액이 일치한다', () => {
    const r = calculatePayroll({ employee: salaried })
    expect(r.grossPay).toBe(3000)
    expect(r.pretaxDeductions).toBe(150)
    expect(r.taxableWages).toBe(2850)
    expect(r.socialSecurity).toBe(186)
    expect(r.medicare).toBe(43.5)
    expect(r.netPay).toBeCloseTo(r.grossPay - r.totalDeductions, 2)
  })
})
