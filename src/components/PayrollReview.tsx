import { ChevronDown, HandCoins, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import { Fragment, useState } from 'react'
import { companySchedule, periodsPerYear } from '../config/payrollConfig'
import type { Check } from '../lib/checks'
import { formatCurrency, formatCurrencyWhole, initials } from '../lib/format'
import { jobLabel } from '../lib/labels'
import { effectiveEmployee, sumResults } from '../lib/payroll'
import { usePrefs } from '../prefs'
import type { RunView } from '../store'
import type { Employee, TimeEntry } from '../types'
import CheckList from './CheckList'
import PayStub from './PayStub'
import { compareByName, fullName } from '../lib/names'

const PERIODS = periodsPerYear[companySchedule.frequency]

/** 이번 회차에 적용된 시급·연봉을 크게 표시. 아래 줄에 실제 근무시간 */
export function RateCell({ e, entry }: { e: Employee; entry?: TimeEntry }) {
  const { t } = usePrefs()
  const eff = effectiveEmployee(e, entry, companySchedule.frequency)
  const salary = e.payType === 'salary'
  const changed = entry?.rate !== undefined
  const sub = salary
    ? t(`회당 ${formatCurrency(eff.rate / PERIODS)}`, `${formatCurrency(eff.rate / PERIODS)} per check`)
    : `${(entry?.regular ?? 0) + (entry?.overtime ?? 0)}h${entry?.overtime ? ` · OT ${entry.overtime}h` : ''}${e.payType === 'tipped' ? t(' · + 팁', ' · + tips') : ''}`
  return (
    <td className="num rate-cell" data-label={t('급여 기준', 'Pay rate')}>
      <span className="rate-main">
        {salary ? formatCurrencyWhole(eff.rate) : formatCurrency(eff.rate)}
        <small>{salary ? t('/년', '/yr') : '/h'}</small>
      </span>
      <span className="rate-sub">
        {sub}
        {changed && <span className="tag info">{t('이번 회차 변경', 'Changed this run')}</span>}
      </span>
    </td>
  )
}

/** 총 출금액, 경고, 직원별 상세 — 고객 제출 화면과 회계법인 검토 화면에서 공통 사용 */
export default function PayrollReview({ view, checks }: { view: RunView; checks: Check[] }) {
  const { t } = usePrefs()
  const [open, setOpen] = useState<string | null>(null)
  const [alertsPref, setAlertsPref] = useState<boolean | null>(null)

  const totals = sumResults(view.results)
  const cashOut = totals.net + totals.federalDeposit + totals.pretax + totals.futa + totals.suta
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const issueCount = checks.filter((c) => c.severity !== 'info').length
  const showAlerts = alertsPref ?? (blocking > 0 || typeof matchMedia === 'undefined' || matchMedia('(min-width: 761px)').matches)
  const people = view.employees.filter((e) => view.results.some((r) => r.employeeId === e.id)).sort(compareByName)
  const anyTips = totals.cashTips + totals.cardTips > 0
  const dedLabel = anyTips ? t('공제·현금 팁', 'Deductions & cash tips') : t('세전 공제', 'Pre-tax deductions')

  return (
    <>
      {checks.length > 0 && (
        <section className={`card alert-card ${blocking ? 'crit' : issueCount ? 'warn' : 'info'}`}>
          <button className="alert-head" onClick={() => setAlertsPref(!showAlerts)} aria-expanded={showAlerts}>
            {blocking ? <OctagonAlert size={18} aria-hidden /> : issueCount ? <TriangleAlert size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <strong>
              {blocking
                ? t(`제출 전에 해결해야 할 문제 ${blocking}건`, `${blocking} issue(s) must be fixed before submitting`)
                : t(`확인해 볼 항목 ${checks.length}건`, `${checks.length} item(s) to look at`)}
            </strong>
            <ChevronDown size={18} className={`chev${showAlerts ? ' up' : ''}`} aria-hidden />
          </button>
          {showAlerts && <CheckList checks={checks} />}
        </section>
      )}

      <section className="card total-card">
        <div className="total-main">
          <span className="eyebrow">{t('회사 총 출금액', 'Total cash out')}</span>
          <div className="total-big">{formatCurrency(cashOut)}</div>
          <p className="muted small">{t(`${people.length}명`, `${people.length} people`)}</p>
        </div>
        <dl className="total-break">
          <div><dt><span className="sw s1" />{t('직원 급여 입금', 'Employee paychecks')}</dt><dd>{formatCurrency(totals.net)}</dd></div>
          <div><dt><span className="sw s3" />{t('IRS (연방세 + FICA 양쪽)', 'IRS (federal + both FICA halves)')}</dt><dd>{formatCurrency(totals.federalDeposit)}</dd></div>
          <div><dt><span className="sw s4" />{t('TWC + FUTA (회사 부담)', 'TWC + FUTA (employer)')}</dt><dd>{formatCurrency(totals.suta + totals.futa)}</dd></div>
          <div><dt><span className="sw s2" />{t('401(k) 적립', '401(k)')}</dt><dd>{formatCurrency(totals.pretax)}</dd></div>
        </dl>
      </section>

      <section className="stat-strip">
        <div><span>{anyTips ? t('총급여 (팁 포함)', 'Gross pay') : t('총급여', 'Gross pay')}</span><strong>{formatCurrency(totals.gross)}</strong></div>
        <div><span>{t('직원 세금·공제', 'Employee taxes & deductions')}</span><strong>{formatCurrency(totals.federal + totals.socialSecurity + totals.medicare + totals.pretax)}</strong></div>
        <div><span>{t('회사 세금', 'Employer taxes')}</span><strong>{formatCurrency(totals.employerTaxes)}</strong></div>
        {anyTips
          ? <div><span>{t('현금 팁 (이미 지급됨)', 'Cash tips (already paid)')}</span><strong>{formatCurrency(totals.cashTips)}</strong></div>
          : <div><span>Fringe Benefit</span><strong>{formatCurrency(totals.fringe)}</strong></div>}
      </section>

      <section className="card table-card">
        <div className="table-toolbar">
          <h2>{t('직원별 상세', 'Employee details')}</h2>
          <span className="muted small">{t('행을 누르면 급여명세서를 볼 수 있어요', 'Click a row to see the pay stub')}</span>
        </div>
        <div className="table-scroll">
          <table className="run-table review">
            <thead>
              <tr>
                <th>{t('직원', 'Employee')}</th>
                <th className="num">{t('급여 기준', 'Pay rate')}</th>
                <th className="num">{t('총급여', 'Gross')}</th>
                <th className="num">{t('직원 세금', 'Employee taxes')}</th>
                <th className="num">{dedLabel}</th>
                <th className="num">{t('입금액', 'Net pay')}</th>
                <th className="num">{t('회사 세금', 'Employer taxes')}</th>
                <th aria-label={t('상세', 'Details')} />
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                const r = view.results.find((x) => x.employeeId === e.id)!
                const isOpen = open === e.id
                return (
                  <Fragment key={e.id}>
                    <tr className={`clickable${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : e.id)}>
                      <td data-label={t('직원', 'Employee')}>
                        <div className="emp-cell">
                          <span className="avatar sm">{initials(fullName(e))}</span>
                          <div>
                            <strong>{fullName(e)}</strong>
                            <span className="muted small">{jobLabel(e, t)}</span>
                          </div>
                        </div>
                      </td>
                      <RateCell e={e} entry={view.time[e.id]} />
                      <td className="num" data-label={t('총급여', 'Gross')}>{formatCurrency(r.grossPay)}</td>
                      <td className="num" data-label={t('직원 세금', 'Employee taxes')}>{formatCurrency(r.federalWithholding + r.socialSecurity + r.medicare)}</td>
                      <td className="num" data-label={dedLabel}>{formatCurrency(r.pretaxDeductions + r.cashTips)}</td>
                      <td className="num" data-label={t('입금액', 'Net pay')}><strong>{formatCurrency(r.netPay)}</strong></td>
                      <td className="num muted" data-label={t('회사 세금', 'Employer taxes')}>{formatCurrency(r.employerTaxes)}</td>
                      <td className="expand-cell"><ChevronDown size={18} className="chev" aria-hidden /></td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <PayStub employee={effectiveEmployee(e, view.time[e.id], companySchedule.frequency)} result={r} time={view.time[e.id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('합계', 'Total')}</td>
                <td />
                <td className="num">{formatCurrency(totals.gross)}</td>
                <td className="num">{formatCurrency(totals.federal + totals.socialSecurity + totals.medicare)}</td>
                <td className="num">{formatCurrency(totals.pretax + totals.cashTips)}</td>
                <td className="num"><strong>{formatCurrency(totals.net)}</strong></td>
                <td className="num">{formatCurrency(totals.employerTaxes)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {totals.tipCredit45B > 0 && (
        <div className="insight">
          <HandCoins size={20} aria-hidden />
          <p>
            {t(
              `이번 회차 팁에 낸 회사 FICA 중 약 ${formatCurrency(totals.tipCredit45B)}는 45B 팁 크레딧(Form 8846)으로 돌려받을 수 있어요.`,
              `About ${formatCurrency(totals.tipCredit45B)} of employer FICA on this run's tips can come back as the 45B tip credit (Form 8846).`,
            )}
          </p>
        </div>
      )}
    </>
  )
}
