import { describe, expect, it } from 'vitest'
import { sampleEmployees } from '../test/sampleEmployees'
import { runChecks } from './checks'
import { calculatePayroll } from './payroll'
import type { TimeEntry } from '../types'

const today = new Date(2026, 10, 9)
const employees = sampleEmployees(today).filter((e) => e.active)
const time: Record<string, TimeEntry> = Object.fromEntries(
  employees.map((e) => [e.id, { regular: 60, overtime: 0, cashTips: e.payType === 'tipped' ? 0 : 0, cardTips: 0 }]),
)
const results = employees.map((employee) => calculatePayroll({ employee, payFrequency: 'biweekly', time: time[employee.id] }))
const checks = runChecks({ employees, time, results, ytdGross: {}, standardHours: 80, today })

describe('runChecks', () => {
  it('서류 문제는 승인을 막지 않는다 (critical 아님)', () => {
    const paperwork = checks.filter((c) => /-(i9|auth|w4)$/.test(c.id))
    expect(paperwork.length).toBeGreaterThan(0)
    expect(paperwork.every((c) => c.severity !== 'critical')).toBe(true)
  })

  it('팁 신고가 없는 팁 직원을 찾아낸다', () => {
    expect(checks.some((c) => c.id === 'EMP-001-notips')).toBe(true)
  })

  it('팁이 없으면 최저임금 보전을 안내한다', () => {
    expect(checks.some((c) => c.id === 'EMP-001-makeup')).toBe(true)
  })

  it('최저 현금 시급 미만은 승인 차단', () => {
    const low = { ...employees[0], rate: 2 }
    const r = [calculatePayroll({ employee: low, payFrequency: 'biweekly', time: time[low.id] })]
    const c = runChecks({ employees: [low], time, results: r, ytdGross: {}, standardHours: 80, today })
    expect(c.some((x) => x.severity === 'critical')).toBe(true)
  })
})

describe('연봉 면제 기준', () => {
  it('연 $35,568 미만 연봉은 경고', () => {
    const mgr = { ...employees.find((e) => e.payType === 'salary')!, rate: 30_000 }
    const r = [calculatePayroll({ employee: mgr, payFrequency: 'biweekly' })]
    const c = runChecks({ employees: [mgr], time: {}, results: r, ytdGross: {}, standardHours: 80, today })
    expect(c.some((x) => x.id === `${mgr.id}-exempt` && x.severity === 'warning')).toBe(true)
  })
})
