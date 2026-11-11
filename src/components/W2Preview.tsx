import { formatCurrency } from '../lib/format'
import type { W2 } from '../lib/taxes'
import { usePrefs } from '../prefs'
import type { Company, Employee } from '../types'

/** W-2 미리보기 — 실제 서식처럼 칸 번호와 금액을 보여 줌 */
export default function W2Preview({ w2, employee, company, year }: { w2: W2; employee: Employee; company: Company; year: number }) {
  const { t } = usePrefs()
  const cell = (no: string, label: string, value: string, wide = false) => (
    <div className={`w2-cell${wide ? ' wide' : ''}`}>
      <span className="w2-no">{no}</span>
      <span className="w2-label">{label}</span>
      <strong className="w2-val">{value}</strong>
    </div>
  )
  return (
    <div className="w2">
      <div className="w2-top">
        <div>
          <span className="w2-title">Form W-2</span>
          <span className="muted small">{t(`${year} 임금·세금 명세 (미리보기)`, `${year} Wage and Tax Statement (preview)`)}</span>
        </div>
        <span className="tag info">{t('처리 완료 회차 기준', 'From processed payrolls')}</span>
      </div>
      <div className="w2-grid">
        {cell('a', t('직원 SSN', 'Employee SSN'), `***-**-${employee.ssnLast4}`)}
        {cell('b', 'EIN', company.ein)}
        {cell('c', t('고용주', 'Employer'), `${company.legalName}`, true)}
        {cell('e', t('직원 이름·이니셜 | 성', 'First name & initial | Last name'), `${[employee.firstName, employee.middleInitial].filter(Boolean).join(' ')} | ${employee.lastName}`, true)}
        {cell('1', t('임금·팁·기타 보수', 'Wages, tips, other comp.'), formatCurrency(w2.box1))}
        {cell('2', t('연방 소득세 원천징수', 'Federal income tax withheld'), formatCurrency(w2.box2))}
        {cell('3', t('Social Security 임금', 'Social security wages'), formatCurrency(w2.box3))}
        {cell('4', t('Social Security 원천징수', 'Social security tax withheld'), formatCurrency(w2.box4))}
        {cell('5', t('Medicare 임금·팁', 'Medicare wages and tips'), formatCurrency(w2.box5))}
        {cell('6', t('Medicare 원천징수', 'Medicare tax withheld'), formatCurrency(w2.box6))}
        {cell('7', t('Social Security 팁', 'Social security tips'), formatCurrency(w2.box7))}
        {cell('10', t('부양가족 돌봄 지원', 'Dependent care benefits'), formatCurrency(w2.box10))}
        <div className="w2-cell wide">
          <span className="w2-no">12</span>
          <span className="w2-label">{t('코드별 금액', 'Coded amounts')}</span>
          <div className="w2-codes">
            {w2.box12.length ? w2.box12.map((c) => <span key={c.code}><b>{c.code}</b> {formatCurrency(c.amount)}</span>) : <span className="muted">—</span>}
          </div>
        </div>
        <div className="w2-cell wide">
          <span className="w2-no">14</span>
          <span className="w2-label">{t('기타', 'Other')}</span>
          <div className="w2-codes">
            {w2.box14.length ? w2.box14.map((c) => <span key={c.label}><b>{c.label}</b> {formatCurrency(c.amount)}</span>) : <span className="muted">—</span>}
          </div>
        </div>
        {cell('15–20', t('주 정보', 'State'), t('텍사스 — 주 소득세 없음', 'Texas — no state income tax'), true)}
      </div>
      <p className="muted small">
        {t(
          `2026년 신규 보고: 적격 팁 ${formatCurrency(w2.qualifiedTips)} · 적격 초과근무 프리미엄 ${formatCurrency(w2.qualifiedOvertime)} (IRS 최종 서식의 칸·코드에 맞춰 기재) · 급여 ${w2.paychecks}회`,
          `New for 2026: qualified tips ${formatCurrency(w2.qualifiedTips)} · qualified overtime premium ${formatCurrency(w2.qualifiedOvertime)} (reported per the final IRS form) · ${w2.paychecks} paychecks`,
        )}
      </p>
    </div>
  )
}
