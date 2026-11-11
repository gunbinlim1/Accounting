import { roleTemplate } from '../config/industries'
import { defaultW4 } from '../lib/federalWithholding'
import { splitName } from '../lib/names'
import { toISODate } from '../lib/schedule'
import type { ActivityEvent, Authorizations, Company, Employee, FringeEntry, PayMethod, RoleId } from '../types'
import { sampleEmployees } from './sampleEmployees'

/** 데모 회계법인 계정 (가상) */
export const firmAccount = { name: 'Jordan Lee', title: '급여 담당 매니저', titleEn: 'Payroll Manager', email: 'payroll@democpa.example', firmName: 'Demo CPA' }

const daysFrom = (today: Date, n: number) => toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n))
const hoursAgo = (today: Date, h: number) => new Date(today.getTime() - h * 3_600_000).toISOString()

let seq = 0
function staff(prefix: string, name: string, role: RoleId, hireDate: string, extra: Partial<Employee> = {}): Employee {
  seq++
  const tpl = roleTemplate(role)
  const { firstName, lastName, middleInitial } = splitName(name)
  return {
    id: `${prefix}-${String(seq).padStart(3, '0')}`,
    firstName,
    lastName,
    ...(middleInitial ? { middleInitial } : {}),
    role,
    payType: tpl.payType,
    rate: tpl.rate,
    pretaxDeferralRate: 0,
    active: true,
    hireDate,
    ssnLast4: String(1000 + ((seq * 7919) % 9000)).slice(-4),
    address: { street: '', city: 'Houston', state: 'TX', zip: '77036' },
    w4: { ...defaultW4, signedDate: hireDate },
    i9: {
      citizenship: 'citizen', section1Date: hireDate, documentPath: 'BC', section2Date: hireDate,
      documents: [
        { title: "Driver's License", issuer: 'Texas DPS', numberLast4: '5521', expires: '2030-01-31' },
        { title: 'Social Security Card', issuer: 'SSA', numberLast4: '0907' },
      ],
    },
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@mail.example`,
    payMethod: 'direct_deposit',
    bank: { routingLast4: '0021', accountLast4: String(2000 + ((seq * 37) % 7000)).slice(-4), type: 'checking' },
    eConsent: true,
    ...extra,
  }
}

const signed: Authorizations = { form8655: 'signed', twcAgent: 'signed', bankDebit: 'signed' }

/** 데모: 직원별로 매 회차 반복되는 Fringe Benefit */
export const recurringFringes: Record<string, Omit<FringeEntry, 'id'>[]> = {
  'SG-001': [{ itemId: 'meals', amount: 40 }],
  'SG-004': [{ itemId: 'meals', amount: 60 }],
  'SG-006': [{ itemId: 'health', amount: 450 }, { itemId: 'gtl', amount: 8 }],
  'ES-005': [{ itemId: 'health', amount: 380 }, { itemId: 'vehicle', amount: 120 }],
  'PB-007': [{ itemId: 'meals', amount: 50 }],
  'LS-009': [{ itemId: 'health', amount: 520 }, { itemId: 'gtl', amount: 12 }],
  'LS-010': [{ itemId: 'health', amount: 450 }],
}

/** 데모: Seoul Garden 기존 샘플 직원의 지급 방식·이메일 */
const seoulExtras: Record<string, { payMethod: PayMethod; eConsent: boolean; email: string }> = {
  'SG-001': { payMethod: 'direct_deposit', eConsent: true, email: 'maria.lopez@mail.example' },
  'SG-002': { payMethod: 'direct_deposit', eConsent: true, email: 'daniel.kim@mail.example' },
  'SG-003': { payMethod: 'firm_check', eConsent: true, email: 'ashley.nguyen@mail.example' },
  'SG-004': { payMethod: 'client_check', eConsent: false, email: 'carlos.ramirez@mail.example' },
  'SG-005': { payMethod: 'client_check', eConsent: false, email: '' },
  'SG-006': { payMethod: 'direct_deposit', eConsent: true, email: 'michael.brown@mail.example' },
  'SG-007': { payMethod: 'firm_check', eConsent: true, email: 'tyler.smith@mail.example' },
}

const baseCompany = (c: Omit<Company, 'sutaRate' | 'depositSchedule' | 'cutoffBusinessDays' | 'address' | 'industry' | 'tipsEnabled'> & Partial<Company>): Company => ({
  industry: 'restaurant',
  tipsEnabled: true,
  sutaRate: 0.027,
  depositSchedule: 'semiweekly',
  cutoffBusinessDays: 2,
  address: { street: '', city: 'Houston', state: 'TX', zip: '77036' },
  ...c,
})

export interface DemoCompanySeed {
  company: Company
  employees: Employee[]
  /** 이번 회차 상태 */
  status: 'draft' | 'submitted' | 'changes_requested'
  note?: string
  activity: ActivityEvent[]
}

export function demoCompanies(today: Date): DemoCompanySeed[] {
  seq = 0
  const ev = (id: string, h: number, actor: ActivityEvent['actor'], actorName: string, kind: ActivityEvent['kind'], ko: string, en: string): ActivityEvent =>
    ({ id, at: hoursAgo(today, h), actor, actorName, kind, ko, en })

  const seoul = baseCompany({
    id: 'seoul-garden', legalName: 'Seoul Garden Hospitality LLC', dba: 'Seoul Garden BBQ', ein: '82-1234567', twcAccount: '99-123456-7',
    sutaRate: 0.0275, authorizations: signed, ownerName: 'Grace Kim', ownerEmail: 'grace@seoulgarden.example', phone: '(713) 555-0110',
    address: { street: '9889 Bellaire Blvd', city: 'Houston', state: 'TX', zip: '77036' },
  })
  const taqueria = baseCompany({
    id: 'el-sol', legalName: 'El Sol Foods Inc.', dba: 'Taqueria El Sol', ein: '74-7654321', twcAccount: '99-654321-0',
    sutaRate: 0.019, depositSchedule: 'monthly', authorizations: { ...signed, twcAgent: 'pending' }, ownerName: 'Luis Hernández', ownerEmail: 'luis@elsol.example', phone: '(713) 555-0188',
    address: { street: '6115 Hillcroft Ave', city: 'Houston', state: 'TX', zip: '77081' },
  })
  const pho = baseCompany({
    id: 'pho-bellaire', legalName: 'Bellaire Noodle House LLC', dba: 'Pho Bellaire', ein: '88-2468135', twcAccount: '99-246813-5',
    authorizations: { form8655: 'pending', twcAgent: 'pending', bankDebit: 'signed' }, ownerName: 'Linh Tran', ownerEmail: 'linh@phobellaire.example', phone: '(713) 555-0166',
    address: { street: '11210 Bellaire Blvd', city: 'Houston', state: 'TX', zip: '77072' },
  })

  const fab = baseCompany({
    id: 'lone-star-fab', legalName: 'Lone Star Microfab Inc.', dba: 'Lone Star Microfab', ein: '87-3141592', twcAccount: '99-314159-2',
    industry: 'manufacturing', tipsEnabled: false, sutaRate: 0.012, authorizations: signed,
    ownerName: 'Daniel Cho', ownerEmail: 'daniel@lonestarfab.example', phone: '(512) 555-0134',
    address: { street: '4100 Tech Ridge Blvd', city: 'Austin', state: 'TX', zip: '78753' },
  })

  // 기존 샘플 직원은 Seoul Garden에 소속
  const seoulStaff = sampleEmployees(today).map((e, i) => {
    const id = `SG-${String(i + 1).padStart(3, '0')}`
    const x = seoulExtras[id]
    return {
      ...e,
      id,
      email: x?.email || undefined,
      payMethod: x?.payMethod ?? 'client_check',
      eConsent: x?.eConsent ?? false,
      bank: x?.payMethod === 'direct_deposit' ? { routingLast4: '0021', accountLast4: String(4100 + i * 7), type: 'checking' as const } : undefined,
    }
  })

  return [
    {
      company: seoul,
      employees: seoulStaff,
      status: 'draft',
      activity: [
        ev('sg1', 30, 'client', 'Grace Kim', 'employee', 'Jenny Park 직원 등록', 'Added employee Jenny Park'),
        ev('sg2', 340, 'firm', firmAccount.name, 'processed', '지난 회차 급여 처리 완료', 'Processed the previous payroll'),
      ],
    },
    {
      company: taqueria,
      employees: [
        staff('ES', 'Rosa Martinez', 'server', '2023-05-01', { pretaxDeferralRate: 0.02 }),
        staff('ES', 'Diego Flores', 'cook', '2022-08-15', { rate: 17.5 }),
        staff('ES', 'Ana Ruiz', 'server', '2024-02-12', { payMethod: 'client_check', bank: undefined, eConsent: false }),
        staff('ES', 'Miguel Torres', 'dishwasher', '2025-03-03', { rate: 12.5, payMethod: 'firm_check', bank: undefined }),
        staff('ES', 'Luis Hernández Jr.', 'manager', '2021-01-04', { rate: 48_000, w4: { ...defaultW4, filingStatus: 'married', dependentsAmount: 4_400, signedDate: '2024-01-08' } }),
      ],
      status: 'submitted',
      activity: [
        ev('es1', 5, 'client', 'Luis Hernández', 'submit', '11월 회차 급여 제출', 'Submitted the November payroll'),
      ],
    },
    {
      company: pho,
      employees: [
        staff('PB', 'Kevin Nguyen', 'server', '2024-09-09'),
        staff('PB', 'Mai Pham', 'cook', '2023-11-20', { rate: 16 }),
        staff('PB', 'Tony Vo', 'busser', '2025-07-14', { w4: null, payMethod: 'client_check', bank: undefined }),
      ],
      status: 'changes_requested',
      note: 'Kevin Nguyen님의 카드 팁이 $0으로 들어왔어요. POS 리포트 기준 카드 팁 금액을 넣어 다시 제출해 주세요.',
      activity: [
        ev('pb2', 3, 'firm', firmAccount.name, 'changes', '수정 요청: Kevin Nguyen 카드 팁 확인', 'Requested changes: check Kevin Nguyen card tips'),
        ev('pb1', 20, 'client', 'Linh Tran', 'submit', '11월 회차 급여 제출', 'Submitted the November payroll'),
      ],
    },
    {
      company: fab,
      employees: [
        staff('LS', 'Priya R. Shah', 'engineer', '2023-04-03', { rate: 96_000, pretaxDeferralRate: 0.06, w4: { ...defaultW4, filingStatus: 'married', signedDate: '2023-04-03' } }),
        staff('LS', 'James Walker', 'supervisor', '2022-02-14', { pretaxDeferralRate: 0.04 }),
        staff('LS', 'Hector Garza', 'machine_operator', '2024-06-10', { rate: 20.5 }),
        staff('LS', 'Thu Le', 'qc_inspector', '2025-01-13'),
        staff('LS', 'Marcus Johnson', 'maintenance', '2021-09-20', { rate: 28 }),
        staff('LS', 'Kayla Brooks', 'assembler', '2025-08-04', { payMethod: 'firm_check', bank: undefined }),
        staff('LS', 'Ray Delgado', 'forklift', '2024-10-21', { jobTitle: 'Shipping & receiving' }),
      ],
      status: 'draft',
      activity: [
        ev('ls1', 50, 'client', 'Daniel Cho', 'settings', '업종 설정: 생산·제조업 (팁 기능 없음)', 'Industry set: Manufacturing (no tips)'),
      ],
    },
  ]
}

/** 데모 시드에서 특정 직원의 이번 회차 입력을 조정 */
export const demoTimeTweaks: Record<string, { regular?: number; overtime?: number; cashTips?: number; cardTips?: number }> = {
  'SG-001': { regular: 72, overtime: 6, cashTips: 380, cardTips: 1040 },
  'SG-004': { regular: 80, overtime: 9 },
  'SG-005': { regular: 30, cashTips: 15, cardTips: 40 },
  'PB-006': { cardTips: 0, cashTips: 140 },
}

export const demoDaysFrom = daysFrom
