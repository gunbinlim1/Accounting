import { describe, expect, it } from 'vitest'
import type { Employee, PayRun, PayrollResult, PtoAdjustment, PtoPolicy, PtoRequest } from '../types'
import { approvedHoursInPeriod, defaultRequestHours, ptoLedger, weekdaysBetween } from './pto'
import { parseISODate } from './schedule'

const emp = { id: 'e1', payType: 'hourly', hireDate: '2026-03-02', payFrequency: 'biweekly' } as Employee
const salaried = { ...emp, id: 'e2', payType: 'salary' } as Employee
const policy: PtoPolicy = { id: 'p1', name: 'PTO', kind: 'pto', accrual: 'per_hour', amount: 1, perHours: 30, maxBalance: null, appliesTo: ['hourly', 'tipped', 'salary'], active: true }
const run = (payDate: string, hours: number, used = 0, id = 'e1'): PayRun => ({
  id: `run-${payDate}`, payDate, approvedAt: '', results: [{ employeeId: id, hours } as PayrollResult],
  time: { [id]: { regular: hours, overtime: 0, cashTips: 0, cardTips: 0, ...(used ? { timeOff: { p1: used } } : {}) } },
})
const adj = (hours: number, date = '2026-03-02'): PtoAdjustment => ({ id: 'a', employeeId: 'e1', policyId: 'p1', hours, effectiveDate: date, reason: 'opening', createdByName: '', createdAt: '' })
const today = parseISODate('2026-11-25')

describe('PTO 잔액', () => {
  it('근무 30시간당 1시간 적립, 사용분은 뺀다', () => {
    const b = ptoLedger(emp, policy, [run('2026-10-30', 60), run('2026-11-13', 72, 4)], [adj(8)], today)
    expect(b.accrued).toBe(4.4)
    expect(b.used).toBe(4)
    expect(b.balance).toBe(8.4)
    expect(b.entries.map((x) => x.kind)).toEqual(['adjusted', 'accrued', 'accrued', 'used'])
  })

  it('최대 잔액을 넘으면 적립이 멈춘다', () => {
    const capped = { ...policy, maxBalance: 10 }
    const b = ptoLedger(emp, capped, [run('2026-10-30', 120), run('2026-11-13', 120)], [adj(8)], today)
    expect(b.balance).toBe(10)
    expect(b.entries.some((x) => x.capped)).toBe(true)
  })

  it('연봉 직원은 회차마다 표준 근무 시간(격주 80시간)으로 적립', () => {
    const b = ptoLedger(salaried, policy, [run('2026-11-13', 0, 0, 'e2')], [], today)
    expect(b.accrued).toBe(2.67)
  })

  it('회차마다 고정 적립 / 매년 지급', () => {
    expect(ptoLedger(emp, { ...policy, accrual: 'per_period', amount: 3 }, [run('2026-10-30', 10), run('2026-11-13', 0)], [], today).balance).toBe(6)
    const annual = ptoLedger(emp, { ...policy, accrual: 'annual', amount: 40 }, [], [], parseISODate('2027-02-01'))
    expect(annual.entries.map((x) => x.date)).toEqual(['2026-03-02', '2027-01-01'])
    expect(annual.balance).toBe(80)
  })
})

describe('휴가 시간', () => {
  it('평일만 센다', () => {
    expect(weekdaysBetween('2026-11-20', '2026-11-24')).toBe(3)
    expect(defaultRequestHours('2026-11-23', '2026-11-27')).toBe(40)
  })

  it('승인된 휴가 중 급여 기간에 들어가는 만큼만', () => {
    const req = (startDate: string, endDate: string, hours: number, status: PtoRequest['status'] = 'approved'): PtoRequest =>
      ({ id: startDate, employeeId: 'e1', policyId: 'p1', startDate, endDate, hours, note: '', status, requestedBy: 'client', createdAt: '' })
    const reqs = [req('2026-11-26', '2026-12-01', 32), req('2026-11-18', '2026-11-18', 8, 'pending'), req('2026-11-17', '2026-11-17', 8)]
    // 기간 11/14–11/27: 11/17 8시간 + 11/26~27(4일 중 2일) 16시간
    expect(approvedHoursInPeriod(reqs, 'e1', 'p1', '2026-11-14', '2026-11-27')).toBe(24)
  })
})
