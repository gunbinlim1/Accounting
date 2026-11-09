import { describe, expect, it } from 'vitest'
import { defaultW4, federalIncomeTaxWithholding } from './federalWithholding'

const perPeriod = 75_000 / 26

describe('federalIncomeTaxWithholding (2026)', () => {
  it('Single, 조정 없음: 연 $75,000 → 연 $7,670', () => {
    expect(federalIncomeTaxWithholding(perPeriod, 'biweekly', defaultW4)).toBe(295)
  })

  it('MFJ, 조정 없음: 연 $75,000 → 연 $4,640', () => {
    expect(federalIncomeTaxWithholding(perPeriod, 'biweekly', { ...defaultW4, filingStatus: 'married' })).toBe(178.46)
  })

  it('W-4 미제출이면 Single 기준으로 원천징수', () => {
    expect(federalIncomeTaxWithholding(perPeriod, 'biweekly', null)).toBe(295)
  })

  it('Step 3 부양가족 공제와 Step 4(c) 추가 원천징수를 반영', () => {
    const w4 = { ...defaultW4, dependentsAmount: 2_600, extraWithholding: 20 }
    expect(federalIncomeTaxWithholding(perPeriod, 'biweekly', w4)).toBe(215)
  })

  it('Step 2 체크 시 더 많이 원천징수', () => {
    const base = federalIncomeTaxWithholding(perPeriod, 'biweekly', defaultW4)
    const multi = federalIncomeTaxWithholding(perPeriod, 'biweekly', { ...defaultW4, multipleJobs: true })
    expect(multi).toBeGreaterThan(base)
  })

  it('면세(Exempt)면 0', () => {
    expect(federalIncomeTaxWithholding(perPeriod, 'biweekly', { ...defaultW4, exempt: true })).toBe(0)
  })
})
