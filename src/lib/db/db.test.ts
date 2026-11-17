import { describe, expect, it } from 'vitest'
import { defaultW4 } from '../federalWithholding'
import type { CompanyData, Employee } from '../../types'
import { employeeFromRow, employeeToRow, runsFromRows, secretsOf, withoutSecrets, type EmployeeRow, type ResultRow } from './mappers'
import { planWrites } from './plan'

const emp: Employee = {
  id: 'e1', firstName: 'Maria', lastName: 'Lopez', middleInitial: 'L', role: 'server', payType: 'tipped', rate: 2.13, pretaxDeferralRate: 0.03,
  active: true, hireDate: '2026-01-05', ssnLast4: '6789', ssnOnFile: true,
  address: { street: '1 Main', city: 'Houston', state: 'TX', zip: '77036' },
  w4: defaultW4, i9: { citizenship: 'citizen', documentPath: 'BC', documents: [] },
  payMethod: 'direct_deposit', bank: { routingLast4: '0025', accountLast4: '3456', type: 'checking', onFile: true }, eConsent: true, documents: [],
}

const base: CompanyData = {
  company: {
    id: 'c1', legalName: 'A LLC', dba: 'A Cafe', industry: 'restaurant', tipsEnabled: true, ein: '12-3456789', twcAccount: '', sutaRate: 0.027,
    depositSchedule: 'semiweekly', address: { street: '', city: '', state: 'TX', zip: '' }, ownerName: 'A', ownerEmail: 'a@a.example', phone: '',
    cutoffBusinessDays: 2, authorizations: { form8655: 'pending', twcAgent: 'pending', bankDebit: 'pending' }, documents: [],
  },
  employees: [emp],
  schedules: [],
  time: { e1: { regular: 60, overtime: 0, cashTips: 300, cardTips: 800 } },
  timeDates: { e1: '2026-11-13' },
  runs: [],
  open: { '2026-11-13': { payDate: '2026-11-13', status: 'draft' } },
  activity: [],
  deposits: [],
}

describe('row mappers', () => {
  it('round-trips an employee without leaking full numbers', () => {
    const row = employeeToRow(emp, 'c1')
    expect(row).not.toHaveProperty('bank_on_file')
    expect(JSON.stringify(row)).not.toMatch(/routingNumber|accountNumber/)
    const back = employeeFromRow({ ...row, bank_on_file: true, ssn_on_file: true } as EmployeeRow)
    expect(back).toMatchObject({ firstName: 'Maria', lastName: 'Lopez', middleInitial: 'L', bank: { onFile: true, accountLast4: '3456' }, ssnOnFile: true })
  })

  it('takes newly typed SSN and bank numbers out of screen state after saving', () => {
    const typed: Employee = { ...emp, ssnFull: '123456789', bank: { routingNumber: '111000025', accountNumber: '4000123456', routingLast4: '0025', accountLast4: '3456', type: 'checking' } }
    expect(secretsOf(typed)).toEqual({ ssn: '123456789', routing: '111000025', account: '4000123456' })
    const clean = withoutSecrets(typed)
    expect(secretsOf(clean)).toBeNull()
    expect(clean.bank).toMatchObject({ onFile: true, accountLast4: '3456' })
    expect(clean.ssnOnFile).toBe(true)
  })

  it('rebuilds processed runs from result rows (employee accounts cannot see runs)', () => {
    const r = { employeeId: 'e1', grossPay: 1000, netPay: 800 } as ResultRow['result']
    const runs = runsFromRows([], [{ company_id: 'c1', pay_date: '2026-10-30', employee_id: 'e1', entry: base.time.e1, result: r, gross_pay: 1000, net_pay: 800, federal_withholding: 0, social_security: 0, medicare: 0, employer_taxes: 0 }], [])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ payDate: '2026-10-30', results: [r], time: { e1: base.time.e1 } })
  })
})

describe('write planner', () => {
  it('keeps two open runs apart: each employee saves to their own pay date', () => {
    const e2: Employee = { ...emp, id: 'e2', scheduleId: 's2' }
    const two: CompanyData = {
      ...base, employees: [emp, e2],
      time: { ...base.time, e2: { regular: 8, overtime: 0, cashTips: 0, cardTips: 0 } },
      timeDates: { e1: '2026-11-13', e2: '2026-11-30' },
      open: { ...base.open, '2026-11-30': { payDate: '2026-11-30', status: 'draft' } },
    }
    const next: CompanyData = {
      ...two,
      time: { e1: { ...two.time.e1, regular: 70 }, e2: { ...two.time.e2, regular: 9 } },
      open: { ...two.open, '2026-11-30': { payDate: '2026-11-30', status: 'submitted' } },
    }
    const w = planWrites(two, next)
    expect(w.map((x) => (x.kind === 'time' ? `time:${x.row.pay_date}:${x.row.employee_id}` : x.kind === 'run' ? `run:${x.row.pay_date}:${x.row.status}` : x.kind)))
      .toEqual(['time:2026-11-13:e1', 'time:2026-11-30:e2', 'run:2026-11-30:submitted'])
  })

  it('moves an employee’s hours when their pay date changes', () => {
    const next: CompanyData = { ...base, timeDates: { e1: '2026-11-12' }, open: { '2026-11-12': { payDate: '2026-11-12', status: 'draft' } } }
    const w = planWrites(base, next)
    expect(w).toEqual([expect.objectContaining({ kind: 'time', row: expect.objectContaining({ pay_date: '2026-11-12' }) })])
  })

  it('writes nothing when nothing changed', () => {
    expect(planWrites(base, structuredClone(base))).toEqual([])
  })

  it('saves only the changed time entry', () => {
    const next = { ...base, time: { e1: { ...base.time.e1, regular: 72 } } }
    const w = planWrites(base, next)
    expect(w.map((x) => x.kind)).toEqual(['time'])
  })

  it('on submit saves hours before locking the run; on recall unlocks first', () => {
    const submitted: CompanyData = { ...base, time: { e1: { ...base.time.e1, regular: 75 } }, open: { '2026-11-13': { payDate: '2026-11-13', status: 'submitted' } } }
    expect(planWrites(base, submitted).map((x) => x.kind)).toEqual(['time', 'run'])
    const recalled: CompanyData = { ...submitted, time: { e1: { ...base.time.e1, regular: 76 } }, open: { '2026-11-13': { payDate: '2026-11-13', status: 'draft' } } }
    expect(planWrites(submitted, recalled).map((x) => x.kind)).toEqual(['run', 'time'])
  })

  it('adds a new employee before their hours, and sends typed secrets separately', () => {
    const e2: Employee = { ...emp, id: 'e2', ssnFull: '987654321', bank: undefined, payMethod: 'client_check' }
    const next = { ...base, employees: [emp, e2], time: { ...base.time, e2: { regular: 80, overtime: 0, cashTips: 0, cardTips: 0 } }, timeDates: { ...base.timeDates, e2: '2026-11-13' } }
    const w = planWrites(base, next)
    expect(w.map((x) => x.kind)).toEqual(['employee', 'secrets', 'time'])
    expect(w[0]).toMatchObject({ kind: 'employee', isNew: true })
    expect(w[1]).toMatchObject({ kind: 'secrets', employeeId: 'e2', ssn: '987654321', routing: null, account: null })
  })

  it('only inserts new activity', () => {
    const ev = { id: 'ev1', at: '2026-11-11T00:00:00Z', actor: 'client' as const, actorName: 'A', kind: 'submit' as const, ko: '제출', en: 'Submitted' }
    const once = { ...base, activity: [ev] }
    expect(planWrites(base, once).map((x) => x.kind)).toEqual(['activity'])
    expect(planWrites(once, { ...once })).toEqual([])
  })
})
