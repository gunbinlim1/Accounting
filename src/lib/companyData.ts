import type { CompanyData } from '../types'
import { defaultTimeFor } from '../config/industries'
import { openDateOf, openRuns, scheduleOf } from './paySchedules'

/**
 * 스케줄에 맞춰 회사 데이터를 정리 (불러온 뒤·화면에서 고친 뒤마다)
 * - 직원별 지급 주기(payFrequency)와 지금 회차 지급일(timeDates)
 * - 열린 회차마다 상태 칸(open) — 없으면 작성 중
 * - 스케줄이 바뀌어 다른 회차로 옮긴 직원은 새 회차의 기본 입력으로
 */
export function normalizeCompany(data: CompanyData, today: Date): CompanyData {
  const schedules = data.schedules
  if (!schedules.length) return data
  const employees = data.employees.map((e) => {
    const f = scheduleOf(e, schedules)?.frequency
    return f && e.payFrequency !== f ? { ...e, payFrequency: f } : e
  })
  const timeDates: Record<string, string> = {}
  const time = { ...data.time }
  for (const e of employees) {
    const d = openDateOf(e, schedules, today)
    if (!d) continue
    timeDates[e.id] = d
    const before = data.timeDates[e.id]
    if (before && before !== d) time[e.id] = defaultTimeFor(e.role, data.company.tipsEnabled)
  }
  const open = { ...data.open }
  for (const r of openRuns(schedules, today)) if (!open[r.payDate]) open[r.payDate] = { payDate: r.payDate, status: 'draft' }
  return { ...data, employees, time, timeDates, open }
}

/** 가장 빠른 열린 회차 (회계법인 목록·사이드바 표시용) */
export function firstOpen(data: CompanyData): { payDate: string; status: CompanyData['open'][string]['status'] } | undefined {
  const d = Object.keys(data.open).sort()[0]
  return d ? { payDate: d, status: data.open[d].status } : undefined
}
