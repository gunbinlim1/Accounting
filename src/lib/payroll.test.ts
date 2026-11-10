import { describe, expect, it } from 'vitest'
import type { Employee } from '../types'
import { defaultW4 } from './federalWithholding'
import { calculatePayroll, sumResults, tippedOvertimeRate } from './payroll'

const base: Omit<Employee, 'id' | 'payType' | 'rate' | 'role'> = {
  name: 'Test',
  pretaxDeferralRate: 0,
  active: true,
  hireDate: '2026-01-01',
  ssnLast4: '0000',
  address: { street: '', city: 'Houston', state: 'TX', zip: '77001' },
  w4: defaultW4,
  i9: { citizenship: 'citizen', documentPath: 'A', documents: [] },
}

const server: Employee = { ...base, id: 's', role: 'server', payType: 'tipped', rate: 2.13 }
const cook: Employee = { ...base, id: 'c', role: 'cook', payType: 'hourly', rate: 16 }
const manager: Employee = { ...base, id: 'm', role: 'manager', payType: 'salary', rate: 52_000, pretaxDeferralRate: 0.05 }

const run = (employee: Employee, time = {}, ytd = {}) =>
  calculatePayroll({ employee, payFrequency: 'biweekly', time, ytd })

describe('팁 직원 (tipped)', () => {
  it('초과근무 현금 시급은 $5.755', () => {
    expect(tippedOvertimeRate(2.13)).toBeCloseTo(5.755, 3)
  })

  it('팁이 충분하면 최저임금 보전이 없다', () => {
    const r = run(server, { regular: 60, overtime: 4, cashTips: 300, cardTips: 900 })
    expect(r.regularPay).toBe(127.8)
    expect(r.overtimePay).toBe(23.02)
    expect(r.tipMakeUp).toBe(0)
    expect(r.grossPay).toBe(1350.82)
  })

  it('팁 포함 시급이 $7.25 미만이면 차액을 보전한다', () => {
    const r = run(server, { regular: 40, cashTips: 50, cardTips: 0 })
    // 필요 40 × 7.25 = 290, 지급 85.2 + 팁 50 = 135.2 → 보전 154.8
    expect(r.tipMakeUp).toBe(154.8)
  })

  it('현금 팁은 실수령액(수표)에서 제외된다', () => {
    const r = run(server, { regular: 60, cashTips: 300, cardTips: 900 })
    expect(r.netPay).toBeCloseTo(r.grossPay - r.cashTips - r.totalDeductions, 2)
  })

  it('급여가 부족하면 FICA 미징수액을 기록하고 실수령액은 0 이상', () => {
    const r = run(server, { regular: 20, cashTips: 1200, cardTips: 0 })
    expect(r.netPay).toBeGreaterThanOrEqual(0)
    expect(r.uncollectedFica).toBeGreaterThan(0)
  })

  it('45B 팁 크레딧은 $5.15 기준 초과 팁에 대한 FICA', () => {
    const r = run(server, { regular: 40, cashTips: 0, cardTips: 400 })
    // 40h × 5.15 = 206 − 임금 85.2 = 120.8 은 최저임금 충족용 → 279.2 × 7.65%
    expect(r.tipCredit45B).toBe(21.36)
  })
})

describe('시급 직원 (hourly)', () => {
  it('초과근무 1.5배와 OT 프리미엄(W-2 보고용)', () => {
    const r = run(cook, { regular: 80, overtime: 10 })
    expect(r.regularPay).toBe(1280)
    expect(r.overtimePay).toBe(240)
    expect(r.qualifiedOvertimePremium).toBe(80)
  })
})

describe('텍사스 고용주 세금', () => {
  it('주 소득세 원천징수가 없고 FUTA·TWC 상한을 지킨다', () => {
    const r = run(cook, { regular: 80 }, { gross: 8_500, futaWages: 7_000, sutaWages: 8_500 })
    expect(r.futa).toBe(0)
    expect(r.suta).toBe(13.5) // 남은 $500 × 2.7%
  })
})

describe('연봉 직원 (salary)', () => {
  it('401(k)는 연방소득세 과세소득만 줄이고 FICA는 총급여 기준', () => {
    const r = run(manager)
    expect(r.grossPay).toBe(2000)
    expect(r.pretaxDeductions).toBe(100)
    expect(r.federalTaxableWages).toBe(1900)
    expect(r.socialSecurity).toBe(124)
    expect(r.medicare).toBe(29)
  })
})

describe('sumResults', () => {
  it('IRS 예치액 = 연방 원천징수 + 직원·회사 FICA', () => {
    const a = run(manager)
    const t = sumResults([a])
    expect(t.federalDeposit).toBeCloseTo(a.federalWithholding + 2 * (a.socialSecurity + a.medicare), 2)
  })
})

describe('회차별 급여 금액 (rate override)', () => {
  it('시급 직원은 입력한 시급을 그대로 사용', async () => {
    const { effectiveEmployee } = await import('./payroll')
    expect(effectiveEmployee(cook, { rate: 18 }, 'biweekly').rate).toBe(18)
    expect(effectiveEmployee(cook, {}, 'biweekly').rate).toBe(16)
  })

  it('연봉 직원은 회당 금액 × 26 = 연봉', async () => {
    const { effectiveEmployee } = await import('./payroll')
    const e = effectiveEmployee(manager, { rate: 2_200 }, 'biweekly')
    expect(e.rate).toBe(57_200)
    expect(run(e).grossPay).toBe(2_200)
  })
})

describe('Fringe Benefit (Pub. 15-B)', () => {
  it('회사 부담 건강보험은 모든 세금 면제, 순급여 변화 없음', () => {
    const base = run(manager)
    const r = run(manager, { fringes: [{ id: 'f', itemId: 'health', amount: 450 }] })
    expect(r.fringeTotal).toBe(450)
    expect(r.ficaWages).toBe(base.ficaWages)
    expect(r.netPay).toBe(base.netPay)
  })
  it('단체 생명보험 초과분은 FICA만 원천징수, Box 1에는 포함', () => {
    const base = run(manager)
    const r = run(manager, { fringes: [{ id: 'f', itemId: 'gtl', amount: 100 }] })
    expect(r.socialSecurity).toBeCloseTo(base.socialSecurity + 6.2, 2)
    expect(r.federalWithholding).toBe(base.federalWithholding)
    expect(r.box1Wages).toBeCloseTo(base.box1Wages + 100, 2)
    expect(r.futa).toBe(base.futa)
  })
  it('기프트카드는 소득세·FICA·FUTA 모두 과세, 현금 지급은 아님', () => {
    const base = run(cook, { regular: 80 })
    const r = run(cook, { regular: 80, fringes: [{ id: 'f', itemId: 'gift_card', amount: 100 }] })
    expect(r.federalTaxableWages).toBeCloseTo(base.federalTaxableWages + 100, 2)
    expect(r.grossPay).toBe(base.grossPay)
    expect(r.netPay).toBeLessThan(base.netPay)
  })
  it('부양가족 돌봄 지원은 연 $7,500 초과분만 과세', () => {
    const r = run(manager, { fringes: [{ id: 'f', itemId: 'dependent_care', amount: 1000 }] }, { fringe: { dependent_care: 7_000 } })
    expect(r.fringeLines[0].fica).toBe(500)
    expect(r.fringeLines[0].fit).toBe(500)
  })
})
