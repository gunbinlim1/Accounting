import { defaultW4 } from '../lib/federalWithholding'
import { toISODate } from '../lib/schedule'
import type { Employee, I9 } from '../types'

const daysFrom = (today: Date, n: number) => toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n))

const passport: I9['documents'] = [{ title: 'U.S. Passport', issuer: 'U.S. Department of State', numberLast4: '4821', expires: '2031-05-14' }]
const dlAndSsCard: I9['documents'] = [
  { title: "Driver's License", issuer: 'Texas DPS', numberLast4: '7712', expires: '2029-08-02' },
  { title: 'Social Security Card', issuer: 'SSA', numberLast4: '3390' },
]

/** 개발용 레스토랑 샘플 (가상의 인물, 가상의 번호) */
export function sampleEmployees(today: Date): Employee[] {
  const houston = (street: string) => ({ street, city: 'Houston', state: 'TX', zip: '77036' })
  return [
    {
      id: 'EMP-001', firstName: 'Maria', lastName: 'Lopez', role: 'server', payType: 'tipped', rate: 2.13, pretaxDeferralRate: 0.03,
      active: true, hireDate: '2024-03-04', ssnLast4: '1042', dateOfBirth: '1996-07-21', phone: '(713) 555-0142',
      address: houston('8100 Bellaire Blvd #12'),
      w4: { ...defaultW4, signedDate: '2024-03-04' },
      i9: { citizenship: 'citizen', section1Date: '2024-03-04', documentPath: 'A', documents: passport, section2Date: '2024-03-05' },
    },
    {
      id: 'EMP-002', firstName: 'Daniel', lastName: 'Kim', role: 'bartender', payType: 'tipped', rate: 2.13, pretaxDeferralRate: 0.05,
      active: true, hireDate: '2023-09-18', ssnLast4: '5530', dateOfBirth: '1990-02-11', phone: '(713) 555-0177',
      address: houston('9400 Bellaire Blvd #3'),
      w4: { ...defaultW4, filingStatus: 'married', dependentsAmount: 2_200, signedDate: '2025-01-06' },
      i9: { citizenship: 'lpr', uscisLast4: '8817', section1Date: '2023-09-18', documentPath: 'A', documents: [{ title: 'Permanent Resident Card', issuer: 'USCIS', numberLast4: '8817', expires: '2032-09-30' }], section2Date: '2023-09-19' },
    },
    {
      id: 'EMP-003', firstName: 'Ashley', lastName: 'Nguyen', role: 'host', payType: 'hourly', rate: 11, pretaxDeferralRate: 0,
      active: true, hireDate: '2025-06-02', ssnLast4: '2287', dateOfBirth: '2004-11-30',
      address: houston('6200 Corporate Dr #40'),
      w4: { ...defaultW4, signedDate: '2025-06-02' },
      i9: { citizenship: 'citizen', section1Date: '2025-06-02', documentPath: 'BC', documents: dlAndSsCard, section2Date: '2025-06-04' },
    },
    {
      id: 'EMP-004', firstName: 'Carlos', lastName: 'Ramirez', role: 'cook', payType: 'hourly', rate: 16.5, pretaxDeferralRate: 0.04,
      active: true, hireDate: '2024-11-11', ssnLast4: '9064', dateOfBirth: '1988-05-09',
      address: houston('7300 Harwin Dr #8'),
      w4: { ...defaultW4, filingStatus: 'hoh', dependentsAmount: 4_400, signedDate: '2024-11-11' },
      i9: {
        citizenship: 'authorized', uscisLast4: '4410', workAuthExpires: daysFrom(today, 45),
        section1Date: '2024-11-11', documentPath: 'A',
        documents: [{ title: 'Employment Authorization Document (I-766)', issuer: 'USCIS', numberLast4: '4410', expires: daysFrom(today, 45) }],
        section2Date: '2024-11-12',
      },
    },
    {
      id: 'EMP-005', firstName: 'Jenny', lastName: 'Park', role: 'busser', payType: 'tipped', rate: 2.13, pretaxDeferralRate: 0,
      active: true, hireDate: daysFrom(today, -6), ssnLast4: '6618', dateOfBirth: '2006-04-17',
      address: houston('5900 Gulfton St #21'),
      w4: null,
      i9: { citizenship: 'citizen', section1Date: daysFrom(today, -6), documentPath: 'BC', documents: [] },
    },
    {
      id: 'EMP-006', firstName: 'Michael', lastName: 'Brown', role: 'manager', payType: 'salary', rate: 52_000, pretaxDeferralRate: 0.06,
      active: true, hireDate: '2022-01-10', ssnLast4: '7751', dateOfBirth: '1984-09-03',
      address: houston('2500 Fountain View Dr'),
      w4: { ...defaultW4, filingStatus: 'married', dependentsAmount: 4_400, signedDate: '2023-01-09' },
      i9: { citizenship: 'citizen', section1Date: '2022-01-10', documentPath: 'A', documents: passport, section2Date: '2022-01-11' },
    },
    {
      id: 'EMP-007', firstName: 'Tyler', lastName: 'Smith', role: 'dishwasher', payType: 'hourly', rate: 12, pretaxDeferralRate: 0,
      active: false, hireDate: '2025-02-03', ssnLast4: '3015',
      address: houston('6100 Hillcroft St #5'),
      w4: { ...defaultW4, signedDate: '2025-02-03' },
      i9: { citizenship: 'citizen', section1Date: '2025-02-03', documentPath: 'BC', documents: dlAndSsCard, section2Date: '2025-02-05' },
    },
  ]
}
