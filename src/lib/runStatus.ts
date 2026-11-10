import { sumResults } from './payroll'
import type { PayrollResult, RunStatus } from '../types'

type T = (ko: string, en: string) => string

export const statusLabel = (s: RunStatus, t: T) =>
  ({
    draft: t('작성 중', 'Draft'),
    submitted: t('제출됨', 'Submitted'),
    in_review: t('검토 중', 'In review'),
    changes_requested: t('수정 요청', 'Changes requested'),
    processed: t('처리 완료', 'Processed'),
  })[s]

export const statusTone = (s: RunStatus) =>
  ({ draft: 'neutral', submitted: 'info', in_review: 'info', changes_requested: 'warn', processed: 'good' })[s]

/** 마감까지 남은 시간을 사람이 읽기 쉽게 */
export function timeLeft(deadline: Date, now: Date, t: T): { text: string; overdue: boolean; urgent: boolean } {
  const ms = deadline.getTime() - now.getTime()
  const overdue = ms < 0
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86_400_000)
  const hours = Math.floor((abs % 86_400_000) / 3_600_000)
  const span = days > 0 ? t(`${days}일 ${hours}시간`, `${days}d ${hours}h`) : t(`${hours}시간`, `${hours}h`)
  return { text: overdue ? t(`${span} 지남`, `${span} overdue`) : t(`${span} 남음`, `${span} left`), overdue, urgent: !overdue && ms < 36 * 3_600_000 }
}

/** 회사 총 출금액 = 급여 입금 + IRS 예치 + 401(k) + FUTA + TWC */
export const cashOutOf = (results: PayrollResult[]) => {
  const t = sumResults(results)
  return t.net + t.federalDeposit + t.pretax + t.futa + t.suta
}
