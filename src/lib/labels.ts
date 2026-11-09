import { restaurantRoles } from '../config/restaurantRoles'
import type { CitizenshipStatus, Employee, FilingStatus, RoleId } from '../types'
import { formatCurrency, formatCurrencyWhole } from './format'

type T = (ko: string, en: string) => string

export const filingLabel = (s: FilingStatus, t: T) =>
  ({ single: t('Single/별도 신고', 'Single or MFS'), married: t('부부 합산', 'Married filing jointly'), hoh: t('세대주', 'Head of household') })[s]

export const roleLabel = (r: RoleId, t: T) => t(restaurantRoles[r].ko, restaurantRoles[r].en)

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
