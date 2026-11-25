import { CalendarPlus, ChevronRight, Download, FileCheck2, Palmtree, FileText, Landmark, Languages, LogOut, MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadFiling, listFilings, type Filing } from '../lib/filings'
import { accrualText, defaultRequestHours, policyAppliesTo, ptoLedger } from '../lib/pto'
import { parseISODate } from '../lib/schedule'
import type { Employee, PtoRequest } from '../types'
import { Navigate } from 'react-router-dom'
import { payMethodLabel } from '../components/PaymentsTable'
import PayStub from '../components/PayStub'
import W2Preview from '../components/W2Preview'
import { formatCurrency, formatDate } from '../lib/format'
import { filingLabel, jobLabel } from '../lib/labels'
import { effectiveEmployee } from '../lib/payroll'
import { w2For } from '../lib/taxes'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { CompanyProvider, useStore } from '../store'
import { fullName } from '../lib/names'

function Portal({ employeeId }: { employeeId: string }) {
  const { t, locale, lang, toggleLang } = usePrefs()
  const { logout } = usePortal()
  const { company, runs, employees, upsertEmployee, pto } = useStore()
  const me = employees.find((e) => e.id === employeeId)
  const [tab, setTab] = useState<'stubs' | 'w2' | 'pto' | 'profile'>('stubs')
  const myRuns = runs.filter((r) => r.results.some((x) => x.employeeId === employeeId)).sort((a, b) => b.payDate.localeCompare(a.payDate))
  const [openRun, setOpenRun] = useState<string | null>(myRuns[0]?.id ?? null)
  const [nowIso] = useState(() => new Date().toISOString())
  if (!me) return null
  const hasPto = pto.policies.some((p) => policyAppliesTo(p, me))
  const year = Number((myRuns[0]?.payDate ?? nowIso).slice(0, 4))
  const ytdNet = myRuns.filter((r) => r.payDate.startsWith(String(year))).reduce((a, r) => a + (r.results.find((x) => x.employeeId === employeeId)?.netPay ?? 0), 0)

  return (
    <div className="emp-portal">
      <header className="emp-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span><span className="brand-tag">{t('직원 포털', 'Employee portal')}</span></div>
        <div className="row gap">
          <button className="round-btn" onClick={toggleLang} aria-label={t('언어 전환', 'Switch language')}><Languages size={18} /></button>
          <button className="btn sm" onClick={logout}><LogOut size={15} aria-hidden /> {lang === 'ko' ? '로그아웃' : 'Sign out'}</button>
        </div>
      </header>
      <main className="page">
        <header className="page-head">
          <p className="eyebrow">{company.dba} · {jobLabel(me, t)}</p>
          <h1>{t(`${fullName(me).split(' ')[0]}님, 안녕하세요`, `Hi, ${fullName(me).split(' ')[0]}`)}</h1>
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
          {hasPto && <button className={tab === 'pto' ? 'on' : ''} onClick={() => setTab('pto')}>{t('휴가', 'Time off')}</button>}
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
                    <PayStub employee={effectiveEmployee(me, r.time[me.id], me.payFrequency ?? 'biweekly')} result={res} time={r.time[me.id]} payDate={r.payDate} periodStart={r.periodStart} periodEnd={r.periodEnd} />
                  </section>
                ) : null
              })()}
            </div>
          </div>
        )}

        {tab === 'w2' && (
          me.eConsent ? (
            <>
              <MyW2Files companyId={company.id} employeeId={me.id} />
              <p className="muted small">{t(`${year}년 W-2는 ${year + 1}년 1월 31일까지 발행돼요. 지금은 지금까지의 급여로 만든 미리보기입니다.`, `Your ${year} W-2 is issued by Jan 31, ${year + 1}. This preview reflects pay so far.`)}</p>
              <W2Preview w2={w2For(runs, me.id, year)} employee={me} company={company} year={year} />
            </>
          ) : (
            <section className="card empty">{t('W-2를 포털에서 보려면 전자 수령에 동의해 주세요. 동의하지 않으면 우편으로 받습니다.', 'Consent to electronic delivery to view your W-2 here. Otherwise it will be mailed.')}</section>
          )
        )}

        {tab === 'pto' && hasPto && <MyTimeOff employee={me} />}

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

/** 회계법인이 올린 본인 W-2 PDF (다른 직원 것은 서버 권한으로 안 보임) */
function MyW2Files({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const { t, locale } = usePrefs()
  const [items, setItems] = useState<Filing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listFilings(companyId)
      .then((x) => setItems(x.filter((f) => f.form === 'W-2' && f.employeeId === employeeId)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [companyId, employeeId])
  const download = (f: Filing) => downloadFiling(f).catch((e) => setError(e instanceof Error ? e.message : String(e)))

  return (
    <section className="card my-w2">
      <h2><FileCheck2 size={19} aria-hidden /> {t('발행된 W-2 (PDF)', 'Issued W-2 (PDF)')}</h2>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {items === null ? (
        <p className="muted small">{t('불러오는 중…', 'Loading…')}</p>
      ) : items.length === 0 ? (
        <p className="muted small">{t('아직 발행된 W-2가 없어요. 회계법인이 발행하면 여기에서 PDF로 받을 수 있어요 (매년 1월 31일까지).', 'No W-2 issued yet. When your employer’s CPA issues it (by Jan 31), download it here.')}</p>
      ) : (
        <ul className="filing-list">
          {items.map((f) => (
            <li key={f.id} className="filing-row">
              <span className="filing-form f-W2">W-2</span>
              <span className="filing-info">
                <strong>{t(`${f.period}년 소득`, `${f.period} wages`)}</strong>
                <small className="muted">{f.filedOn ? t(`발행 ${formatDate(new Date(`${f.filedOn}T00:00`), locale, { month: 'short', day: 'numeric', year: 'numeric' })}`, `Issued ${formatDate(new Date(`${f.filedOn}T00:00`), locale, { month: 'short', day: 'numeric', year: 'numeric' })}`) : ''}</small>
              </span>
              <span className="filing-actions">
                <button type="button" className="btn sm primary" onClick={() => void download(f)}><Download size={15} aria-hidden /> {t('PDF 받기', 'Download PDF')}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 직원: 내 휴가 잔액 · 신청 · 신청 내역 */
function MyTimeOff({ employee: me }: { employee: Employee }) {
  const { t, locale } = usePrefs()
  const store = useStore()
  const { pto, runs, time } = store
  const [now] = useState(() => new Date())
  const policies = pto.policies.filter((p) => policyAppliesTo(p, me))
  const [form, setForm] = useState({ policyId: policies[0]?.id ?? '', startDate: '', endDate: '', hours: 0, note: '' })
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const end = form.endDate || form.startDate
  const hours = touched ? form.hours : defaultRequestHours(form.startDate, end)
  const mine = pto.requests.filter((r) => r.employeeId === me.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const d = (iso: string) => formatDate(parseISODate(iso), locale, { month: 'short', day: 'numeric', weekday: 'short' })
  const statusText: Record<PtoRequest['status'], string> = { pending: t('승인 대기', 'Pending'), approved: t('승인됨', 'Approved'), denied: t('거절됨', 'Denied'), cancelled: t('취소됨', 'Cancelled') }

  const submit = async () => {
    if (!form.policyId || !form.startDate || hours <= 0) return
    setSaving(true)
    setMsg(null)
    try {
      await store.requestPto({ employeeId: me.id, policyId: form.policyId, startDate: form.startDate, endDate: end, hours, note: form.note }, 'employee', fullName(me))
      setForm({ ...form, startDate: '', endDate: '', note: '' })
      setTouched(false)
      setMsg({ ok: true, text: t('신청했어요. 회사가 승인하면 여기에서 확인할 수 있어요.', 'Requested. You’ll see it here once your employer decides.') })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="my-pto">
      <div className="my-pto-balances">
        {policies.map((p) => {
          const b = ptoLedger(me, p, runs, pto.adjustments, now)
          const use = time[me.id]?.timeOff?.[p.id] ?? 0
          const pending = mine.filter((r) => r.policyId === p.id && r.status === 'pending').reduce((a, r) => a + r.hours, 0)
          return (
            <section key={p.id} className="card my-pto-card">
              <span className="dc-label"><Palmtree size={14} aria-hidden /> {p.name}</span>
              <strong className="my-pto-hours">{Math.round((b.balance - use) * 100) / 100}<small>{t('시간', 'h')}</small></strong>
              <small className="muted">{t('사용 가능', 'available')}{use > 0 ? t(` · 이번 급여에서 ${use}시간 사용`, ` · ${use}h on this paycheck`) : ''}{pending > 0 ? t(` · 승인 대기 ${pending}시간`, ` · ${pending}h pending`) : ''}</small>
              <small className="muted">{accrualText(p, t)}</small>
            </section>
          )
        })}
      </div>

      <section className="card pto-form">
        <h3><CalendarPlus size={18} aria-hidden /> {t('휴가 신청', 'Request time off')}</h3>
        <div className="form-grid">
          {policies.length > 1 && (
            <label className="field"><span>{t('휴가 종류', 'Type')}</span>
              <select value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })}>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>{t('시작일', 'From')}</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label className="field"><span>{t('종료일', 'To')}</span><input type="date" value={end} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label className="field"><span>{t('시간 (평일 × 8시간 자동)', 'Hours (weekdays × 8)')}</span><input type="number" min={0.25} step={0.25} value={hours || ''} onChange={(e) => { setTouched(true); setForm({ ...form, hours: Math.max(0, Number(e.target.value) || 0) }) }} /></label>
          <label className="field"><span>{t('메모 (선택)', 'Note (optional)')}</span><input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('예: 가족 여행', 'e.g. Family trip')} /></label>
        </div>
        {msg && <p className={msg.ok ? 'ok-text small' : 'de-error'} role="status">{msg.text}</p>}
        <div><button type="button" className="btn primary" disabled={saving || !form.startDate || hours <= 0 || end < form.startDate} onClick={() => void submit()}>{saving ? t('보내는 중…', 'Sending…') : t('신청하기', 'Send request')}</button></div>
      </section>

      <section className="card">
        <h3>{t('내 신청 내역', 'My requests')}</h3>
        {mine.length === 0 ? <p className="muted small">{t('아직 신청한 휴가가 없어요.', 'No requests yet.')}</p> : (
          <ul className="pto-req-list">
            {mine.map((r) => (
              <li key={r.id}>
                <span className="pto-req-main">
                  <strong>{r.startDate === r.endDate ? d(r.startDate) : `${d(r.startDate)} – ${d(r.endDate)}`} · {r.hours}h</strong>
                  <small className="muted">{pto.policies.find((p) => p.id === r.policyId)?.name}{r.note ? ` · “${r.note}”` : ''}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</small>
                </span>
                <span className="row gap">
                  <span className={`pto-status ${r.status}`}>{statusText[r.status]}</span>
                  {r.status === 'pending' && <button type="button" className="btn sm ghost" onClick={() => void store.decidePto(r.id, 'cancelled', fullName(me), 'employee')}>{t('취소', 'Cancel')}</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
