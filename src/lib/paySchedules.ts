/**
 * 회사별 급여 스케줄 계산 (순수 함수)
 *
 * - 스케줄: 주기(매주·격주·월 2회·매월) + 첫 지급일(기준일)
 * - 정해진 지급일(원래 날짜)이 회차의 "열쇠"이고, overrides로 회차마다 실제 지급일·급여 기간을 바꿀 수 있음
 * - 회차(run)는 실제 지급일로 저장. 같은 날 지급하는 스케줄들은 한 회차로 묶임
 */
import type { Employee, PayFrequency, PaySchedule } from '../types'
import { cutoffFor, nextPayDate, parseISODate, previousPayDate, startOfDay, toISODate } from './schedule'

export interface Period {
  scheduleId: string
  /** 원래 정해진 지급일 (overrides 열쇠) */
  scheduled: string
  /** 실제 지급일 */
  payDate: string
  start: string
  end: string
  changed: boolean
}

const addDays = (iso: string, n: number) => {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** 원래 지급일 기준 기본 급여 기간: 직전 지급일 다음 날 ~ 지급일 */
function basePeriod(s: PaySchedule, scheduled: string): Period {
  const prev = toISODate(previousPayDate(s.frequency, parseISODate(scheduled)))
  return { scheduleId: s.id, scheduled, payDate: scheduled, start: addDays(prev, 1), end: scheduled, changed: false }
}

/** 원래 지급일 → 실제 회차 (변경 반영) */
export function periodFor(s: PaySchedule, scheduled: string): Period {
  const base = basePeriod(s, scheduled)
  const o = s.overrides[scheduled]
  return o ? { ...base, payDate: o.payDate, start: o.start, end: o.end, changed: true } : base
}

/** from 이후(당일 포함) 첫 원래 지급일 */
const nextScheduled = (s: PaySchedule, from: string) =>
  toISODate(nextPayDate(s.frequency, parseISODate(s.firstPayDate), parseISODate(from)))

/** 지금 진행 중인 회차: 실제 지급일이 오늘 이후(당일 포함)인 첫 회차 */
export function openPeriod(s: PaySchedule, today: Date): Period {
  const t = toISODate(startOfDay(today))
  // 지급일을 앞당긴 경우를 위해 하루 전 원래 지급일부터 확인
  let scheduled = nextScheduled(s, addDays(t, -31))
  for (let i = 0; i < 80; i++) {
    const p = periodFor(s, scheduled)
    if (p.payDate >= t) return p
    scheduled = nextScheduled(s, addDays(scheduled, 1))
  }
  return periodFor(s, nextScheduled(s, t))
}

/** 이 회차 다음 회차들 */
export function periodsAfter(s: PaySchedule, p: Period, count: number): Period[] {
  const out: Period[] = []
  let scheduled = p.scheduled
  while (out.length < count) {
    scheduled = nextScheduled(s, addDays(scheduled, 1))
    out.push(periodFor(s, scheduled))
  }
  return out
}

/** 이 회차 이전 회차들 (최근 것부터, since 이후 시작한 것만) */
export function periodsBefore(s: PaySchedule, p: Period, since: string, limit: number): Period[] {
  const out: Period[] = []
  let d = previousPayDate(s.frequency, parseISODate(p.scheduled))
  while (out.length < limit) {
    const q = periodFor(s, toISODate(d))
    if (q.start < since) break
    out.push(q)
    d = previousPayDate(s.frequency, d)
  }
  return out
}

export const defaultSchedule = (schedules: PaySchedule[]): PaySchedule | undefined =>
  schedules.find((s) => s.isDefault) ?? schedules[0]

/** 직원이 속한 스케줄 (지정 없으면 기본) */
export const scheduleOf = (e: Pick<Employee, 'scheduleId'>, schedules: PaySchedule[]): PaySchedule | undefined =>
  schedules.find((s) => s.id === e.scheduleId && s.active) ?? defaultSchedule(schedules)

export const frequencyOf = (e: Pick<Employee, 'scheduleId' | 'payFrequency'>, schedules?: PaySchedule[]): PayFrequency =>
  (schedules ? scheduleOf(e, schedules)?.frequency : undefined) ?? e.payFrequency ?? 'biweekly'

/** 지금 열려 있는 회차들 (실제 지급일 기준으로 묶음, 빠른 날짜 순) */
export interface OpenRun {
  payDate: string
  start: string
  end: string
  schedules: { schedule: PaySchedule; period: Period }[]
}

export function openRuns(schedules: PaySchedule[], today: Date): OpenRun[] {
  const map = new Map<string, OpenRun>()
  for (const s of schedules.filter((x) => x.active)) {
    const p = openPeriod(s, today)
    const run = map.get(p.payDate) ?? { payDate: p.payDate, start: p.start, end: p.end, schedules: [] }
    run.start = run.start < p.start ? run.start : p.start
    run.end = run.end > p.end ? run.end : p.end
    run.schedules.push({ schedule: s, period: p })
    map.set(p.payDate, run)
  }
  return [...map.values()].sort((a, b) => a.payDate.localeCompare(b.payDate))
}

/** 직원 → 지금 입력하는 회차의 지급일 */
export function openDateOf(e: Pick<Employee, 'scheduleId'>, schedules: PaySchedule[], today: Date): string | undefined {
  const s = scheduleOf(e, schedules)
  return s ? openPeriod(s, today).payDate : undefined
}

export const cutoffOf = (payDate: string, businessDays: number) => cutoffFor(parseISODate(payDate), businessDays)

/** 화면 표시용: 주기 이름·설명·색 */
export const frequencyInfo = (f: PayFrequency, t: (ko: string, en: string) => string) =>
  ({
    weekly: { label: t('매주', 'Weekly'), detail: t('1년 52회 · 매주 같은 요일', '52 paychecks a year · same weekday'), tone: 'weekly' },
    biweekly: { label: t('격주', 'Biweekly'), detail: t('1년 26회 · 2주마다 같은 요일', '26 paychecks a year · every other week'), tone: 'biweekly' },
    semimonthly: { label: t('월 2회', 'Semi-monthly'), detail: t('1년 24회 · 매월 15일·말일', '24 paychecks a year · 15th & last day'), tone: 'semimonthly' },
    monthly: { label: t('매월', 'Monthly'), detail: t('1년 12회 · 매월 말일', '12 paychecks a year · last day of month'), tone: 'monthly' },
  })[f]

/** 회차 날짜 변경이 올바른지 (문제 없으면 null) */
export function validateOverride(p: { payDate: string; start: string; end: string }, t: (ko: string, en: string) => string): string | null {
  if (!p.payDate || !p.start || !p.end) return t('날짜를 모두 입력하세요', 'Fill in all dates')
  if (p.start > p.end) return t('급여 기간 시작일이 끝나는 날보다 늦어요', 'Period start is after its end')
  const days = (parseISODate(p.end).getTime() - parseISODate(p.start).getTime()) / 86_400_000 + 1
  if (days > 62) return t('급여 기간이 너무 길어요 (최대 62일)', 'Pay period is too long (62 days max)')
  const gap = (parseISODate(p.payDate).getTime() - parseISODate(p.end).getTime()) / 86_400_000
  if (gap < -14 || gap > 31) return t('지급일이 급여 기간과 너무 멀어요', 'Pay date is too far from the pay period')
  return null
}
