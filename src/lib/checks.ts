import { payrollConfig } from '../config/payrollConfig'
import type { Employee, Hours, PayrollResult } from '../types'

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
  hours: Record<string, Hours>
  results: PayrollResult[]
  previous?: PayrollResult[]
  ytdGross: Record<string, number>
  standardHours: number
}

/** 급여 승인 전 자동 점검 */
export function runChecks({ employees, hours, results, previous, ytdGross, standardHours }: CheckInput): Check[] {
  const checks: Check[] = []
  const prevById = new Map(previous?.map((r) => [r.employeeId, r]))

  for (const e of employees) {
    const r = results.find((x) => x.employeeId === e.id)
    if (!r) continue
    const h = hours[e.id]

    if (e.payType === 'hourly' && h) {
      if (h.regular === 0 && h.overtime === 0) {
        checks.push({
          id: `${e.id}-zero`, severity: 'critical', employeeId: e.id,
          ko: `${e.name}님의 근무시간이 0시간입니다. 입력을 빠뜨리지 않았나요?`,
          en: `${e.name} has 0 hours. Did you forget to enter them?`,
        })
      }
      if (h.regular > standardHours) {
        checks.push({
          id: `${e.id}-reg`, severity: 'warning', employeeId: e.id,
          ko: `${e.name}님의 정규 시간(${h.regular}h)이 표준 ${standardHours}h를 넘습니다. 초과분은 1.5배 초과근무로 옮겨야 할 수 있어요.`,
          en: `${e.name}'s regular hours (${h.regular}h) exceed the standard ${standardHours}h. The excess may need to be overtime at 1.5×.`,
        })
      }
      if (h.overtime > 20) {
        checks.push({
          id: `${e.id}-ot`, severity: 'warning', employeeId: e.id,
          ko: `${e.name}님의 초과근무가 ${h.overtime}시간으로 많습니다. 오타가 아닌지 확인하세요.`,
          en: `${e.name} has ${h.overtime} overtime hours. Double-check for a typo.`,
        })
      }
    }

    const prev = prevById.get(e.id)
    if (prev && prev.netPay > 0) {
      const change = (r.netPay - prev.netPay) / prev.netPay
      if (Math.abs(change) >= 0.15) {
        const pct = `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`
        checks.push({
          id: `${e.id}-delta`, severity: 'warning', employeeId: e.id,
          ko: `${e.name}님의 실수령액이 지난 급여 대비 ${pct} 달라졌습니다.`,
          en: `${e.name}'s net pay changed ${pct} from the last run.`,
        })
      }
    }

    const ytd = ytdGross[e.id] ?? 0
    if (ytd < payrollConfig.socialSecurityWageBase && ytd + r.grossPay >= payrollConfig.socialSecurityWageBase) {
      checks.push({
        id: `${e.id}-ss`, severity: 'info', employeeId: e.id,
        ko: `${e.name}님이 이번 급여로 Social Security 연간 상한에 도달해 남은 기간에는 SS가 공제되지 않습니다.`,
        en: `${e.name} reaches the Social Security wage base this run; SS stops for the rest of the year.`,
      })
    }

    if (e.pretaxDeferralRate === 0) {
      checks.push({
        id: `${e.id}-401k`, severity: 'info', employeeId: e.id,
        ko: `${e.name}님은 401(k)에 가입하지 않았습니다. 세전 저축을 안내해 보세요.`,
        en: `${e.name} isn't contributing to a 401(k). Consider mentioning pre-tax savings.`,
      })
    }
  }

  return checks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
