import type { RunView } from '../store'
import type { Company, Employee } from '../types'

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 급여 회차를 일반 CSV로 (급여 프로그램이 정해지면 그 형식으로 매핑) */
export function payrollCsv(company: Company, payDate: string, view: RunView, role: (e: Employee) => string, mask: (l4: string) => string): string {
  const header = [
    'Company', 'EIN', 'Pay date', 'Employee ID', 'Last name', 'First name', 'MI', 'SSN', 'Role', 'Pay type', 'Rate',
    'Regular hrs', 'OT hrs', 'Cash tips', 'Card tips', 'Tip make-up', 'Gross pay',
    'Federal W/H', 'Social Security', 'Medicare', 'Uncollected FICA', '401(k)', 'Net pay',
    'Employer SS', 'Employer Medicare', 'FUTA', 'TWC', 'OT premium (W-2)',
  ]
  const rows = view.results.map((r) => {
    const e = view.employees.find((x) => x.id === r.employeeId)!
    const h = view.time[e.id]
    return [
      company.dba, company.ein, payDate, e.id, e.lastName, e.firstName, e.middleInitial ?? '', mask(e.ssnLast4), role(e), e.payType, e.rate,
      h?.regular ?? 0, h?.overtime ?? 0, r.cashTips, r.cardTips, r.tipMakeUp, r.grossPay,
      r.federalWithholding, r.socialSecurity, r.medicare, r.uncollectedFica, r.pretaxDeductions, r.netPay,
      r.employerSocialSecurity, r.employerMedicare, r.futa, r.suta, r.qualifiedOvertimePremium,
    ]
  })
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
