import { describe, expect, it } from 'vitest'
import { employmentStatus, payableIn, tenureMonths } from './employment'

const e = (hireDate: string, terminationDate?: string, active = !terminationDate) => ({ hireDate, terminationDate, active })

describe('입사·퇴사일', () => {
  it('급여 기간에 걸친 사람만 급여 대상', () => {
    expect(payableIn(e('2026-11-20'), '2026-11-14', '2026-11-27')).toBe(true)
    expect(payableIn(e('2026-11-30'), '2026-11-14', '2026-11-27')).toBe(false)
    expect(payableIn(e('2025-01-01', '2026-11-18'), '2026-11-14', '2026-11-27')).toBe(true)
    expect(payableIn(e('2025-01-01', '2026-11-10'), '2026-11-14', '2026-11-27')).toBe(false)
    expect(payableIn(e('2025-01-01', undefined, false), '2026-11-14', '2026-11-27')).toBe(false)
  })

  it('상태', () => {
    expect(employmentStatus(e('2026-12-01'), '2026-11-26')).toBe('upcoming')
    expect(employmentStatus(e('2026-01-01'), '2026-11-26')).toBe('active')
    expect(employmentStatus(e('2026-01-01', '2026-12-04'), '2026-11-26')).toBe('leaving')
    expect(employmentStatus(e('2026-01-01', '2026-11-01'), '2026-11-26')).toBe('former')
  })

  it('재직 개월 수는 퇴사일에서 멈춘다', () => {
    expect(tenureMonths(e('2026-01-15'), '2026-11-26')).toBe(10)
    expect(tenureMonths(e('2026-01-15', '2026-04-10'), '2026-11-26')).toBe(2)
  })
})
