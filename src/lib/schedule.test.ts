import { describe, expect, it } from 'vitest'
import { cutoffFor, nextPayDate, parseISODate, pastPayDates, payPeriodFor, previousPayDate, toISODate, upcomingDeadlines, upcomingPayDates } from './schedule'

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
    const list = upcomingDeadlines(parseISODate('2026-11-09'), 5)
    expect(list.every((d) => toISODate(d.date) >= '2026-11-09')).toBe(true)
    expect(list.map((d) => d.form)).toContain('TWC Q4')
    expect(toISODate(list[list.length - 1].date)).toBe('2027-03-31')
  })
})

describe('급여 일정표', () => {
  it('급여 기간은 직전 급여일 다음 날부터 급여일까지다', () => {
    const p = payPeriodFor('biweekly', parseISODate('2026-11-27'))
    expect(toISODate(p.start)).toBe('2026-11-14')
    expect(toISODate(p.end)).toBe('2026-11-27')
    const s = payPeriodFor('semimonthly', parseISODate('2026-11-30'))
    expect(toISODate(s.start)).toBe('2026-11-16')
  })

  it('다가오는 급여일을 차례로 반환한다', () => {
    const list = upcomingPayDates('biweekly', anchor, parseISODate('2026-11-16'), 3).map(toISODate)
    expect(list).toEqual(['2026-11-27', '2026-12-11', '2026-12-25'])
  })

  it('지난 급여일은 기준일 이후 것만, 최근 순으로', () => {
    const list = pastPayDates('biweekly', parseISODate('2026-11-27'), parseISODate('2026-10-20'), 5).map(toISODate)
    expect(list).toEqual(['2026-11-13', '2026-10-30'])
  })

  it('마감은 지급일 2영업일 전 오후 3시다', () => {
    const d = cutoffFor(parseISODate('2026-11-30'), 2)
    expect(toISODate(d)).toBe('2026-11-26')
    expect(d.getHours()).toBe(15)
  })
})
