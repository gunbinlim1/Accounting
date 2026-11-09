import type { PayFrequency } from '../types'

const DAY = 86_400_000

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const parseISODate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY)

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lastDayOfMonth = (y: number, m: number): Date => new Date(y, m + 1, 0)

/** from 이후(당일 포함) 첫 급여일 */
export function nextPayDate(frequency: PayFrequency, anchor: Date, from: Date): Date {
  const today = startOfDay(from)
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14
    const diff = daysBetween(anchor, today)
    const k = Math.max(0, Math.ceil(diff / step))
    return addDays(anchor, k * step)
  }
  const y = today.getFullYear()
  const m = today.getMonth()
  const candidates =
    frequency === 'monthly'
      ? [lastDayOfMonth(y, m), lastDayOfMonth(y, m + 1)]
      : [new Date(y, m, 15), lastDayOfMonth(y, m), new Date(y, m + 1, 15)]
  return candidates.find((c) => c >= today)!
}

/** 해당 급여일 직전 급여일 */
export function previousPayDate(frequency: PayFrequency, payDate: Date): Date {
  if (frequency === 'weekly') return addDays(payDate, -7)
  if (frequency === 'biweekly') return addDays(payDate, -14)
  const y = payDate.getFullYear()
  const m = payDate.getMonth()
  if (frequency === 'monthly') return lastDayOfMonth(y, m - 1)
  return payDate.getDate() === 15 ? lastDayOfMonth(y, m - 1) : new Date(y, m, 15)
}

export interface Deadline {
  date: Date
  form: string
  ko: string
  en: string
}

/** 연방 고용세 주요 신고 기한 (주말·공휴일이면 다음 영업일) */
export function upcomingDeadlines(from: Date, count = 4): Deadline[] {
  const today = startOfDay(from)
  const list: Deadline[] = []
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    list.push(
      { date: new Date(y, 0, 31), form: 'W-2 / W-3', ko: '직원 W-2 발송 및 SSA 제출', en: 'Furnish W-2s & file with SSA' },
      { date: new Date(y, 0, 31), form: '940', ko: '연방 실업세(FUTA) 연간 신고', en: 'Annual FUTA return' },
      { date: new Date(y, 0, 31), form: '941 Q4', ko: '4분기 고용세 신고', en: 'Q4 payroll tax return' },
      { date: new Date(y, 3, 30), form: '941 Q1', ko: '1분기 고용세 신고', en: 'Q1 payroll tax return' },
      { date: new Date(y, 6, 31), form: '941 Q2', ko: '2분기 고용세 신고', en: 'Q2 payroll tax return' },
      { date: new Date(y, 9, 31), form: '941 Q3', ko: '3분기 고용세 신고', en: 'Q3 payroll tax return' },
    )
  }
  return list
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, count)
}
