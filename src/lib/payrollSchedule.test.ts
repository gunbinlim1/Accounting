import { describe, expect, it } from 'vitest'
import { buildSchedule } from './payrollSchedule'
import { parseISODate, toISODate } from './schedule'

const base = {
  frequency: 'biweekly' as const,
  anchor: parseISODate('2026-01-09'),
  currentPayDate: parseISODate('2026-11-27'),
  cutoffBusinessDays: 2,
}

describe('buildSchedule', () => {
  it('이번 회차 + 다음 3회차를 보여 준다', () => {
    const rows = buildSchedule({ ...base, processedPayDates: [] })
    expect(rows.map((r) => r.kind)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming'])
    expect(rows.map((r) => toISODate(r.payDate))).toEqual(['2026-11-27', '2026-12-11', '2026-12-25', '2027-01-08'])
    expect(toISODate(rows[0].start)).toBe('2026-11-14')
    expect(toISODate(rows[0].cutoff)).toBe('2026-11-25')
  })

  it('가입 후 시작된 기간 중 처리 안 된 회차는 미처리로 표시한다', () => {
    const rows = buildSchedule({ ...base, createdAt: '2026-10-01T10:00:00Z', processedPayDates: ['2026-10-30'] })
    expect(rows.filter((r) => r.kind === 'missed').map((r) => toISODate(r.payDate))).toEqual(['2026-10-16', '2026-11-13'])
  })

  it('가입 전에 시작된 기간은 미처리로 보지 않는다', () => {
    const rows = buildSchedule({ ...base, createdAt: '2026-11-11T10:00:00Z', processedPayDates: [] })
    expect(rows.some((r) => r.kind === 'missed')).toBe(false)
  })
})
