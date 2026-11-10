import { CheckCircle2, FileText, Landmark, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import W2Preview from '../components/W2Preview'
import { formatCurrency, formatDate, initials } from '../lib/format'
import { roleLabel } from '../lib/labels'
import { roundCents } from '../lib/money'
import { form941, futaSchedule, quarterOf, twcQuarter, w2For, type Quarter } from '../lib/taxes'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { TaxKind } from '../types'

const kindLabel = (k: TaxKind, t: (ko: string, en: string) => string) =>
  ({ federal: t('IRS 연방 원천징수 + FICA', 'IRS federal withholding + FICA'), futa: t('IRS FUTA (연방 실업세)', 'IRS FUTA'), twc: t('텍사스 TWC 실업세', 'Texas TWC unemployment') })[k]

/** 세금 센터: 납부 일정·상태, 분기 941·C-3 대조, FUTA $500 추적, W-2 미리보기 */
export default function Taxes() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const { company, runs, deposits, employees, markDepositPaid, recordQuarterDeposit } = useStore()
  const isFirm = session?.role === 'firm'
  const me = session?.name ?? ''
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const year = Number(today.slice(0, 4))
  const [q, setQ] = useState<Quarter>(quarterOf(today))
  const [tab, setTab] = useState<'deposits' | 'quarter' | 'w2'>('deposits')
  const [w2Emp, setW2Emp] = useState<string | null>(null)
  const auth = company.authorizations ?? { form8655: 'pending', twcAgent: 'pending', bankDebit: 'pending' }
  const authReady = auth.form8655 === 'signed' && auth.twcAgent === 'signed' && auth.bankDebit === 'signed'
  const d = (iso: string) => formatDate(new Date(`${iso}T00:00`), locale, { month: 'short', day: 'numeric', year: 'numeric' })

  const futa = useMemo(() => futaSchedule(runs, year), [runs, year])

  // 다가오는 납부: 예정된 연방 예치 + 이번·지난 분기 FUTA/TWC 중 미납분
  const upcoming = useMemo(() => {
    const list = deposits.filter((x) => x.status === 'scheduled').map((x) => ({ ...x, computed: false }))
    for (const qq of [1, 2, 3, 4] as Quarter[]) {
      const tw = twcQuarter(runs, year, qq, company.sutaRate)
      const twId = `twc-${year} Q${qq}`
      if (tw.tax > 0 && !deposits.some((x) => x.id === twId)) list.push({ id: twId, kind: 'twc', period: `${year} Q${qq}`, amount: tw.tax, dueDate: tw.due, status: 'scheduled', computed: true })
      const fu = futa.find((x) => x.q === qq)!
      const fuId = `futa-${year} Q${qq}`
      if (fu.mustDeposit && fu.accumulated > 0 && !deposits.some((x) => x.id === fuId)) list.push({ id: fuId, kind: 'futa', period: `${year} Q${qq}`, amount: fu.accumulated, dueDate: fu.due, status: 'scheduled', computed: true })
    }
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [deposits, runs, year, company.sutaRate, futa])

  const paid = [...deposits].filter((x) => x.status === 'paid').sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const f941 = form941(runs, deposits, year, q)
  const c3 = twcQuarter(runs, year, q, company.sutaRate)
  const w2People = employees.filter((e) => runs.some((r) => r.payDate.startsWith(String(year)) && r.results.some((x) => x.employeeId === e.id)))
  const selected = w2People.find((e) => e.id === w2Emp) ?? w2People[0]

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{company.dba} · EIN {company.ein}</p>
        <h1>{t('세금·신고', 'Taxes & filings')}</h1>
        <p className="lead">{t('회계법인이 고객님 EIN으로 대리 신고하고, 세금은 등록된 계좌에서 인출해 기한 내 납부합니다.', 'Your CPA files under your EIN as reporting agent and pays taxes from your account on time.')}</p>
      </header>

      <section className={`card filing-card${authReady ? '' : ' warn'}`}>
        <div className="filing-main">
          <ShieldCheck size={22} aria-hidden />
          <div>
            <strong>{t('신고·납부 방식: 회계법인 대리 신고 (Reporting Agent)', 'Filing method: CPA as reporting agent')}</strong>
            <p className="muted small">{t('941·940은 IRS Form 8655 위임으로, 텍사스 C-3는 TWC 대리인 권한으로 고객 EIN·계정에 신고합니다. 납부는 고객 계좌에서 인출됩니다.', 'Forms 941/940 under IRS Form 8655; Texas C-3 under TWC agent access — all on your EIN and account, paid from your bank.')}</p>
          </div>
        </div>
        <div className="auth-chips">
          {([['form8655', 'IRS Form 8655'], ['twcAgent', t('TWC 대리인', 'TWC agent')], ['bankDebit', t('계좌 인출 동의', 'Bank debit')]] as const).map(([k, label]) => (
            <span key={k} className={`pill-dot ${auth[k] === 'signed' ? 'good' : 'warn'}`}>{label} · {auth[k] === 'signed' ? t('서명 완료', 'Signed') : t('서명 필요', 'Needed')}</span>
          ))}
        </div>
      </section>

      <div className="segmented tabs-row">
        <button className={tab === 'deposits' ? 'on' : ''} onClick={() => setTab('deposits')}>{t('납부 일정', 'Payments')}</button>
        <button className={tab === 'quarter' ? 'on' : ''} onClick={() => setTab('quarter')}>{t('분기 신고 (941·C-3·FUTA)', 'Quarterly (941·C-3·FUTA)')}</button>
        <button className={tab === 'w2' ? 'on' : ''} onClick={() => setTab('w2')}>{t('W-2', 'W-2')}</button>
      </div>

      {tab === 'deposits' && (
        <>
          <section className="card table-card">
            <div className="table-toolbar"><h2>{t('다가오는 납부', 'Upcoming payments')}</h2><span className="muted small">{t(`IRS 예치 주기: ${company.depositSchedule === 'monthly' ? '월별 (다음 달 15일)' : '반주별'}`, `IRS deposit schedule: ${company.depositSchedule}`)}</span></div>
            <div className="table-scroll">
              <table className="run-table">
                <thead><tr><th>{t('세금', 'Tax')}</th><th>{t('대상', 'For')}</th><th>{t('기한', 'Due')}</th><th className="num">{t('금액', 'Amount')}</th><th>{t('상태', 'Status')}</th>{isFirm && <th />}</tr></thead>
                <tbody>
                  {upcoming.length === 0 && <tr><td colSpan={6} className="muted">{t('예정된 납부가 없습니다.', 'Nothing scheduled.')}</td></tr>}
                  {upcoming.map((x) => {
                    const overdue = x.dueDate < today
                    return (
                      <tr key={x.id}>
                        <td data-label={t('세금', 'Tax')}><span className="method"><Landmark size={15} aria-hidden /> {kindLabel(x.kind, t)}</span></td>
                        <td data-label={t('대상', 'For')}>{x.kind === 'federal' ? t(`${d(x.period)} 급여`, `${d(x.period)} payroll`) : x.period}</td>
                        <td data-label={t('기한', 'Due')}><strong className={overdue ? 'warn-text' : ''}>{d(x.dueDate)}</strong></td>
                        <td className="num" data-label={t('금액', 'Amount')}><strong>{formatCurrency(x.amount)}</strong></td>
                        <td data-label={t('상태', 'Status')}><span className={`pill-dot ${overdue ? 'crit' : 'warn'}`}>{overdue ? t('기한 지남', 'Overdue') : t('인출·납부 예정', 'Scheduled')}</span></td>
                        {isFirm && (
                          <td className="num">
                            <button className="btn sm" onClick={() => (x.computed ? recordQuarterDeposit(x.kind as 'futa' | 'twc', x.period, x.amount, x.dueDate, me) : markDepositPaid(x.id, me))}>
                              {t('납부 완료 처리', 'Mark paid')}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!isFirm && <p className="table-hint muted small">{t('기한 전에 등록된 계좌에서 자동 인출됩니다. 계좌 잔액을 확인해 주세요.', 'These are debited from your registered account before the due date. Please keep funds available.')}</p>}
          </section>

          <section className="card table-card">
            <div className="table-toolbar"><h2>{t('납부 완료 내역', 'Paid')}</h2><span className="muted small">{t(`올해 ${paid.length}건 · ${formatCurrency(roundCents(paid.reduce((a, x) => a + x.amount, 0)))}`, `${paid.length} this year · ${formatCurrency(roundCents(paid.reduce((a, x) => a + x.amount, 0)))}`)}</span></div>
            <div className="table-scroll paid-list">
              <table className="run-table">
                <thead><tr><th>{t('세금', 'Tax')}</th><th>{t('대상', 'For')}</th><th>{t('납부일', 'Paid on')}</th><th className="num">{t('금액', 'Amount')}</th></tr></thead>
                <tbody>
                  {paid.map((x) => (
                    <tr key={x.id}>
                      <td data-label={t('세금', 'Tax')}><span className="method"><CheckCircle2 size={15} className="good-text" aria-hidden /> {kindLabel(x.kind, t)}</span></td>
                      <td data-label={t('대상', 'For')}>{x.kind === 'federal' ? t(`${d(x.period)} 급여`, `${d(x.period)} payroll`) : x.period}</td>
                      <td data-label={t('납부일', 'Paid on')}>{d(x.paidAt ?? x.dueDate)}</td>
                      <td className="num" data-label={t('금액', 'Amount')}>{formatCurrency(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'quarter' && (
        <>
          <div className="segmented">
            {([1, 2, 3, 4] as Quarter[]).map((x) => <button key={x} className={q === x ? 'on' : ''} onClick={() => setQ(x)}>{year} Q{x}</button>)}
          </div>
          <div className="grid-2">
            <section className="card form-941">
              <div className="card-head"><h2><FileText size={18} aria-hidden /> Form 941 · Q{q}</h2><span className="tag info">{t('기한', 'Due')} {d(f941.due)}</span></div>
              <dl>
                <div><dt>1</dt><dd>{t('급여 받은 직원 수', 'Employees paid')}</dd><b>{f941.employees}</b></div>
                <div><dt>2</dt><dd>{t('임금·팁·기타 보수', 'Wages, tips, other comp.')}</dd><b>{formatCurrency(f941.line2)}</b></div>
                <div><dt>3</dt><dd>{t('연방 소득세 원천징수', 'Federal income tax withheld')}</dd><b>{formatCurrency(f941.line3)}</b></div>
                <div><dt>5a</dt><dd>{t('SS 과세 임금 × 12.4%', 'Taxable SS wages × 12.4%')}</dd><b>{formatCurrency(f941.line5a)}</b></div>
                <div><dt>5b</dt><dd>{t('SS 과세 팁 × 12.4%', 'Taxable SS tips × 12.4%')}</dd><b>{formatCurrency(f941.line5b)}</b></div>
                <div><dt>5c</dt><dd>{t('Medicare 임금·팁 × 2.9%', 'Medicare wages & tips × 2.9%')}</dd><b>{formatCurrency(f941.line5c)}</b></div>
                <div><dt>7</dt><dd>{t('센트 단위 조정', 'Fractions of cents')}</dd><b>{formatCurrency(f941.line7)}</b></div>
                <div className="total"><dt>12</dt><dd>{t('분기 총 세금', 'Total taxes')}</dd><b>{formatCurrency(f941.line12)}</b></div>
                <div><dt>13</dt><dd>{t('분기 예치 완료액', 'Deposits made')}</dd><b>{formatCurrency(f941.paid)}</b></div>
                <div className={`total ${Math.abs(f941.balance) < 1 ? 'ok' : 'due'}`}><dt>14</dt><dd>{Math.abs(f941.balance) < 1 ? t('대조 완료 — 차액 없음', 'Reconciled — no balance') : t('남은 납부액 (예정 포함)', 'Balance (incl. scheduled)')}</dd><b>{formatCurrency(f941.balance)}</b></div>
              </dl>
            </section>
            <div className="stack">
              <section className="card form-941">
                <div className="card-head"><h2><FileText size={18} aria-hidden /> TWC C-3 · Q{q}</h2><span className="tag info">{t('기한', 'Due')} {d(c3.due)}</span></div>
                <dl>
                  <div><dt /><dd>{t('보고 직원 수', 'Employees reported')}</dd><b>{c3.employees}</b></div>
                  <div><dt /><dd>{t('총 임금', 'Total wages')}</dd><b>{formatCurrency(c3.totalWages)}</b></div>
                  <div><dt /><dd>{t('과세 임금 (직원별 첫 $9,000)', 'Taxable wages (first $9,000 each)')}</dd><b>{formatCurrency(c3.taxableWages)}</b></div>
                  <div className="total"><dt /><dd>{t(`실업세 (${(company.sutaRate * 100).toFixed(2)}%)`, `Tax (${(company.sutaRate * 100).toFixed(2)}%)`)}</dd><b>{formatCurrency(c3.tax)}</b></div>
                </dl>
              </section>
              <section className="card">
                <h2>{t('FUTA $500 추적', 'FUTA $500 tracker')}</h2>
                <table className="mini-table">
                  <thead><tr><th>{t('분기', 'Qtr')}</th><th className="num">{t('발생', 'Liability')}</th><th className="num">{t('누적', 'Accumulated')}</th><th>{t('조치', 'Action')}</th></tr></thead>
                  <tbody>
                    {futa.map((x) => (
                      <tr key={x.q} className={x.q === q ? 'hl' : ''}>
                        <td>Q{x.q}</td>
                        <td className="num">{formatCurrency(x.liability)}</td>
                        <td className="num">{formatCurrency(x.accumulated)}</td>
                        <td>{x.mustDeposit && x.accumulated > 0 ? <span className="pill-dot warn">{x.q === 4 ? t('940과 함께 납부', 'Pay with 940') : t(`${d(x.due)}까지 예치`, `Deposit by ${d(x.due)}`)}</span> : <span className="pill-dot">{t('$500 이하 — 이월', '≤ $500 — carry over')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted small">{t('분기 말 누적 미납 FUTA가 $500를 넘으면 다음 달 말일까지 예치하고, 넘지 않으면 다음 분기로 이월합니다.', 'If undeposited FUTA exceeds $500 at quarter end, deposit by the end of the next month; otherwise carry it over.')}</p>
              </section>
            </div>
          </div>
        </>
      )}

      {tab === 'w2' && (
        <div className="w2-layout">
          <section className="card list-card">
            <div className="table-toolbar"><h2>{t(`${year} W-2 대상 직원`, `${year} W-2 recipients`)}</h2></div>
            <ul className="w2-people">
              {w2People.map((e) => {
                const w = w2For(runs, e.id, year)
                return (
                  <li key={e.id}>
                    <button className={selected?.id === e.id ? 'on' : ''} onClick={() => setW2Emp(e.id)}>
                      <span className="avatar sm">{initials(e.name)}</span>
                      <span className="plist-name"><strong>{e.name}</strong><small>{roleLabel(e.role, t)} · {e.eConsent ? t('전자 수령', 'Electronic') : t('종이 발송', 'Paper')}</small></span>
                      <span className="num"><strong>{formatCurrency(w.box1)}</strong><small className="muted"> Box 1</small></span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="table-hint muted small">{t(`${year + 1}년 1월 31일까지 발행 · 전자 수령에 동의한 직원은 직원 포털에서, 나머지는 종이로 받습니다.`, `Issued by Jan 31, ${year + 1} · e-consented staff get it in the employee portal; others by paper.`)}</p>
          </section>
          {selected && <W2Preview w2={w2For(runs, selected.id, year)} employee={selected} company={company} year={year} />}
        </div>
      )}

      {!authReady && (
        <p className="muted small warn-line"><TriangleAlert size={14} aria-hidden /> {t('위임 서명이 끝나지 않으면 회계법인이 대리 신고·납부를 할 수 없어요. 회사 정보에서 서명해 주세요.', 'Your CPA can’t file or pay until all authorizations are signed. Sign them under Company.')}</p>
      )}
    </div>
  )
}
