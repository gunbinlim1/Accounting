import type { Company, Industry, PayType, RoleId, TimeEntry } from '../types'

export interface RoleTemplate {
  id: RoleId
  ko: string
  en: string
  payType: PayType
  /** 기본 급여: tipped/hourly는 시급, salary는 연봉 */
  rate: number
  /** 시급 직원이지만 팁을 받는 직무 (팁 크레딧 없이 팁만 신고) */
  tips?: boolean
  /** 새 급여 기간의 기본 입력값 (격주 기준) */
  defaultTime: TimeEntry
}

export interface IndustryProfile {
  id: Industry
  ko: string
  en: string
  /** 업종 설명 (예시 업체) */
  descKo: string
  descEn: string
  /** 팁 직원 운영 기본값 */
  tipsDefault: boolean
  /** 팁 기능을 켤 수 있는 업종인지 */
  tipsAllowed: boolean
  /** 이 업종에서 자주 쓰는 급여 항목 안내 */
  featuresKo: string[]
  featuresEn: string[]
  /** 직무 템플릿 (화면 표시 순서) */
  roles: RoleId[]
  /** 새 직원 등록 시 먼저 선택되는 직무 */
  defaultRole: RoleId
}

const hrs = (regular: number, overtime = 0, cashTips = 0, cardTips = 0): TimeEntry => ({ regular, overtime, cashTips, cardTips })
const none = hrs(0)

/** 모든 업종의 직무 템플릿 (ID는 업종 간 중복 없음) */
export const roleTemplates: Record<RoleId, RoleTemplate> = Object.fromEntries(
  ([
    // ── 레스토랑
    { id: 'server', ko: '서버', en: 'Server', payType: 'tipped', rate: 2.13, defaultTime: hrs(60, 0, 320, 880) },
    { id: 'bartender', ko: '바텐더', en: 'Bartender', payType: 'tipped', rate: 2.13, defaultTime: hrs(64, 0, 450, 1100) },
    { id: 'busser', ko: '버서', en: 'Busser', payType: 'tipped', rate: 2.13, defaultTime: hrs(50, 0, 60, 240) },
    { id: 'runner', ko: '푸드 러너', en: 'Food runner', payType: 'tipped', rate: 2.13, defaultTime: hrs(50, 0, 50, 220) },
    { id: 'host', ko: '호스트', en: 'Host', payType: 'hourly', rate: 11, tips: true, defaultTime: hrs(56) },
    { id: 'cook', ko: '라인 쿡', en: 'Line cook', payType: 'hourly', rate: 16.5, defaultTime: hrs(80, 4) },
    { id: 'dishwasher', ko: '디시워셔', en: 'Dishwasher', payType: 'hourly', rate: 12, defaultTime: hrs(64) },
    { id: 'manager', ko: '매니저', en: 'Manager', payType: 'salary', rate: 52_000, defaultTime: none },

    // ── 서비스업
    { id: 'stylist', ko: '헤어·네일 디자이너', en: 'Stylist / nail tech', payType: 'hourly', rate: 12, tips: true, defaultTime: hrs(70, 0, 180, 420) },
    { id: 'receptionist', ko: '리셉션', en: 'Receptionist', payType: 'hourly', rate: 14, defaultTime: hrs(72) },
    { id: 'housekeeper', ko: '청소·하우스키핑', en: 'Housekeeper / cleaner', payType: 'hourly', rate: 13, defaultTime: hrs(76) },
    { id: 'technician', ko: '서비스 기술자', en: 'Service technician', payType: 'hourly', rate: 22, defaultTime: hrs(80, 4) },
    { id: 'valet', ko: '발레·벨 서비스', en: 'Valet / bell staff', payType: 'tipped', rate: 2.13, defaultTime: hrs(60, 0, 380, 260) },
    { id: 'driver', ko: '배송·운전', en: 'Driver', payType: 'hourly', rate: 16, defaultTime: hrs(80, 2) },
    { id: 'svc_manager', ko: '지점 매니저', en: 'Branch manager', payType: 'salary', rate: 55_000, defaultTime: none },

    // ── 도소매업
    { id: 'cashier', ko: '캐셔', en: 'Cashier', payType: 'hourly', rate: 12, defaultTime: hrs(64) },
    { id: 'sales_associate', ko: '판매 직원', en: 'Sales associate', payType: 'hourly', rate: 13.5, defaultTime: hrs(72) },
    { id: 'stock_clerk', ko: '재고·진열 담당', en: 'Stock clerk', payType: 'hourly', rate: 13.5, defaultTime: hrs(72) },
    { id: 'warehouse', ko: '창고 직원', en: 'Warehouse associate', payType: 'hourly', rate: 16, defaultTime: hrs(80, 4) },
    { id: 'delivery_driver', ko: '배송 기사', en: 'Delivery driver', payType: 'hourly', rate: 17, defaultTime: hrs(80, 3) },
    { id: 'asst_manager', ko: '부매니저', en: 'Assistant manager', payType: 'hourly', rate: 19, defaultTime: hrs(80, 2) },
    { id: 'buyer', ko: '구매 담당', en: 'Buyer', payType: 'salary', rate: 52_000, defaultTime: none },
    { id: 'store_manager', ko: '점장', en: 'Store manager', payType: 'salary', rate: 58_000, defaultTime: none },

    // ── 생산·제조업
    { id: 'production', ko: '생산직', en: 'Production worker', payType: 'hourly', rate: 16, defaultTime: hrs(80, 6) },
    { id: 'machine_operator', ko: '장비 오퍼레이터', en: 'Machine operator', payType: 'hourly', rate: 19.5, defaultTime: hrs(80, 6) },
    { id: 'assembler', ko: '조립원', en: 'Assembler', payType: 'hourly', rate: 17, defaultTime: hrs(80, 4) },
    { id: 'qc_inspector', ko: '품질 검사원', en: 'QC inspector', payType: 'hourly', rate: 21, defaultTime: hrs(80, 2) },
    { id: 'maintenance', ko: '설비 보전 기술자', en: 'Maintenance technician', payType: 'hourly', rate: 27, defaultTime: hrs(80, 4) },
    { id: 'forklift', ko: '지게차·물류', en: 'Forklift / logistics', payType: 'hourly', rate: 18, defaultTime: hrs(80, 4) },
    { id: 'engineer', ko: '엔지니어', en: 'Engineer', payType: 'salary', rate: 90_000, defaultTime: none },
    { id: 'supervisor', ko: '생산 감독자', en: 'Production supervisor', payType: 'salary', rate: 65_000, defaultTime: none },

    // ── 공통
    { id: 'office_admin', ko: '사무·관리', en: 'Office admin', payType: 'hourly', rate: 18, defaultTime: hrs(80) },
    { id: 'other', ko: '기타 (직함 직접 입력)', en: 'Other (enter a title)', payType: 'hourly', rate: 15, defaultTime: hrs(80) },
  ] satisfies RoleTemplate[]).map((r) => [r.id, r]),
)

export const industries: Record<Industry, IndustryProfile> = {
  restaurant: {
    id: 'restaurant',
    ko: '레스토랑·외식업',
    en: 'Restaurant & food service',
    descKo: '식당, 카페, 바, 푸드트럭',
    descEn: 'Restaurants, cafés, bars, food trucks',
    tipsDefault: true,
    tipsAllowed: true,
    featuresKo: ['팁 직원 현금 시급 $2.13 · 팁 크레딧', '현금·카드 팁 입력, $7.25 미달 자동 보전', 'Section 45B FICA 팁 크레딧 추정', '직원 식사 Fringe'],
    featuresEn: ['$2.13 tipped cash wage · tip credit', 'Cash & card tips with $7.25 make-up', 'Section 45B FICA tip credit estimate', 'Employee meal fringe'],
    roles: ['server', 'bartender', 'busser', 'runner', 'host', 'cook', 'dishwasher', 'manager', 'office_admin', 'other'],
    defaultRole: 'server',
  },
  service: {
    id: 'service',
    ko: '서비스업',
    en: 'Services',
    descKo: '미용실·네일, 청소, 호텔, 수리, 병원·사무실',
    descEn: 'Salons, cleaning, hotels, repair, clinics & offices',
    tipsDefault: false,
    tipsAllowed: true,
    featuresKo: ['시급·연봉 중심', '팁 받는 직원이 있으면 팁 기능을 켤 수 있음', '기술직 OT 관리'],
    featuresEn: ['Hourly and salaried staff', 'Turn on tips if staff receive them', 'Overtime for technicians'],
    roles: ['stylist', 'receptionist', 'housekeeper', 'technician', 'valet', 'driver', 'office_admin', 'svc_manager', 'other'],
    defaultRole: 'receptionist',
  },
  retail: {
    id: 'retail',
    ko: '도소매업',
    en: 'Retail & wholesale',
    descKo: '마트, 매장, 온라인 판매, 도매·유통',
    descEn: 'Stores, markets, e-commerce, wholesale & distribution',
    tipsDefault: false,
    tipsAllowed: false,
    featuresKo: ['매장·창고 시급 직원', '파트타임 시간 입력', '점장·구매 담당 연봉'],
    featuresEn: ['Store and warehouse hourly staff', 'Part-time hours', 'Salaried store managers and buyers'],
    roles: ['cashier', 'sales_associate', 'stock_clerk', 'warehouse', 'delivery_driver', 'asst_manager', 'buyer', 'store_manager', 'office_admin', 'other'],
    defaultRole: 'sales_associate',
  },
  manufacturing: {
    id: 'manufacturing',
    ko: '생산·제조업',
    en: 'Manufacturing',
    descKo: '공장, 반도체·전자, 식품 가공, 가공·조립',
    descEn: 'Plants, semiconductors & electronics, food processing, fabrication',
    tipsDefault: false,
    tipsAllowed: false,
    featuresKo: ['생산직 시급 + OT 중심', '팁·팁 크레딧 없음', '엔지니어·감독자 연봉'],
    featuresEn: ['Hourly production staff with overtime', 'No tips or tip credit', 'Salaried engineers and supervisors'],
    roles: ['production', 'machine_operator', 'assembler', 'qc_inspector', 'maintenance', 'forklift', 'engineer', 'supervisor', 'office_admin', 'other'],
    defaultRole: 'production',
  },
}

export const industryOrder: Industry[] = ['restaurant', 'service', 'retail', 'manufacturing']

const fallback = roleTemplates.other

/** 직무 템플릿 (모르는 ID면 '기타') */
export const roleTemplate = (role: RoleId): RoleTemplate => roleTemplates[role] ?? fallback

/** 이 회사에서 고를 수 있는 직무 — 팁 기능이 꺼져 있으면 팁 직원 직무는 숨김 */
export const rolesFor = (company: Pick<Company, 'industry' | 'tipsEnabled'>): RoleTemplate[] =>
  industries[company.industry].roles.map(roleTemplate).filter((r) => company.tipsEnabled || r.payType !== 'tipped')

/** 직원이 팁을 받는 직무인지 (팁 기능이 꺼진 회사는 항상 아님) */
export const receivesTips = (role: RoleId, tipsEnabled = true): boolean => {
  if (!tipsEnabled) return false
  const r = roleTemplate(role)
  return r.payType === 'tipped' || !!r.tips
}

/** 직무 기본 근무·팁 입력값 (팁 기능이 꺼져 있으면 팁 0) */
export const defaultTimeFor = (role: RoleId, tipsEnabled = true): TimeEntry => {
  const t = { ...roleTemplate(role).defaultTime }
  return tipsEnabled ? t : { ...t, cashTips: 0, cardTips: 0 }
}
