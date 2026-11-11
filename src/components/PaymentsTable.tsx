import { Banknote, Landmark, Mail, MailX, Printer } from 'lucide-react'
import { formatCurrency, formatDate, initials } from '../lib/format'
import { usePrefs } from '../prefs'
import type { Employee, PaymentRecord, PayMethod } from '../types'
import { fullName } from '../lib/names'

export const payMethodLabel = (m: PayMethod, t: (ko: string, en: string) => string) =>
  ({ client_check: t('고객 수표', 'Client check'), firm_check: t('회계법인 인쇄 수표', 'CPA-printed check'), direct_deposit: t('직접입금', 'Direct deposit') })[m]

/** 처리 완료 후 직원별 지급 현황: 지급 방식, 상태, 급여명세서 이메일 */
export default function PaymentsTable({ payments, employees, payDate }: { payments: PaymentRecord[]; employees: Employee[]; payDate: string }) {
  const { t, locale } = usePrefs()
  const pay = formatDate(new Date(`${payDate}T00:00`), locale, { month: 'short', day: 'numeric' })
  const count = (m: PayMethod) => payments.filter((p) => p.method === m).length
  const icon = { client_check: <Banknote size={16} aria-hidden />, firm_check: <Printer size={16} aria-hidden />, direct_deposit: <Landmark size={16} aria-hidden /> }
  const status = (p: PaymentRecord) =>
    p.status === 'deposit_scheduled'
      ? t(`${pay} 입금 예정`, `Deposits ${pay}`)
      : p.status === 'check_printed'
        ? t('수표 인쇄 완료 — 수령 준비됨', 'Check printed — ready for pickup')
        : t('대표님이 수표 발행', 'You write the check')

  return (
    <section className="card table-card">
      <div className="table-toolbar">
        <h2>{t('직원 지급 현황', 'Employee payments')}</h2>
        <div className="pay-summary">
          <span>{icon.direct_deposit} {t('직접입금', 'Direct deposit')} {count('direct_deposit')}</span>
          <span>{icon.firm_check} {t('인쇄 수표', 'Printed checks')} {count('firm_check')}</span>
          <span>{icon.client_check} {t('고객 수표', 'Client checks')} {count('client_check')}</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="run-table">
          <thead>
            <tr>
              <th>{t('직원', 'Employee')}</th>
              <th>{t('지급 방식', 'Method')}</th>
              <th>{t('상태', 'Status')}</th>
              <th>{t('급여명세서 이메일', 'Stub email')}</th>
              <th className="num">{t('지급액', 'Net pay')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const e = employees.find((x) => x.id === p.employeeId)
              return (
                <tr key={p.employeeId}>
                  <td data-label={t('직원', 'Employee')}>
                    <div className="emp-cell"><span className="avatar sm">{initials(e ? fullName(e) : '?')}</span><div><strong>{e && fullName(e)}</strong><span className="muted small">{e?.email ?? t('이메일 없음', 'No email')}</span></div></div>
                  </td>
                  <td data-label={t('지급 방식', 'Method')}><span className="method">{icon[p.method]} {payMethodLabel(p.method, t)}</span></td>
                  <td data-label={t('상태', 'Status')}><span className={`pill-dot ${p.status === 'ready_for_client' ? 'warn' : 'good'}`}>{status(p)}</span></td>
                  <td data-label={t('급여명세서 이메일', 'Stub email')}>
                    {p.stubEmailed
                      ? <span className="method good-text"><Mail size={15} aria-hidden /> {t('발송됨', 'Sent')}</span>
                      : <span className="method muted"><MailX size={15} aria-hidden /> {t('전자 수령 동의 없음 — 포털·인쇄', 'No e-consent — portal/print')}</span>}
                  </td>
                  <td className="num" data-label={t('지급액', 'Net pay')}><strong>{formatCurrency(p.amount)}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
