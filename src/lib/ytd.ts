import type { PayRun, YtdTotals } from '../types'

/** 해당 연도에서 특정 급여일 이전까지의 직원별 누적 (FICA 임금, FUTA 임금, Fringe 항목별) */
export function ytdFor(runs: PayRun[], payDate: string): Record<string, YtdTotals> {
  const year = payDate.slice(0, 4)
  const ytd: Record<string, YtdTotals> = {}
  for (const run of runs) {
    if (run.payDate.slice(0, 4) !== year || run.payDate >= payDate) continue
    for (const r of run.results) {
      const y = (ytd[r.employeeId] ??= { gross: 0, futaWages: 0, sutaWages: 0, fringe: {} })
      y.gross += r.ficaWages ?? r.grossPay
      y.futaWages += r.futaWages ?? r.grossPay
      y.sutaWages += r.futaWages ?? r.grossPay
      for (const l of r.fringeLines ?? []) y.fringe[l.itemId] = (y.fringe[l.itemId] ?? 0) + l.amount
    }
  }
  return ytd
}

/** 직원별 FICA 임금 누적만 (Social Security 상한 점검용) */
export function ytdGrossFor(runs: PayRun[], payDate: string): Record<string, number> {
  return Object.fromEntries(Object.entries(ytdFor(runs, payDate)).map(([id, y]) => [id, y.gross]))
}
