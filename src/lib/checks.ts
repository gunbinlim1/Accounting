import { payrollConfig as cfg } from '../config/payrollConfig'
import type { Employee, PayrollResult, TimeEntry } from '../types'
import { i9State } from './compliance'
import { formatCurrency } from './format'

export type Severity = 'critical' | 'warning' | 'info'

export interface Check {
  id: string
  severity: Severity
  employeeId?: string
  ko: string
  en: string
}

const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

interface CheckInput {
  employees: Employee[]
  time: Record<string, TimeEntry>
  results: PayrollResult[]
  previous?: PayrollResult[]
  ytdGross: Record<string, number>
  standardHours: number
  today: Date
}

/**
 * 급여 승인 전 자동 점검 — 임금법, 팁, 세금, W-4/I-9.
 * critical은 급여 계산 자체가 틀린 경우에만 사용 (승인 차단). 서류 문제는 임금 지급을 막지 않음.
 */
export function runChecks({ employees, time, results, previous, ytdGross, standardHours, today }: CheckInput): Check[] {
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)
  const prevById = new Map(previous?.map((r) => [r.employeeId, r]))

  for (const e of employees) {
    const r = results.find((x) => x.employeeId === e.id)
    if (!r) continue
    const h = time[e.id]
    const n = e.name

    // ── 임금 기준
    if (e.payType === 'tipped' && e.rate < cfg.tippedCashWage) {
      add({ id: `${e.id}-cash`, severity: 'critical', employeeId: e.id,
        ko: `${n}님의 현금 시급 ${formatCurrency(e.rate)}이 팁 직원 최저 현금 시급 $2.13보다 낮습니다.`,
        en: `${n}'s cash wage ${formatCurrency(e.rate)} is below the $2.13 tipped minimum.` })
    }
    if (e.payType === 'hourly' && e.rate < cfg.minimumWage) {
      add({ id: `${e.id}-min`, severity: 'critical', employeeId: e.id,
        ko: `${n}님의 시급이 최저임금 $7.25보다 낮습니다.`,
        en: `${n}'s rate is below the $7.25 minimum wage.` })
    }

    // ── 근무시간·팁
    if (e.payType !== 'salary' && h) {
      if (h.regular + h.overtime === 0) {
        add({ id: `${e.id}-zero`, severity: 'warning', employeeId: e.id,
          ko: `${n}님의 근무시간이 0시간입니다. 입력을 빠뜨리지 않았나요?`,
          en: `${n} has 0 hours. Did you forget to enter them?` })
      }
      if (h.regular > standardHours) {
        add({ id: `${e.id}-reg`, severity: 'warning', employeeId: e.id,
          ko: `${n}님의 정규 시간(${h.regular}h)이 ${standardHours}h를 넘습니다. 주 40시간 초과분은 OT로 옮기세요.`,
          en: `${n}'s regular hours (${h.regular}h) exceed ${standardHours}h. Move hours over 40/week to OT.` })
      }
      if (h.overtime > 20) {
        add({ id: `${e.id}-ot`, severity: 'warning', employeeId: e.id,
          ko: `${n}님의 OT가 ${h.overtime}시간입니다. 오타가 아닌지 확인하세요.`,
          en: `${n} has ${h.overtime} OT hours. Double-check for a typo.` })
      }
      if (e.payType === 'tipped' && h.regular + h.overtime > 0 && h.cashTips + h.cardTips === 0) {
        add({ id: `${e.id}-notips`, severity: 'warning', employeeId: e.id,
          ko: `${n}님의 팁 신고가 없습니다. Form 4070 등으로 현금 팁을 받으셨나요?`,
          en: `${n} reported no tips. Did you collect their cash tip report (Form 4070)?` })
      }
    }
    if (r.tipMakeUp > 0) {
      add({ id: `${e.id}-makeup`, severity: 'info', employeeId: e.id,
        ko: `${n}님은 팁 포함 시급이 $7.25에 못 미쳐 ${formatCurrency(r.tipMakeUp)}을 보전 지급합니다.`,
        en: `${n}'s tips didn't reach $7.25/hr, so ${formatCurrency(r.tipMakeUp)} make-up pay is added.` })
    }
    if (r.uncollectedFica > 0) {
      add({ id: `${e.id}-uncol`, severity: 'warning', employeeId: e.id,
        ko: `${n}님은 급여가 부족해 FICA ${formatCurrency(r.uncollectedFica)}을 원천징수하지 못했습니다 (W-2 Box 12 A/B 보고).`,
        en: `${n}'s wages were too low to withhold ${formatCurrency(r.uncollectedFica)} FICA (report on W-2 Box 12 A/B).` })
    }

    // ── 지난 회차 대비
    const prev = prevById.get(e.id)
    if (prev && prev.netPay > 0) {
      const change = (r.netPay - prev.netPay) / prev.netPay
      if (Math.abs(change) >= 0.25) {
        const pct = `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`
        add({ id: `${e.id}-delta`, severity: 'warning', employeeId: e.id,
          ko: `${n}님의 실수령액이 지난 급여 대비 ${pct} 달라졌습니다.`,
          en: `${n}'s net pay changed ${pct} from the last run.` })
      }
    }

    const ytd = ytdGross[e.id] ?? 0
    if (ytd < cfg.socialSecurityWageBase && ytd + r.grossPay >= cfg.socialSecurityWageBase) {
      add({ id: `${e.id}-ss`, severity: 'info', employeeId: e.id,
        ko: `${n}님이 Social Security 연간 상한에 도달합니다.`,
        en: `${n} reaches the Social Security wage base this run.` })
    }

    // ── W-4 / I-9
    if (!e.w4) {
      add({ id: `${e.id}-w4`, severity: 'warning', employeeId: e.id,
        ko: `${n}님의 W-4가 없어 IRS 규정대로 Single·조정 없음으로 원천징수합니다.`,
        en: `${n} has no W-4, so withholding uses Single with no adjustments per IRS rules.` })
    }
    const i9 = i9State(e, today)
    if (i9.kind === 'section2-overdue') {
      add({ id: `${e.id}-i9`, severity: 'warning', employeeId: e.id,
        ko: `${n}님의 I-9 Section 2(서류 확인) 기한이 ${i9.daysLate}일 지났습니다. 급여는 지급하되 즉시 서류를 확인하세요.`,
        en: `${n}'s I-9 Section 2 is ${i9.daysLate} day(s) overdue. Pay wages as usual, but review documents now.` })
    } else if (i9.kind === 'section2-due' || i9.kind === 'section1-missing' || i9.kind === 'documents-missing') {
      add({ id: `${e.id}-i9`, severity: 'warning', employeeId: e.id,
        ko: `${n}님의 I-9가 아직 완료되지 않았습니다.`,
        en: `${n}'s I-9 is not complete yet.` })
    } else if (i9.kind === 'auth-expired') {
      add({ id: `${e.id}-auth`, severity: 'warning', employeeId: e.id,
        ko: `${n}님의 취업허가가 만료되었습니다. 이미 일한 시간의 급여는 지급하고, 재확인(Supplement B) 전에는 근무 일정을 잡지 마세요.`,
        en: `${n}'s work authorization has expired. Pay for hours worked, but don't schedule them until reverified (Supplement B).` })
    } else if (i9.kind === 'auth-expiring') {
      add({ id: `${e.id}-auth`, severity: 'warning', employeeId: e.id,
        ko: `${n}님의 취업허가가 ${i9.daysLeft}일 후 만료됩니다. 갱신 서류를 미리 요청하세요.`,
        en: `${n}'s work authorization expires in ${i9.daysLeft} days. Ask for renewal documents.` })
    }
  }

  return checks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
