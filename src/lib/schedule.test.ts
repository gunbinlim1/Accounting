import { describe, expect, it } from 'vitest'
import { nextPayDate, parseISODate, previousPayDate, toISODate, upcomingDeadlines } from './schedule'

const anchor = parseISODate('2026-01-09')

describe('nextPayDate', () => {
  it('격주 급여일을 기준일부터 14일 간격으로 찾는다', () => {
    expect(toISODate(nextPayDate('biweekly', anchor, parseISODate('2026-11-09')))).toBe('2026-11-13')
    expect(toISODate(nextPayDate('biweekly', anchor, parseISODate('2026-11-13')))).toBe('2026-11-13')
    expect(toISODate(nextPayDate('biweekly', anchor, parseISODate('2026-11-14')))).toBe('2026-11-27')
  })

  it('월 2회는 15일과 말일이다', () => {
    expect(toISODate(nextPayDate('semimonthly', anchor, parseISODate('2026-02-16')))).toBe('2026-02-28')
  })
})

describe('previousPayDate', () => {
  it('격주는 14일 전이다', () => {
    expect(toISODate(previousPayDate('biweekly', parseISODate('2026-11-13')))).toBe('2026-10-30')
  })
})

describe('upcomingDeadlines', () => {
  it('오늘 이후의 기한만 날짜순으로 반환한다', () => {
    const list = upcomingDeadlines(parseISODate('2026-11-09'), 4)
    expect(list.map((d) => toISODate(d.date))).toEqual([
      '2027-01-31', '2027-01-31', '2027-01-31', '2027-04-30',
    ])
  })
})
