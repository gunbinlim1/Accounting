/**
 * PTO(유급 휴가) 잔액 계산 (순수 함수)
 *
 * 잔액 = 조정(시작 잔액 등) + 적립 − 사용
 * - 적립: 처리된 급여 회차마다 (근무 시간당 / 회차마다) 또는 매년 1월 1일(입사 연도는 입사일)에 한 번
 * - 사용: 처리된 회차의 근무 입력에 들어간 휴가 시간
 * - 최대 잔액이 있으면 그 이상은 적립되지 않음 (사용·조정은 그대로)
 */
import { standardHours } from '../config/payrollConfig'
import type { Employee, PayRun, PtoAdjustment, PtoPolicy, PtoRequest } from '../types'
import { roundCents } from './money'
import { parseISODate, toISODate } from './schedule'

export interface LedgerEntry {
  date: string
  kind: 'adjusted' | 'granted' | 'accrued' | 'used'
  hours: number
  balance: number
  note?: string
  /** 최대 잔액 때문에 적립이 줄었음 */
  capped?: boolean
}

export interface PtoBalance {
  policy: PtoPolicy
  balance: number
  accrued: number
  used: number
  entries: LedgerEntry[]
}

const r2 = (n: number) => roundCents(n)

/** 이 직원이 이 규칙으로 적립을 시작하는 날 (입사일 + 대기 기간) */
export function ptoEligibleFrom(e: Pick<Employee, 'hireDate'>, p: Pick<PtoPolicy, 'waitingDays'>): string {
  if (!p.waitingDays) return e.hireDate
  const d = parseISODate(e.hireDate)
  d.setDate(d.getDate() + p.waitingDays)
  return toISODate(d)
}

export const policyAppliesTo = (p: PtoPolicy, e: Pick<Employee, 'payType'>) => p.active && p.appliesTo.includes(e.payType)

/** 한 직원의 한 정책 잔액과 내역 (오래된 것부터) */
export function ptoLedger(e: Employee, p: PtoPolicy, runs: PayRun[], adjustments: PtoAdjustment[], today: Date): PtoBalance {
  const order = { adjusted: 0, granted: 1, accrued: 2, used: 3 }
  const events: Omit<LedgerEntry, 'balance'>[] = []

  for (const a of adjustments) {
    if (a.employeeId === e.id && a.policyId === p.id) events.push({ date: a.effectiveDate, kind: 'adjusted', hours: a.hours, note: a.reason })
  }

  const todayIso = toISODate(today)
  // 대기 기간이 끝난 날부터 적립, 퇴사일 이후에는 적립 없음
  const from = ptoEligibleFrom(e, p)
  const until = e.terminationDate
  if (p.accrual === 'annual' && p.amount > 0) {
    const firstYear = Number(from.slice(0, 4))
    for (let y = firstYear; y <= today.getFullYear(); y++) {
      const date = y === firstYear ? from : `${y}-01-01`
      if (date <= todayIso && (!until || date <= until)) events.push({ date, kind: 'granted', hours: p.amount })
    }
  }

  for (const run of [...runs].sort((a, b) => a.payDate.localeCompare(b.payDate))) {
    const result = run.results.find((x) => x.employeeId === e.id)
    if (!result) continue
    // 적립은 지급일 기준으로 대기 기간이 끝난 뒤의 회차부터 (마지막 급여는 퇴사 전 근무분이라 포함)
    const accrues = run.payDate >= from && (!until || (run.periodStart ?? run.payDate) <= until)
    if (accrues && p.accrual === 'per_hour' && p.amount > 0) {
      const worked = e.payType === 'salary' ? standardHours[e.payFrequency ?? 'biweekly'] : result.hours
      if (worked > 0) events.push({ date: run.payDate, kind: 'accrued', hours: (worked * p.amount) / p.perHours, note: `${worked}h` })
    }
    if (accrues && p.accrual === 'per_period' && p.amount > 0) events.push({ date: run.payDate, kind: 'accrued', hours: p.amount })
    const used = run.time[e.id]?.timeOff?.[p.id] ?? 0
    if (used > 0) events.push({ date: run.payDate, kind: 'used', hours: -used })
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind])

  let balance = 0
  let accrued = 0
  let used = 0
  const entries: LedgerEntry[] = []
  for (const ev of events) {
    let hours = ev.hours
    let capped = false
    if ((ev.kind === 'accrued' || ev.kind === 'granted') && p.maxBalance !== null) {
      const room = Math.max(0, p.maxBalance - balance)
      if (hours > room) {
        hours = room
        capped = true
      }
    }
    hours = r2(hours)
    if (hours === 0 && !capped) continue
    balance = r2(balance + hours)
    if (ev.kind === 'accrued' || ev.kind === 'granted') accrued = r2(accrued + hours)
    if (ev.kind === 'used') used = r2(used - hours)
    entries.push({ ...ev, hours, balance, ...(capped ? { capped } : {}) })
  }
  return { policy: p, balance, accrued, used, entries }
}

/** 평일 수 (토·일 제외, 양 끝 포함) */
export function weekdaysBetween(start: string, end: string): number {
  let n = 0
  const d = parseISODate(start)
  const last = parseISODate(end)
  while (d <= last) {
    const w = d.getDay()
    if (w !== 0 && w !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

/** 휴가 신청 기본 시간: 평일 × 하루 8시간 */
export const defaultRequestHours = (start: string, end: string, perDay = 8) =>
  start && end && end >= start ? weekdaysBetween(start, end) * perDay : 0

/**
 * 승인된 휴가 중 이 급여 기간에 들어가는 시간 (기간에 걸친 평일 비율만큼)
 */
export function approvedHoursInPeriod(requests: PtoRequest[], employeeId: string, policyId: string, start: string, end: string): number {
  let total = 0
  for (const r of requests) {
    if (r.status !== 'approved' || r.employeeId !== employeeId || r.policyId !== policyId) continue
    if (r.endDate < start || r.startDate > end) continue
    const all = weekdaysBetween(r.startDate, r.endDate)
    const from = r.startDate > start ? r.startDate : start
    const to = r.endDate < end ? r.endDate : end
    const overlap = weekdaysBetween(from, to)
    total += all > 0 ? (r.hours * overlap) / all : r.hours
  }
  return r2(total)
}

/** 화면용: 적립 방식 설명 */
export function accrualText(p: Pick<PtoPolicy, 'accrual' | 'amount' | 'perHours' | 'maxBalance' | 'waitingDays'>, t: (ko: string, en: string) => string): string {
  const cap = (p.maxBalance !== null ? t(` · 최대 ${p.maxBalance}시간`, ` · max ${p.maxBalance}h`) : '')
    + (p.waitingDays ? t(` · 입사 후 ${p.waitingDays}일 대기`, ` · after ${p.waitingDays}-day wait`) : '')
  switch (p.accrual) {
    case 'per_hour':
      return t(`근무 ${p.perHours}시간마다 ${p.amount}시간 적립`, `${p.amount}h per ${p.perHours}h worked`) + cap
    case 'per_period':
      return t(`급여 회차마다 ${p.amount}시간 적립`, `${p.amount}h every payroll`) + cap
    case 'annual':
      return t(`매년 ${p.amount}시간 (1월 1일)`, `${p.amount}h each year (Jan 1)`) + cap
    case 'none':
      return t('적립 없음 — 사용한 시간만 기록', 'No accrual — tracks time used')
  }
}

export const ptoKindLabel = (k: PtoPolicy['kind'], t: (ko: string, en: string) => string) =>
  ({ pto: t('유급 휴가', 'PTO'), sick: t('병가', 'Sick leave'), vacation: t('연차·휴가', 'Vacation'), other: t('기타', 'Other') })[k]
