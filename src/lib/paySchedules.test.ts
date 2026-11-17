import { describe, expect, it } from 'vitest'
import type { PaySchedule } from '../types'
import { openPeriod, openRuns, periodsAfter, periodsBefore, scheduleOf, validateOverride } from './paySchedules'
import { parseISODate } from './schedule'

const biweekly: PaySchedule = { id: 'b', name: '', frequency: 'biweekly', firstPayDate: '2026-01-09', overrides: {}, isDefault: true, active: true }
const monthly: PaySchedule = { id: 'm', name: 'Office', frequency: 'monthly', firstPayDate: '2026-01-31', overrides: {}, isDefault: false, active: true }
const semi: PaySchedule = { id: 's', name: '', frequency: 'semimonthly', firstPayDate: '2026-01-15', overrides: {}, isDefault: false, active: true }
const day = (iso: string) => parseISODate(iso)
const t = (ko: string) => ko

describe('pay schedules', () => {
  it('open period is the first one paid today or later', () => {
    expect(openPeriod(biweekly, day('2026-11-17'))).toMatchObject({ scheduled: '2026-11-27', payDate: '2026-11-27', start: '2026-11-14', end: '2026-11-27' })
    expect(openPeriod(biweekly, day('2026-11-27')).payDate).toBe('2026-11-27')
    expect(openPeriod(monthly, day('2026-11-17'))).toMatchObject({ payDate: '2026-11-30', start: '2026-11-01', end: '2026-11-30' })
    expect(openPeriod(semi, day('2026-11-17'))).toMatchObject({ payDate: '2026-11-30', start: '2026-11-16' })
  })

  it('applies a changed pay date and period to that one run only', () => {
    const moved = { ...biweekly, overrides: { '2026-11-27': { payDate: '2026-11-25', start: '2026-11-13', end: '2026-11-26' } } }
    expect(openPeriod(moved, day('2026-11-17'))).toMatchObject({ scheduled: '2026-11-27', payDate: '2026-11-25', start: '2026-11-13', changed: true })
    expect(periodsAfter(moved, openPeriod(moved, day('2026-11-17')), 1)[0]).toMatchObject({ payDate: '2026-12-11', changed: false })
    // 지급일을 앞당기면 그 날이 지난 뒤에는 다음 회차가 열림
    expect(openPeriod(moved, day('2026-11-26')).payDate).toBe('2026-12-11')
  })

  it('groups schedules paying on the same day into one run, earliest first', () => {
    const runs = openRuns([biweekly, monthly, semi], day('2026-11-17'))
    expect(runs.map((r) => [r.payDate, r.schedules.map((x) => x.schedule.id)])).toEqual([
      ['2026-11-27', ['b']],
      ['2026-11-30', ['m', 's']],
    ])
    expect(openRuns([biweekly, { ...monthly, active: false }], day('2026-11-17'))).toHaveLength(1)
  })

  it('lists earlier periods that started after a date', () => {
    const p = openPeriod(biweekly, day('2026-11-17'))
    expect(periodsBefore(biweekly, p, '2026-10-17', 5).map((x) => x.payDate)).toEqual(['2026-11-13', '2026-10-30'])
  })

  it('finds an employee’s schedule, falling back to the default', () => {
    expect(scheduleOf({ scheduleId: 'm' }, [biweekly, monthly])?.id).toBe('m')
    expect(scheduleOf({}, [biweekly, monthly])?.id).toBe('b')
    expect(scheduleOf({ scheduleId: 'm' }, [biweekly, { ...monthly, active: false }])?.id).toBe('b')
  })

  it('checks changed dates', () => {
    expect(validateOverride({ payDate: '2026-11-25', start: '2026-11-14', end: '2026-11-27' }, t)).toBeNull()
    expect(validateOverride({ payDate: '2026-11-27', start: '2026-11-28', end: '2026-11-27' }, t)).toMatch(/시작일/)
    expect(validateOverride({ payDate: '2027-02-27', start: '2026-11-14', end: '2026-11-27' }, t)).toMatch(/멀어요/)
  })
})
