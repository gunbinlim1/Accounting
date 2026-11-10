import { describe, expect, it } from 'vitest'
import type { PayRun, PayrollResult } from '../types'
import { federalDueDate, form941, futaSchedule, quarterDueDate, w2For } from './taxes'

const res = (p: Partial<PayrollResult>): PayrollResult => ({
  employeeId: 'e', hours: 0, regularPay: 0, overtimePay: 0, tipMakeUp: 0, cashTips: 0, cardTips: 0, grossPay: 0,
  pretaxDeductions: 0, federalTaxableWages: 0, federalWithholding: 0, socialSecurity: 0, medicare: 0, uncollectedFica: 0,
  totalDeductions: 0, netPay: 0, employerSocialSecurity: 0, employerMedicare: 0, futa: 0, suta: 0, employerTaxes: 0,
  employerCost: 0, tipCredit45B: 0, qualifiedOvertimePremium: 0, fringeTotal: 0, ficaWages: 0, futaWages: 0, box1Wages: 0, fringeLines: [], ...p,
})
const run = (payDate: string, results: PayrollResult[]): PayRun => ({ id: payDate, payDate, approvedAt: payDate, time: {}, results })

describe('예치 기한', () => {
  it('월별 예치자는 다음 달 15일', () => {
    expect(federalDueDate('2026-11-13', 'monthly')).toBe('2026-12-15')
  })
  it('반주별: 금요일 지급 → 다음 주 수요일, 화요일 지급 → 그 주 금요일', () => {
    expect(federalDueDate('2026-11-13', 'semiweekly')).toBe('2026-11-18')
    expect(federalDueDate('2026-11-10', 'semiweekly')).toBe('2026-11-13')
  })
  it('분기 기한', () => {
    expect(quarterDueDate(2026, 1)).toBe('2026-04-30')
    expect(quarterDueDate(2026, 4)).toBe('2027-01-31')
  })
})

describe('FUTA $500 규칙', () => {
  it('누적 $500 이하면 이월, 넘으면 예치', () => {
    const runs = [run('2026-02-06', [res({ futa: 300 })]), run('2026-05-01', [res({ futa: 250 })]), run('2026-08-07', [res({ futa: 10 })])]
    const s = futaSchedule(runs, 2026)
    expect(s[0]).toMatchObject({ accumulated: 300, mustDeposit: false })
    expect(s[1]).toMatchObject({ carriedIn: 300, accumulated: 550, mustDeposit: true })
    expect(s[2]).toMatchObject({ carriedIn: 0, accumulated: 10, mustDeposit: false })
  })
})

describe('941·W-2', () => {
  const r = res({ employeeId: 'e', grossPay: 1000, ficaWages: 1100, futaWages: 1000, box1Wages: 950, federalWithholding: 80, socialSecurity: 68.2, medicare: 15.95, employerSocialSecurity: 68.2, employerMedicare: 15.95, cashTips: 100, cardTips: 200, pretaxDeductions: 50,
    fringeLines: [{ itemId: 'health', amount: 400, fit: 0, fica: 0, futa: 0 }, { itemId: 'gtl', amount: 100, fit: 100, fica: 100, futa: 0 }] })
  it('941 총 세금은 원천징수 + FICA 양쪽', () => {
    const f = form941([run('2026-10-02', [r])], [], 2026, 4)
    expect(f.line12).toBeCloseTo(80 + 2 * (68.2 + 15.95), 2)
    expect(f.line5b).toBe(300)
    expect(f.line5a).toBe(800)
  })
  it('W-2 Box 12에 401(k) D, 건강보험 DD, 생명보험 C', () => {
    const w = w2For([run('2026-10-02', [r])], 'e', 2026)
    expect(w.box12.find((x) => x.code === 'D')?.amount).toBe(50)
    expect(w.box12.find((x) => x.code === 'DD')?.amount).toBe(400)
    expect(w.box12.find((x) => x.code === 'C')?.amount).toBe(100)
    expect(w.box7).toBe(300)
    expect(w.box3).toBe(800)
  })
})
