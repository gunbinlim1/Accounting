import type { Employee } from '../types'
import { daysBetween, parseISODate, startOfDay } from './schedule'

/** 주말을 건너뛰고 n 영업일 뒤 (연방 공휴일은 반영하지 않음) */
export function addBusinessDays(date: Date, n: number): Date {
  const d = startOfDay(date)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

export type I9State =
  | { kind: 'complete' }
  | { kind: 'section1-missing' }
  | { kind: 'section2-due'; due: Date; daysLeft: number }
  | { kind: 'section2-overdue'; due: Date; daysLate: number }
  | { kind: 'documents-missing' }
  | { kind: 'copies-missing' }
  | { kind: 'auth-expiring'; expires: Date; daysLeft: number }
  | { kind: 'auth-expired'; expires: Date }

/**
 * I-9 상태:
 * - Section 1: 근무 첫날까지 직원 작성
 * - Section 2: 근무 시작 후 3 영업일 이내 고용주가 서류 확인
 * - 취업허가 만료 시 재확인(Supplement B) 필요
 */
export function i9State(e: Employee, today: Date): I9State {
  const { i9 } = e
  if (!i9.section1Date) return { kind: 'section1-missing' }
  if (!i9.section2Date) {
    const due = addBusinessDays(parseISODate(e.hireDate), 3)
    const diff = daysBetween(today, due)
    return diff < 0 ? { kind: 'section2-overdue', due, daysLate: -diff } : { kind: 'section2-due', due, daysLeft: diff }
  }
  const needed = i9.documentPath === 'A' ? 1 : 2
  const docs = i9.documents.filter((d) => d.title.trim())
  if (docs.length < needed) return { kind: 'documents-missing' }
  if (docs.slice(0, needed).some((d) => !d.copy)) return { kind: 'copies-missing' }
  if (i9.citizenship === 'authorized' && i9.workAuthExpires) {
    const expires = parseISODate(i9.workAuthExpires)
    const left = daysBetween(today, expires)
    if (left < 0) return { kind: 'auth-expired', expires }
    if (left <= 90) return { kind: 'auth-expiring', expires, daysLeft: left }
  }
  return { kind: 'complete' }
}

export type Tone = 'good' | 'warn' | 'crit'

export function i9Badge(state: I9State, t: (ko: string, en: string) => string): { tone: Tone; label: string } {
  switch (state.kind) {
    case 'complete':
      return { tone: 'good', label: t('I-9 완료', 'I-9 done') }
    case 'section1-missing':
      return { tone: 'warn', label: t('I-9 Section 1 미작성', 'I-9 Section 1 missing') }
    case 'section2-due':
      return { tone: 'warn', label: t(`I-9 확인 D-${state.daysLeft}`, `I-9 due in ${state.daysLeft}d`) }
    case 'section2-overdue':
      return { tone: 'crit', label: t(`I-9 기한 ${state.daysLate}일 초과`, `I-9 ${state.daysLate}d overdue`) }
    case 'documents-missing':
      return { tone: 'warn', label: t('I-9 서류 부족', 'I-9 documents missing') }
    case 'copies-missing':
      return { tone: 'warn', label: t('신분증 사본 미업로드', 'ID copies missing') }
    case 'auth-expiring':
      return { tone: 'warn', label: t(`취업허가 만료 D-${state.daysLeft}`, `Work auth expires in ${state.daysLeft}d`) }
    case 'auth-expired':
      return { tone: 'crit', label: t('취업허가 만료 — 재확인', 'Work auth expired — reverify') }
  }
}

/** 화면 표시용 마스킹: ***-**-1234 */
export const maskSsn = (last4: string): string => (last4 ? `***-**-${last4}` : '—')

/** 입력값에서 숫자 뒤 4자리만 남김 */
export const keepLast4 = (value: string): string => value.replace(/\D/g, '').slice(-4)
