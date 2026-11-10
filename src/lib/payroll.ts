import { payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { fringeById } from '../config/fringeBenefits'
import type { Employee, FringeEntry, FringeLine, PayFrequency, PayrollInput, PayrollResult, TimeEntry } from '../types'
import { federalIncomeTaxWithholding } from './federalWithholding'
import { roundCents } from './money'

export { roundCents }

const pos = (n: number | undefined) => Math.max(0, n ?? 0)

/** 팁 직원의 시간당 팁 크레딧 (최저임금 − 현금 시급, 최대 $5.12) */
export const tipCreditRate = (cashRate: number): number =>
  Math.min(cfg.maxTipCredit, Math.max(0, cfg.minimumWage - cashRate))

/** 팁 직원 초과근무 현금 시급 = 1.5 × (현금시급 + 팁크레딧) − 팁크레딧 */
export const tippedOvertimeRate = (cashRate: number): number => {
  const credit = tipCreditRate(cashRate)
  return (cashRate + credit) * cfg.overtimeMultiplier - credit
}

/** 회차별 급여 금액(TimeEntry.rate)을 반영한 직원 정보. 연봉 직원은 회당 금액 × 연간 지급 횟수 */
export function effectiveEmployee<E extends Employee>(e: E, entry: Partial<TimeEntry> | undefined, frequency: PayFrequency): E {
  const override = entry?.rate
  if (override === undefined || override === null || !Number.isFinite(override)) return e
  return { ...e, rate: e.payType === 'salary' ? roundCents(override * periodsPerYear[frequency]) : override }
}

/** 직원 기본 급여를 회차 입력 단위로 (시급 그대로, 연봉은 회당 금액) */
export const baseRateForEntry = (e: Employee, frequency: PayFrequency): number =>
  e.payType === 'salary' ? roundCents(e.rate / periodsPerYear[frequency]) : e.rate

/**
 * Fringe Benefit을 세금별 과세 금액으로 나눔 (Pub. 15-B 규칙표).
 * 한도가 있는 항목은 연간 누적이 한도를 넘는 부분만 과세.
 */
export function splitFringes(entries: FringeEntry[] | undefined, ytdByItem: Record<string, number> = {}) {
  let fitWithhold = 0
  let fitWagesOnly = 0
  const lines: FringeLine[] = []
  for (const f of entries ?? []) {
    const amount = roundCents(Math.max(0, f.amount))
    if (!amount) continue
    const item = fringeById(f.itemId)
    if (!item) continue
    let base = amount
    if (item.annualLimit) {
      const used = ytdByItem[item.id] ?? 0
      base = Math.max(0, used + amount - item.annualLimit) - Math.max(0, used - item.annualLimit)
    }
    const fit = item.fit === 'exempt' ? 0 : base
    if (item.fit === 'withhold') fitWithhold += fit
    if (item.fit === 'wages_only') fitWagesOnly += fit
    lines.push({ itemId: item.id, amount, fit: roundCents(fit), fica: roundCents(item.fica ? base : 0), futa: roundCents(item.futa ? base : 0) })
  }
  return { lines, fitWithhold: roundCents(fitWithhold), fitWagesOnly: roundCents(fitWagesOnly) }
}

/** 상한까지 남은 과세 대상 금액 */
const underBase = (amount: number, ytd: number, base: number) => Math.min(amount, Math.max(0, base - ytd))

export function calculatePayroll({ employee: e, payFrequency, time = {}, ytd = {}, sutaRate = cfg.sutaRate }: PayrollInput): PayrollResult {
  const regular = pos(time.regular)
  const overtime = pos(time.overtime)
  const cashTips = roundCents(pos(time.cashTips))
  const cardTips = roundCents(pos(time.cardTips))
  const tips = cashTips + cardTips
  const ytdGross = pos(ytd.gross)

  // ── 지급 항목
  let regularPay = 0
  let overtimePay = 0
  let tipMakeUp = 0
  let qualifiedOvertimePremium = 0
  const hours = e.payType === 'salary' ? 0 : regular + overtime

  if (e.payType === 'salary') {
    regularPay = e.rate / periodsPerYear[payFrequency]
  } else {
    const credit = e.payType === 'tipped' ? tipCreditRate(e.rate) : 0
    const regularRate = e.rate + credit
    regularPay = e.rate * regular
    overtimePay = (regularRate * cfg.overtimeMultiplier - credit) * overtime
    qualifiedOvertimePremium = (regularRate * (cfg.overtimeMultiplier - 1)) * overtime
    if (e.payType === 'tipped') {
      const required = cfg.minimumWage * regular + cfg.minimumWage * cfg.overtimeMultiplier * overtime
      tipMakeUp = Math.max(0, required - (regularPay + overtimePay + tips))
    }
  }
  regularPay = roundCents(regularPay)
  overtimePay = roundCents(overtimePay)
  tipMakeUp = roundCents(tipMakeUp)

  const grossPay = roundCents(regularPay + overtimePay + tipMakeUp + tips)
  const paycheckWages = grossPay - cashTips

  // ── Fringe Benefit (현금 지급 아님 — 과세 임금에만 더함)
  const fringe = splitFringes(time.fringes, ytd.fringe)
  const fringeTotal = roundCents(fringe.lines.reduce((a, l) => a + l.amount, 0))
  const ficaWages = roundCents(grossPay + fringe.lines.reduce((a, l) => a + l.fica, 0))
  const futaWages = roundCents(grossPay + fringe.lines.reduce((a, l) => a + l.futa, 0))

  // ── 직원 공제
  const pretaxDeductions = roundCents(paycheckWages * e.pretaxDeferralRate)
  const federalTaxableWages = roundCents(grossPay - pretaxDeductions + fringe.fitWithhold)
  const box1Wages = roundCents(federalTaxableWages + fringe.fitWagesOnly)
  const fitDue = federalIncomeTaxWithholding(federalTaxableWages, payFrequency, e.w4)

  const ssDue = roundCents(underBase(ficaWages, ytdGross, cfg.socialSecurityWageBase) * cfg.socialSecurityRate)
  const addlMedicareWages =
    Math.max(0, ytdGross + ficaWages - cfg.additionalMedicareThreshold) - Math.max(0, ytdGross - cfg.additionalMedicareThreshold)
  const medicareDue = roundCents(ficaWages * cfg.medicareRate + addlMedicareWages * cfg.additionalMedicareRate)

  // 현금 팁은 이미 직원 손에 있으므로, 급여에서 뗄 수 있는 돈이 부족할 수 있음.
  // FICA를 먼저 원천징수하고, 남는 금액에서 연방 소득세를 원천징수.
  const available = Math.max(0, paycheckWages - pretaxDeductions)
  const ficaDue = ssDue + medicareDue
  const ficaWithheld = roundCents(Math.min(ficaDue, available))
  const socialSecurity = ficaDue > 0 ? roundCents((ssDue * ficaWithheld) / ficaDue) : 0
  const medicare = roundCents(ficaWithheld - socialSecurity)
  const uncollectedFica = roundCents(ficaDue - ficaWithheld)
  const federalWithholding = roundCents(Math.min(fitDue, available - ficaWithheld))

  const totalDeductions = roundCents(pretaxDeductions + federalWithholding + socialSecurity + medicare)
  const netPay = roundCents(paycheckWages - totalDeductions)

  // ── 고용주 부담 (텍사스: 주 소득세 없음, TWC 실업세만)
  const employerSocialSecurity = ssDue
  const employerMedicare = roundCents(ficaWages * cfg.medicareRate)
  const futa = roundCents(underBase(futaWages, pos(ytd.futaWages), cfg.futaWageBase) * cfg.futaRate)
  const suta = roundCents(underBase(futaWages, pos(ytd.sutaWages), cfg.sutaWageBase) * sutaRate)
  const employerTaxes = roundCents(employerSocialSecurity + employerMedicare + futa + suta)
  const employerCost = roundCents(regularPay + overtimePay + tipMakeUp + employerTaxes)

  // Section 45B: 시간당 $5.15를 채우는 데 쓰인 팁을 제외한 팁에 대한 고용주 FICA
  const usedForMinimum = Math.max(0, cfg.section45BWage * hours - (regularPay + overtimePay + tipMakeUp))
  const creditableTips = Math.max(0, tips - usedForMinimum)
  const tipCredit45B = roundCents(creditableTips * (cfg.socialSecurityRate + cfg.medicareRate))

  return {
    employeeId: e.id,
    hours,
    regularPay,
    overtimePay,
    tipMakeUp,
    cashTips,
    cardTips,
    grossPay,
    pretaxDeductions,
    federalTaxableWages,
    federalWithholding,
    socialSecurity,
    medicare,
    uncollectedFica,
    totalDeductions,
    netPay,
    employerSocialSecurity,
    employerMedicare,
    futa,
    suta,
    employerTaxes,
    employerCost,
    tipCredit45B,
    qualifiedOvertimePremium: roundCents(qualifiedOvertimePremium),
    fringeTotal,
    ficaWages,
    futaWages,
    box1Wages,
    fringeLines: fringe.lines,
  }
}

export interface PayrollTotals {
  gross: number
  /** 임금 (팁 제외) */
  wages: number
  net: number
  cashTips: number
  cardTips: number
  pretax: number
  federal: number
  socialSecurity: number
  medicare: number
  uncollectedFica: number
  employerFica: number
  futa: number
  suta: number
  employerTaxes: number
  employerCost: number
  tipCredit45B: number
  fringe: number
  /** IRS 예치: 연방 원천징수 + 직원·회사 FICA */
  federalDeposit: number
}

export function sumResults(results: PayrollResult[]): PayrollTotals {
  const s = (f: (r: PayrollResult) => number) => roundCents(results.reduce((a, r) => a + f(r), 0))
  const federal = s((r) => r.federalWithholding)
  const socialSecurity = s((r) => r.socialSecurity)
  const medicare = s((r) => r.medicare)
  const employerFica = s((r) => r.employerSocialSecurity + r.employerMedicare)
  return {
    gross: s((r) => r.grossPay),
    wages: s((r) => r.regularPay + r.overtimePay + r.tipMakeUp),
    net: s((r) => r.netPay),
    cashTips: s((r) => r.cashTips),
    cardTips: s((r) => r.cardTips),
    pretax: s((r) => r.pretaxDeductions),
    federal,
    socialSecurity,
    medicare,
    uncollectedFica: s((r) => r.uncollectedFica),
    employerFica,
    futa: s((r) => r.futa),
    suta: s((r) => r.suta),
    employerTaxes: s((r) => r.employerTaxes),
    employerCost: s((r) => r.employerCost),
    tipCredit45B: s((r) => r.tipCredit45B),
    fringe: s((r) => r.fringeTotal ?? 0),
    federalDeposit: roundCents(federal + socialSecurity + medicare + employerFica),
  }
}
