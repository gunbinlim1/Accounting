import type { PayFrequency } from '../types'
import { cutoffFor, pastPayDates, payPeriodFor, startOfDay, toISODate, upcomingPayDates } from './schedule'

/**
 * 홈 화면 급여 일정표의 한 줄
 * - missed: 가입 후 시작된 급여 기간인데 처리 기록이 없음
 * - current: 지금 입력·제출하는 회차
 * - upcoming: 다음 회차들
 */
export interface ScheduleRow {
  kind: 'missed' | 'current' | 'upcoming'
  payDate: Date
  start: Date
  end: Date
  cutoff: Date
}

export function buildSchedule(opts: {
  frequency: PayFrequency
  anchor: Date
  currentPayDate: Date
  /** 포털 생성 시각 (없으면 지난 회차는 표시하지 않음) */
  createdAt?: string
  /** 처리된 회차의 지급일 YYYY-MM-DD */
  processedPayDates: string[]
  cutoffBusinessDays: number
  upcoming?: number
  missedLimit?: number
}): ScheduleRow[] {
  const { frequency, anchor, currentPayDate, cutoffBusinessDays } = opts
  const row = (kind: ScheduleRow['kind'], payDate: Date): ScheduleRow => ({
    kind,
    payDate,
    ...payPeriodFor(frequency, payDate),
    cutoff: cutoffFor(payDate, cutoffBusinessDays),
  })
  const done = new Set(opts.processedPayDates)

  const missed: ScheduleRow[] = []
  if (opts.createdAt) {
    const joined = startOfDay(new Date(opts.createdAt))
    for (const d of pastPayDates(frequency, currentPayDate, joined, opts.missedLimit ?? 3)) {
      if (!done.has(toISODate(d)) && payPeriodFor(frequency, d).start >= joined) missed.unshift(row('missed', d))
    }
  }

  const next = upcomingPayDates(frequency, anchor, new Date(currentPayDate.getTime() + 86_400_000), opts.upcoming ?? 3)
  return [...missed, row('current', currentPayDate), ...next.map((d) => row('upcoming', d))]
}
