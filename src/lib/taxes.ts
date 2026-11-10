import { fringeById } from '../config/fringeBenefits'
import { payrollConfig as cfg } from '../config/payrollConfig'
import type { DepositSchedule, PayRun, PayrollResult, TaxDeposit } from '../types'
import { roundCents } from './money'
import { parseISODate, toISODate } from './schedule'

export type Quarter = 1 | 2 | 3 | 4

export const quarterOf = (isoDate: string): Quarter => (Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1) as Quarter
const lastDay = (y: number, m0: number) => new Date(y, m0 + 1, 0)

/** 분기 신고·납부 기한: 분기 다음 달 말일 (4/30, 7/31, 10/31, 1/31) */
export function quarterDueDate(year: number, q: Quarter): string {
  return toISODate(q === 4 ? lastDay(year + 1, 0) : lastDay(year, q * 3))
}

/**
 * 연방 원천징수 + FICA 예치 기한.
 * 월별: 다음 달 15일 · 반주별: 수·목·금 지급 → 다음 주 수요일, 토~화 지급 → 다음 주 금요일.
 * (주말·공휴일이면 다음 영업일 — 공휴일은 반영하지 않음)
 */
export function federalDueDate(payDate: string, schedule: DepositSchedule): string {
  const d = parseISODate(payDate)
  if (schedule === 'monthly') return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 15))
  const dow = d.getDay() // 0=일
  // 수·목·금 지급 → 다음 주 수요일, 토·일·월·화 지급 → 그 뒤 금요일
  const add = dow >= 3 && dow <= 5 ? (3 - dow + 7) % 7 || 7 : (5 - dow + 7) % 7
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + add))
}

const sum = (rs: PayrollResult[], f: (r: PayrollResult) => number) => roundCents(rs.reduce((a, r) => a + f(r), 0))

/** 회차의 IRS 예치액 = 연방 원천징수 + 직원·회사 FICA */
export const federalLiability = (results: PayrollResult[]) =>
  sum(results, (r) => r.federalWithholding + r.socialSecurity + r.medicare + r.employerSocialSecurity + r.employerMedicare)

export const runsInQuarter = (runs: PayRun[], year: number, q: Quarter) =>
  runs.filter((r) => Number(r.payDate.slice(0, 4)) === year && quarterOf(r.payDate) === q)

/** Form 941 주요 줄 (분기) */
export function form941(runs: PayRun[], deposits: TaxDeposit[], year: number, q: Quarter) {
  const rs = runsInQuarter(runs, year, q).flatMap((r) => r.results)
  const employees = new Set(rs.map((r) => r.employeeId)).size
  const ssTaxable = sum(rs, (r) => r.employerSocialSecurity / cfg.socialSecurityRate)
  const tips = sum(rs, (r) => r.cashTips + r.cardTips)
  const ssTips = Math.min(tips, ssTaxable)
  const line2 = sum(rs, (r) => r.box1Wages ?? r.federalTaxableWages)
  const line3 = sum(rs, (r) => r.federalWithholding)
  const line5a = roundCents(ssTaxable - ssTips)
  const line5b = roundCents(ssTips)
  const line5c = sum(rs, (r) => r.ficaWages ?? r.grossPay)
  const line5e = roundCents(line5a * 0.124 + line5b * 0.124 + line5c * 0.029)
  const actual = federalLiability(rs)
  const line7 = roundCents(actual - (line3 + line5e)) // 센트 단위 반올림 조정
  const line12 = actual
  const paid = roundCents(
    deposits.filter((d) => d.kind === 'federal' && d.status === 'paid' && d.period.slice(0, 4) === String(year) && quarterOf(d.period.slice(0, 10)) === q).reduce((a, d) => a + d.amount, 0),
  )
  return { employees, line2, line3, line5a, line5b, line5c, line5e, line7, line12, paid, balance: roundCents(line12 - paid), due: quarterDueDate(year, q) }
}

/** 텍사스 TWC C-3 (분기 임금 보고·실업세) */
export function twcQuarter(runs: PayRun[], year: number, q: Quarter, rate: number) {
  const rs = runsInQuarter(runs, year, q).flatMap((r) => r.results)
  const totalWages = sum(rs, (r) => r.futaWages ?? r.grossPay)
  const tax = sum(rs, (r) => r.suta)
  const taxableWages = rate > 0 ? roundCents(tax / rate) : 0
  return { employees: new Set(rs.map((r) => r.employeeId)).size, totalWages, taxableWages, tax, due: quarterDueDate(year, q) }
}

/** FUTA: 분기 말 누적 미납액이 $500를 넘으면 다음 달 말일까지 예치, 아니면 이월 */
export function futaSchedule(runs: PayRun[], year: number) {
  let carried = 0
  return ([1, 2, 3, 4] as Quarter[]).map((q) => {
    const liability = sum(runsInQuarter(runs, year, q).flatMap((r) => r.results), (r) => r.futa)
    const accumulated = roundCents(carried + liability)
    const mustDeposit = accumulated > 500 || q === 4
    const row = { q, liability, carriedIn: roundCents(carried), accumulated, mustDeposit, due: quarterDueDate(year, q) }
    carried = mustDeposit ? 0 : accumulated
    return row
  })
}

export interface W2 {
  box1: number
  box2: number
  box3: number
  box4: number
  box5: number
  box6: number
  box7: number
  box10: number
  box12: { code: string; amount: number }[]
  box14: { label: string; amount: number }[]
  qualifiedTips: number
  qualifiedOvertime: number
  paychecks: number
}

/** 직원 1명의 연간 W-2 (처리 완료된 회차 기준) */
export function w2For(runs: PayRun[], employeeId: string, year: number): W2 {
  const rs = runs.filter((r) => Number(r.payDate.slice(0, 4)) === year).flatMap((r) => r.results.filter((x) => x.employeeId === employeeId))
  const fringeSum = (id: string, f: (l: { amount: number; fit: number; fica: number }) => number = (l) => l.amount) =>
    roundCents(rs.reduce((a, r) => a + (r.fringeLines ?? []).filter((l) => l.itemId === id).reduce((b, l) => b + f(l), 0), 0))
  const ssTaxable = sum(rs, (r) => r.employerSocialSecurity / cfg.socialSecurityRate)
  const tips = sum(rs, (r) => r.cashTips + r.cardTips)
  const ssTips = Math.min(tips, ssTaxable)
  const uncollected = sum(rs, (r) => r.uncollectedFica)
  const ssShare = cfg.socialSecurityRate / (cfg.socialSecurityRate + cfg.medicareRate)

  const box12 = [
    { code: 'A', amount: roundCents(uncollected * ssShare) },
    { code: 'B', amount: roundCents(uncollected * (1 - ssShare)) },
    { code: 'C', amount: fringeSum('gtl', (l) => l.fica) },
    { code: 'D', amount: sum(rs, (r) => r.pretaxDeductions) },
    { code: 'DD', amount: fringeSum('health') },
    { code: 'W', amount: fringeSum('hsa') },
  ].filter((x) => x.amount > 0)
  const box14 = [
    { label: fringeById('scorp_health')!.box14!, amount: fringeSum('scorp_health') },
    { label: fringeById('vehicle')!.box14!, amount: fringeSum('vehicle') },
  ].filter((x) => x.amount > 0)

  return {
    box1: sum(rs, (r) => r.box1Wages ?? r.federalTaxableWages),
    box2: sum(rs, (r) => r.federalWithholding),
    box3: roundCents(ssTaxable - ssTips),
    box4: sum(rs, (r) => r.socialSecurity),
    box5: sum(rs, (r) => r.ficaWages ?? r.grossPay),
    box6: sum(rs, (r) => r.medicare),
    box7: roundCents(ssTips),
    box10: fringeSum('dependent_care'),
    box12,
    box14,
    qualifiedTips: tips,
    qualifiedOvertime: sum(rs, (r) => r.qualifiedOvertimePremium),
    paychecks: rs.length,
  }
}
