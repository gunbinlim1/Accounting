import { industries, roleTemplate } from '../config/industries'
import type { CitizenshipStatus, Employee, FilingStatus, Industry, RoleId } from '../types'
import { formatCurrency, formatCurrencyWhole } from './format'

type T = (ko: string, en: string) => string

export const filingLabel = (s: FilingStatus, t: T) =>
  ({ single: t('Single/별도 신고', 'Single or MFS'), married: t('부부 합산', 'Married filing jointly'), hoh: t('세대주', 'Head of household') })[s]

export const roleLabel = (r: RoleId, t: T) => {
  const tpl = roleTemplate(r)
  return r === 'other' ? t('기타', 'Other') : t(tpl.ko, tpl.en)
}

/** 직원의 직무 표시: 직접 입력한 직함이 있으면 그것을 씀 */
export const jobLabel = (e: Pick<Employee, 'role' | 'jobTitle'>, t: T): string => e.jobTitle?.trim() || roleLabel(e.role, t)

export const industryLabel = (i: Industry, t: T) => t(industries[i].ko, industries[i].en)

export const citizenshipLabel = (c: CitizenshipStatus, t: T) =>
  ({
    citizen: t('미국 시민', 'U.S. citizen'),
    national: t('미국 비시민 국민', 'Noncitizen national'),
    lpr: t('영주권자 (LPR)', 'Lawful permanent resident'),
    authorized: t('취업허가 외국인', 'Noncitizen authorized to work'),
  })[c]

export const payLabel = (e: Pick<Employee, 'payType' | 'rate'>, t: T) =>
  e.payType === 'salary'
    ? `${formatCurrencyWhole(e.rate)}/${t('년', 'yr')}`
    : e.payType === 'tipped'
      ? `${formatCurrency(e.rate)}/h + ${t('팁', 'tips')}`
      : `${formatCurrency(e.rate)}/h`
