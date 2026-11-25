/**
 * 입사·퇴사일 판단 (순수 함수, 날짜는 YYYY-MM-DD 문자열 비교)
 */
import type { Employee } from '../types'
import { parseISODate, toISODate } from './schedule'

type Dates = Pick<Employee, 'hireDate' | 'terminationDate' | 'active'>

/** 이 기간에 하루라도 재직했는지 */
export const workedDuring = (e: Dates, start: string, end: string) =>
  e.hireDate <= end && (!e.terminationDate || e.terminationDate >= start)

/**
 * 이 급여 기간의 급여 대상인지
 * - 입사일이 기간 끝 이후면 아직 아님
 * - 퇴사일이 기간 시작 전이면 이미 끝남 (퇴사일이 기간 안이면 마지막 급여로 포함)
 * - 퇴사일 없이 '재직 아님'만 표시된 예전 기록은 제외
 */
export const payableIn = (e: Dates, start: string, end: string) =>
  workedDuring(e, start, end) && (e.active || !!e.terminationDate)

export type EmploymentStatus = 'upcoming' | 'active' | 'leaving' | 'former'

/** 화면 표시용 상태: 입사 예정 · 재직 · 퇴사 예정 · 퇴사 */
export function employmentStatus(e: Dates, today: string): EmploymentStatus {
  if (e.terminationDate) return e.terminationDate < today ? 'former' : 'leaving'
  if (!e.active) return 'former'
  return e.hireDate > today ? 'upcoming' : 'active'
}

/** 재직 기간 (입사일 ~ 퇴사일 또는 오늘) */
export function tenureMonths(e: Dates, today: string): number {
  const end = e.terminationDate && e.terminationDate < today ? e.terminationDate : today
  const a = parseISODate(e.hireDate)
  const b = parseISODate(end)
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0))
}

export const addDaysIso = (iso: string, n: number) => {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
