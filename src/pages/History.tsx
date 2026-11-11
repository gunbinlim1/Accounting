import { ChevronDown, Download, FileText } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import PaymentsTable from '../components/PaymentsTable'
import PayStub from '../components/PayStub'
import { companySchedule } from '../config/payrollConfig'
import { downloadCsv } from '../lib/csv'
import { formatCurrency, formatCurrencyWhole, formatDate, initials } from '../lib/format'
import { jobLabel } from '../lib/labels'
import { effectiveEmployee, sumResults } from '../lib/payroll'
import { quarterOf } from '../lib/taxes'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import { fullName } from '../lib/names'

/** 급여 내역: 회차별·직원별·연간 누계를 한눈에 */
export default function History() {
  const { t, locale } = usePrefs()
  const { company, runs, employees } = useStore()
  const years = [...new Set(runs.map((r) => r.payDate.slice(0, 4)))].sort().reverse()
  const [year, setYear] = useState(() => years[0] ?? String(new Date().getFullYear()))
  const [view, setView] = useState<'runs' | 'people'>('runs')
  const [open, setOpen] = useState<string | null>(null)
  const [stub, setStub] = useState<{ run: string; emp: string } | null>(null)

  const yearRuns = useMemo(() => runs.filter((r) => r.payDate.startsWith(year)).sort((a, b) => b.payDate.localeCompare(a.payDate)), [runs, year])
  const all = sumResults(yearRuns.flatMap((r) => r.results))
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? fullName(e) : id
  }
  const d = (iso: string, o?: Intl.DateTimeFormatOptions) => formatDate(new Date(`${iso}T00:00`), locale, o ?? { month: 'short', day: 'numeric' })

  // 분기별 묶음 (최근 분기 먼저)
  const quarters = [4, 3, 2, 1].map((q) => ({ q, runs: yearRuns.filter((r) => quarterOf(r.payDate) === q) })).filter((x) => x.runs.length)

  const people = useMemo(() => {
    const m = new Map<string, { gross: number; net: number; fit: number; fica: number; fringe: number; tips: number; checks: number }>()
    for (const r of yearRuns) for (const x of r.results) {
      const a = m.get(x.employeeId) ?? { gross: 0, net: 0, fit: 0, fica: 0, fringe: 0, tips: 0, checks: 0 }
      a.gross += x.grossPay; a.net += x.netPay; a.fit += x.federalWithholding; a.fica += x.socialSecurity + x.medicare
      a.fringe += x.fringeTotal ?? 0; a.tips += x.cashTips + x.cardTips; a.checks++
      m.set(x.employeeId, a)
    }
    return [...m.entries()].sort((a, b) => b[1].gross - a[1].gross)
  }, [yearRuns])

  const exportCsv = () => {
    const rows = [['Pay date', 'Employee', 'Gross', 'Federal W/H', 'Social Security', 'Medicare', '401(k)', 'Fringe', 'Net pay', 'Employer taxes']]
    for (const r of yearRuns) for (const x of r.results) rows.push([r.payDate, empName(x.employeeId), x.grossPay, x.federalWithholding, x.socialSecurity, x.medicare, x.pretaxDeductions, x.fringeTotal ?? 0, x.netPay, x.employerTaxes].map(String))
    downloadCsv(`${company.dba.replace(/\W+/g, '-')}-payroll-${year}.csv`, rows.map((r) => r.join(',')).join('\n'))
  }

  return (
    <div className="page">
      <header className="page-head row between wrap">
        <div>
          <p className="eyebrow">{company.dba}</p>
          <h1>{t('급여 내역', 'Payroll history')}</h1>
        </div>
        <div className="row gap">
          {years.length > 1 && (
            <select className="year-select" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          )}
          <button className="btn" onClick={exportCsv}><Download size={16} aria-hidden /> CSV</button>
        </div>
      </header>

      <section className="stat-strip five">
        <div><span>{t(`${year}년 급여 횟수`, `Payrolls in ${year}`)}</span><strong>{yearRuns.length}{t('회', '')}</strong></div>
        <div><span>{t('총급여 (팁 포함)', 'Gross pay')}</span><strong>{formatCurrencyWhole(all.gross)}</strong></div>
        <div><span>{t('직원 입금 합계', 'Paid to employees')}</span><strong>{formatCurrencyWhole(all.net)}</strong></div>
        <div><span>{t('납부한 세금 (직원+회사)', 'Taxes (employee + employer)')}</span><strong>{formatCurrencyWhole(all.federalDeposit + all.futa + all.suta)}</strong></div>
        <div><span>Fringe Benefit</span><strong>{formatCurrencyWhole(all.fringe)}</strong></div>
      </section>

      <div className="segmented tabs-row">
        <button className={view === 'runs' ? 'on' : ''} onClick={() => setView('runs')}>{t('회차별', 'By payroll')}</button>
        <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>{t('직원별 연간', 'By employee (YTD)')}</button>
      </div>

      {view === 'runs' && quarters.map(({ q, runs: qr }) => {
        const qs = sumResults(qr.flatMap((r) => r.results))
        return (
          <section key={q} className="card table-card">
            <div className="table-toolbar">
              <h2>{year} Q{q}</h2>
              <span className="muted small">{t(`${qr.length}회 · 총급여 ${formatCurrency(qs.gross)} · 입금 ${formatCurrency(qs.net)}`, `${qr.length} payrolls · gross ${formatCurrency(qs.gross)} · net ${formatCurrency(qs.net)}`)}</span>
            </div>
            <div className="table-scroll">
              <table className="run-table">
                <thead>
                  <tr>
                    <th>{t('지급일', 'Pay date')}</th>
                    <th className="num">{t('인원', 'People')}</th>
                    <th className="num">{t('총급여', 'Gross')}</th>
                    <th className="num">{t('직원 입금', 'Net pay')}</th>
                    <th className="num">{t('세금 합계', 'Taxes')}</th>
                    <th className="num">{t('회사 총 비용', 'Employer cost')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {qr.map((r) => {
                    const s = sumResults(r.results)
                    const isOpen = open === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr className={`clickable${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : r.id)}>
                          <td data-label={t('지급일', 'Pay date')}><strong>{d(r.payDate, { month: 'long', day: 'numeric', weekday: 'short' })}</strong></td>
                          <td className="num" data-label={t('인원', 'People')}>{r.results.length}</td>
                          <td className="num" data-label={t('총급여', 'Gross')}>{formatCurrency(s.gross)}</td>
                          <td className="num" data-label={t('직원 입금', 'Net pay')}><strong>{formatCurrency(s.net)}</strong></td>
                          <td className="num" data-label={t('세금 합계', 'Taxes')}>{formatCurrency(s.federalDeposit + s.futa + s.suta)}</td>
                          <td className="num muted" data-label={t('회사 총 비용', 'Employer cost')}>{formatCurrency(s.employerCost + s.cardTips)}</td>
                          <td className="expand-cell"><ChevronDown size={18} className="chev" aria-hidden /></td>
                        </tr>
                        {isOpen && (
                          <tr className="detail-row">
                            <td colSpan={7}>
                              <div className="history-detail">
                                <div className="stub-picker">
                                  {r.results.map((x) => (
                                    <button key={x.employeeId} className={`chip${stub?.run === r.id && stub.emp === x.employeeId ? ' on' : ''}`} onClick={() => setStub({ run: r.id, emp: x.employeeId })}>
                                      <FileText size={13} aria-hidden /> {empName(x.employeeId)} · {formatCurrency(x.netPay)}
                                    </button>
                                  ))}
                                </div>
                                {stub?.run === r.id && (() => {
                                  const e = employees.find((x) => x.id === stub.emp)
                                  const res = r.results.find((x) => x.employeeId === stub.emp)
                                  return e && res ? <PayStub employee={effectiveEmployee(e, r.time[e.id], companySchedule.frequency)} result={res} time={r.time[e.id]} /> : null
                                })()}
                                {r.payments && <PaymentsTable payments={r.payments} employees={employees} payDate={r.payDate} />}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {view === 'people' && (
        <section className="card table-card">
          <div className="table-scroll">
            <table className="run-table">
              <thead>
                <tr>
                  <th>{t('직원', 'Employee')}</th>
                  <th className="num">{t('횟수', 'Checks')}</th>
                  <th className="num">{t('총급여', 'Gross')}</th>
                  <th className="num">{t('팁', 'Tips')}</th>
                  <th className="num">{t('연방세', 'Fed W/H')}</th>
                  <th className="num">FICA</th>
                  <th className="num">Fringe</th>
                  <th className="num">{t('입금 합계', 'Net')}</th>
                </tr>
              </thead>
              <tbody>
                {people.map(([id, a]) => {
                  const e = employees.find((x) => x.id === id)
                  return (
                    <tr key={id}>
                      <td data-label={t('직원', 'Employee')}><div className="emp-cell"><span className="avatar sm">{initials(e ? fullName(e) : id)}</span><div><strong>{e ? fullName(e) : id}</strong><span className="muted small">{e ? jobLabel(e, t) : ''}{e && !e.active ? ` · ${t('퇴사', 'Former')}` : ''}</span></div></div></td>
                      <td className="num" data-label={t('횟수', 'Checks')}>{a.checks}</td>
                      <td className="num" data-label={t('총급여', 'Gross')}>{formatCurrency(a.gross)}</td>
                      <td className="num" data-label={t('팁', 'Tips')}>{formatCurrency(a.tips)}</td>
                      <td className="num" data-label={t('연방세', 'Fed W/H')}>{formatCurrency(a.fit)}</td>
                      <td className="num" data-label="FICA">{formatCurrency(a.fica)}</td>
                      <td className="num" data-label="Fringe">{formatCurrency(a.fringe)}</td>
                      <td className="num" data-label={t('입금 합계', 'Net')}><strong>{formatCurrency(a.net)}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
