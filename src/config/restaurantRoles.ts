import type { PayType, RoleId, TimeEntry } from '../types'

export interface RoleTemplate {
  ko: string
  en: string
  payType: PayType
  /** 기본 급여: tipped/hourly는 시급, salary는 연봉 */
  rate: number
  /** 새 급여 기간의 기본 입력값 (격주 기준) */
  defaultTime: TimeEntry
}

/** 레스토랑 직무 템플릿 — 직원 추가 시 급여 형태와 기본 시급을 채워 줌 */
export const restaurantRoles: Record<RoleId, RoleTemplate> = {
  server: { ko: '서버', en: 'Server', payType: 'tipped', rate: 2.13, defaultTime: { regular: 60, overtime: 0, cashTips: 320, cardTips: 880 } },
  bartender: { ko: '바텐더', en: 'Bartender', payType: 'tipped', rate: 2.13, defaultTime: { regular: 64, overtime: 0, cashTips: 450, cardTips: 1100 } },
  busser: { ko: '버서', en: 'Busser', payType: 'tipped', rate: 2.13, defaultTime: { regular: 50, overtime: 0, cashTips: 60, cardTips: 240 } },
  runner: { ko: '푸드 러너', en: 'Food runner', payType: 'tipped', rate: 2.13, defaultTime: { regular: 50, overtime: 0, cashTips: 50, cardTips: 220 } },
  host: { ko: '호스트', en: 'Host', payType: 'hourly', rate: 11, defaultTime: { regular: 56, overtime: 0, cashTips: 0, cardTips: 0 } },
  cook: { ko: '라인 쿡', en: 'Line cook', payType: 'hourly', rate: 16.5, defaultTime: { regular: 80, overtime: 4, cashTips: 0, cardTips: 0 } },
  dishwasher: { ko: '디시워셔', en: 'Dishwasher', payType: 'hourly', rate: 12, defaultTime: { regular: 64, overtime: 0, cashTips: 0, cardTips: 0 } },
  manager: { ko: '매니저', en: 'Manager', payType: 'salary', rate: 52_000, defaultTime: { regular: 0, overtime: 0, cashTips: 0, cardTips: 0 } },
}

export const roleOrder: RoleId[] = ['server', 'bartender', 'busser', 'runner', 'host', 'cook', 'dishwasher', 'manager']

/** 직원이 팁을 받는 직무인지 (시급 직원도 팁을 받을 수 있음) */
export const receivesTips = (role: RoleId): boolean =>
  restaurantRoles[role].payType === 'tipped' || role === 'host'

/** 직무 기본 근무·팁 입력값 */
export const defaultTimeFor = (role: RoleId): TimeEntry => ({ ...restaurantRoles[role].defaultTime })
