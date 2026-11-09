import type { Employee } from '../types'

/** 개발용 샘플 데이터 (가상의 인물) */
export const sampleEmployees: Employee[] = [
  {
    id: 'EMP-001',
    name: 'Alex Kim',
    department: 'Audit',
    payType: 'salary',
    rate: 85_000,
    payFrequency: 'biweekly',
    pretaxDeferralRate: 0.06,
    active: true,
  },
  {
    id: 'EMP-002',
    name: 'Jordan Park',
    department: 'Tax',
    payType: 'salary',
    rate: 72_000,
    payFrequency: 'biweekly',
    pretaxDeferralRate: 0.04,
    active: true,
  },
  {
    id: 'EMP-003',
    name: 'Sam Lee',
    department: 'Admin',
    payType: 'hourly',
    rate: 24,
    payFrequency: 'biweekly',
    pretaxDeferralRate: 0,
    active: true,
  },
  {
    id: 'EMP-004',
    name: 'Taylor Choi',
    department: 'Bookkeeping',
    payType: 'hourly',
    rate: 28.5,
    payFrequency: 'biweekly',
    pretaxDeferralRate: 0.03,
    active: false,
  },
]
