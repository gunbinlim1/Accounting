import { ChevronRight, FileText, Landmark, Languages, LogOut, MailCheck, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { payMethodLabel } from '../components/PaymentsTable'
import PayStub from '../components/PayStub'
import W2Preview from '../components/W2Preview'
import { companySchedule } from '../config/payrollConfig'
import { formatCurrency, formatDate } from '../lib/format'
import { filingLabel, roleLabel } from '../lib/labels'
import { effectiveEmployee } from '../lib/payroll'
import { w2For } from '../lib/taxes'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { CompanyProvider, useStore } from '../store'

function Portal({ employeeId }: { employeeId: string }) {
  const { t, locale, lang, toggleLang } = usePrefs()
  const { logout } = usePortal()
  const { company, runs, employees, upsertEmployee } = useStore()
  const me = employees.find((e) => e.id === employeeId)
  const [tab, setTab] = useState<'stubs' | 'w2' | 'profile'>('stubs')
  const myRuns = runs.filter((r) => r.results.some((x) => x.employeeId === employeeId)).sort((a, b) => b.payDate.localeCompare(a.payDate))
  const [openRun, setOpenRun] = useState<string | null>(myRuns[0]?.id ?? null)
  const [nowIso] = useState(() => new Date().toISOString())
  if (!me) return null
  const year = Number((myRuns[0]?.payDate ?? nowIso).slice(0, 4))
  const ytdNet = myRuns.filter((r) => r.payDate.startsWith(String(year))).reduce((a, r) => a + (r.results.find((x) => x.employeeId === employeeId)?.netPay ?? 0), 0)

  return (
    <div className="emp-portal">
      <header className="emp-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span><span className="brand-tag">{t('직원 포털', 'Employee portal')}</span></div>
        <div className="row gap">
          <button className="round-btn" onClick={toggleLang} aria-label="language"><Languages size={18} /></button>
          <button className="btn sm" onClick={logout}><LogOut size={15} aria-hidden /> {lang === 'ko' ? '로그아웃' : 'Sign out'}</button>
        </div>
      </header>
      <main className="page">
        <header className="page-head">
          <p className="eyebrow">{company.dba} · {roleLabel(me.role, t)}</p>
          <h1>{t(`${me.name.split(' ')[0]}님, 안녕하세요`, `Hi, ${me.name.split(' ')[0]}`)}</h1>
        </header>

        {!me.eConsent && (
          <section className="card consent-card">
            <MailCheck size={22} aria-hidden />
            <div>
              <strong>{t('급여명세서·W-2를 전자로 받으시겠어요?', 'Get pay stubs and your W-2 electronically?')}</strong>
              <p className="muted small">{t('동의하면 매 급여일에 이메일로 명세서를 받고, W-2를 이 포털에서 내려받을 수 있어요. 언제든 철회할 수 있으며, 철회하면 종이로 받습니다.', 'You’ll get stubs by email and download your W-2 here. You can withdraw anytime and receive paper instead.')}</p>
            </div>
            <button className="btn primary" onClick={() => upsertEmployee({ ...me, eConsent: true })}>{t('전자 수령 동의', 'I consent')}</button>
          </section>
        )}

        <section className="stat-strip">
          <div><span>{t('최근 입금액', 'Last paycheck')}</span><strong>{formatCurrency(myRuns[0]?.results.find((x) => x.employeeId === employeeId)?.netPay ?? 0)}</strong></div>
          <div><span>{t(`${year}년 입금 합계`, `${year} take-home`)}</span><strong>{formatCurrency(ytdNet)}</strong></div>
          <div><span>{t('받는 방법', 'Paid by')}</span><strong>{payMethodLabel(me.payMethod ?? 'client_check', t)}</strong></div>
          <div><span>{t('명세서 수령', 'Stub delivery')}</span><strong>{me.eConsent ? t('이메일', 'Email') : t('종이', 'Paper')}</strong></div>
        </section>

        <div className="segmented tabs-row">
          <button className={tab === 'stubs' ? 'on' : ''} onClick={() => setTab('stubs')}>{t('급여명세서', 'Pay stubs')}</button>
          <button className={tab === 'w2' ? 'on' : ''} onClick={() => setTab('w2')}>W-2</button>
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>{t('내 정보', 'My info')}</button>
        </div>

        {tab === 'stubs' && (
          <div className="stub-layout">
            <ul className="stub-list card">
              {myRuns.map((r) => {
                const x = r.results.find((y) => y.employeeId === employeeId)!
                return (
                  <li key={r.id}>
                    <button className={openRun === r.id ? 'on' : ''} onClick={() => setOpenRun(r.id)}>
                      <FileText size={16} aria-hidden />
                      <span><strong>{formatDate(new Date(`${r.payDate}T00:00`), locale, { month: 'long', day: 'numeric' })}</strong><small className="muted">{t('총급여', 'Gross')} {formatCurrency(x.grossPay)}</small></span>
                      <strong className="num">{formatCurrency(x.netPay)}</strong>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
            <div>
              {(() => {
                const r = myRuns.find((x) => x.id === openRun)
                const res = r?.results.find((x) => x.employeeId === employeeId)
                return r && res ? (
                  <section className="card">
                    <div className="card-head"><h2>{formatDate(new Date(`${r.payDate}T00:00`), locale, { year: 'numeric', month: 'long', day: 'numeric' })}</h2><button className="btn sm" onClick={() => window.print()}>{t('인쇄·PDF 저장', 'Print / save PDF')}</button></div>
                    <PayStub employee={effectiveEmployee(me, r.time[me.id], companySchedule.frequency)} result={res} time={r.time[me.id]} />
                  </section>
                ) : null
              })()}
            </div>
          </div>
        )}

        {tab === 'w2' && (
          me.eConsent ? (
            <>
              <p className="muted small">{t(`${year}년 W-2는 ${year + 1}년 1월 31일까지 발행돼요. 지금은 지금까지의 급여로 만든 미리보기입니다.`, `Your ${year} W-2 is issued by Jan 31, ${year + 1}. This preview reflects pay so far.`)}</p>
              <W2Preview w2={w2For(runs, me.id, year)} employee={me} company={company} year={year} />
            </>
          ) : (
            <section className="card empty">{t('W-2를 포털에서 보려면 전자 수령에 동의해 주세요. 동의하지 않으면 우편으로 받습니다.', 'Consent to electronic delivery to view your W-2 here. Otherwise it will be mailed.')}</section>
          )
        )}

        {tab === 'profile' && (
          <section className="card mini-facts">
            <h2><ShieldCheck size={18} aria-hidden /> {t('내 정보', 'My info')}</h2>
            <dl className="facts-grid">
              <div><dt>SSN</dt><dd>***-**-{me.ssnLast4}</dd></div>
              <div><dt>{t('이메일', 'Email')}</dt><dd>{me.email ?? '—'}</dd></div>
              <div><dt>{t('입사일', 'Hired')}</dt><dd>{me.hireDate}</dd></div>
              <div><dt>W-4</dt><dd>{me.w4 ? filingLabel(me.w4.filingStatus, t) : t('미제출', 'Not on file')}</dd></div>
              <div><dt>{t('지급 방식', 'Paid by')}</dt><dd>{payMethodLabel(me.payMethod ?? 'client_check', t)}</dd></div>
              <div><dt><Landmark size={13} aria-hidden /> {t('계좌', 'Bank')}</dt><dd>{me.bank ? `****${me.bank.accountLast4} (${me.bank.type})` : '—'}</dd></div>
            </dl>
            <p className="muted small">{t('정보 변경(W-4, 계좌)은 대표님께 새 서류를 제출해 주세요.', 'To change your W-4 or bank, give your employer a new form.')}</p>
          </section>
        )}
      </main>
    </div>
  )
}

export default function EmployeePortal() {
  const { session } = usePortal()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'employee') return <Navigate to={session.role === 'firm' ? '/firm' : '/'} replace />
  return (
    <CompanyProvider companyId={session.companyId}>
      <Portal employeeId={session.employeeId} />
    </CompanyProvider>
  )
}
