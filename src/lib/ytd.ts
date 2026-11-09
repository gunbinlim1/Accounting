import type { PayRun } from '../types'

/** 해당 연도에서 특정 급여일 이전까지의 누적 총급여 */
export function ytdGrossFor(runs: PayRun[], payDate: string): Record<string, number> {
  const year = payDate.slice(0, 4)
  const ytd: Record<string, number> = {}
  for (const run of runs) {
    if (run.payDate.slice(0, 4) !== year || run.payDate >= payDate) continue
    for (const r of run.results) ytd[r.employeeId] = (ytd[r.employeeId] ?? 0) + r.grossPay
  }
  return ytd
}
