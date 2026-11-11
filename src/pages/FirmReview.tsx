import { ArrowLeft, BellRing, CheckCheck, Download, Eye, MessageSquareWarning, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import PayrollReview from '../components/PayrollReview'
import { ActivityList, StatusBadge, StatusTimeline } from '../components/RunStatus'
import { maskSsn } from '../lib/compliance'
import { downloadCsv, payrollCsv } from '../lib/csv'
import { formatDate, formatPercent } from '../lib/format'
import { jobLabel } from '../lib/labels'
import { cashOutOf } from '../lib/runStatus'
import { parseISODate } from '../lib/schedule'
import { useChecks } from '../lib/useChecks'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { CompanyProvider, useStore } from '../store'
import History from './History'
import Taxes from './Taxes'

function Review() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const store = useStore()
  const { company, status, view, current, activity, payDate, deadline } = store
  const checks = useChecks()
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const me = session?.name ?? 'CPA'
  const blocking = checks.filter((c) => c.severity === 'critical').length
  const pay = parseISODate(payDate)

  const exportCsv = () =>
    downloadCsv(`${company.dba.replace(/\W+/g, '-')}-${payDate}.csv`, payrollCsv(company, payDate, view, (e) => jobLabel(e, t), maskSsn))

  const panel = (() => {
    switch (status) {
      case 'draft':
        return (
          <>
            <p>{t('아직 고객이 제출하지 않았어요. 아래는 고객이 입력 중인 자료입니다.', 'The client hasn’t submitted yet. Below is their work in progress.')}</p>
            <button className="btn" onClick={() => store.sendReminder(me)}><BellRing size={16} aria-hidden /> {t('마감 알림 보내기', 'Send reminder')}</button>
          </>
        )
      case 'submitted':
        return (
          <>
            <p>{t(`${current.submittedBy ?? company.ownerName}님이 제출했어요. 검토를 시작하면 고객 쪽은 수정할 수 없게 됩니다.`, `${current.submittedBy ?? company.ownerName} submitted. Starting review locks it for the client.`)}</p>
            <button className="btn primary" onClick={() => store.startReview(me)}><Eye size={16} aria-hidden /> {t('검토 시작', 'Start review')}</button>
          </>
        )
      case 'in_review':
        return asking ? (
          <>
            <label className="field">
              <span>{t('고객에게 보낼 수정 요청', 'Message to the client')}</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('예: Maria의 OT 시간이 POS 기록과 다릅니다. 확인 후 다시 제출해 주세요.', 'e.g. Maria’s OT hours don’t match POS. Please check and resubmit.')} autoFocus />
            </label>
            <div className="row gap">
              <button className="btn" onClick={() => setAsking(false)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary" disabled={!note.trim()} onClick={() => { store.requestChanges(me, note.trim()); setNote(''); setAsking(false) }}>
                <Send size={16} aria-hidden /> {t('수정 요청 보내기', 'Send request')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{blocking ? t(`해결이 필요한 문제 ${blocking}건이 있어요. 고객에게 수정을 요청하세요.`, `${blocking} blocking issue(s). Ask the client to fix them.`) : t('검토가 끝나면 처리 완료로 표시해 급여명세서를 발행하세요.', 'When everything checks out, mark it processed to issue pay stubs.')}</p>
            <div className="row gap wrap">
              <button className="btn" onClick={() => setAsking(true)}><MessageSquareWarning size={16} aria-hidden /> {t('수정 요청', 'Request changes')}</button>
              <button className="btn primary" disabled={blocking > 0} onClick={() => store.markProcessed(me)}><CheckCheck size={16} aria-hidden /> {t('처리 완료', 'Mark processed')}</button>
            </div>
          </>
        )
      case 'changes_requested':
        return (
          <>
            <p>{t('고객이 수정 후 다시 제출하기를 기다리는 중이에요.', 'Waiting for the client to fix and resubmit.')}</p>
            {current.note && <blockquote>{t(current.note, current.noteEn ?? current.note)}</blockquote>}
          </>
        )
      case 'processed':
        return <p>{t('처리 완료 — 직접입금 예약, 인쇄 수표 준비, 급여명세서 이메일 발송, IRS 예치 일정 등록까지 끝났어요. 세금·신고 탭에서 납부를 처리하세요.', 'Processed — deposits scheduled, checks printed, stubs emailed, and the IRS deposit queued. Pay it from the Taxes tab.')}</p>
    }
  })()

  return (
    <div className="page run-page">
      <header className="run-head">
        <div>
          <Link to="/firm" className="back-link"><ArrowLeft size={16} aria-hidden /> {t('대기열', 'Queue')}</Link>
          <h1>{company.dba} <StatusBadge status={status} /></h1>
          <div className="run-meta">
            <span>{company.legalName}</span>
            <span>EIN <strong>{company.ein}</strong></span>
            <span>TWC <strong>{company.twcAccount}</strong> · {formatPercent(company.sutaRate, 2)}</span>
            <span>{t('지급일', 'Pay date')} <strong>{formatDate(pay, locale)}</strong></span>
            <span>{t('마감', 'Cutoff')} <strong>{formatDate(deadline, locale, { month: 'short', day: 'numeric', hour: 'numeric' })}</strong></span>
          </div>
        </div>
        <button className="btn" onClick={exportCsv}><Download size={16} aria-hidden /> {t('CSV 내보내기', 'Export CSV')}</button>
      </header>
      {(['form8655', 'twcAgent', 'bankDebit'] as const).some((k) => company.authorizations?.[k] !== 'signed') && (
        <div className="banner warn">
          {t(`위임 서명 미완료: ${[company.authorizations?.form8655 !== 'signed' && 'Form 8655', company.authorizations?.twcAgent !== 'signed' && 'TWC 대리인', company.authorizations?.bankDebit !== 'signed' && '계좌 인출'].filter(Boolean).join(', ')} — 서명 전에는 대리 신고·납부를 할 수 없어요.`,
            `Authorizations missing: ${[company.authorizations?.form8655 !== 'signed' && 'Form 8655', company.authorizations?.twcAgent !== 'signed' && 'TWC agent', company.authorizations?.bankDebit !== 'signed' && 'bank debit'].filter(Boolean).join(', ')} — filing and payments are blocked until signed.`)}
        </div>
      )}

      <div className="review-top">
        <section className="card status-card">
          <StatusTimeline status={status} submittedAt={current.submittedAt} />
          <div className="firm-panel">{panel}</div>
        </section>
        <section className="card">
          <h2>{t('활동 기록', 'Activity')}</h2>
          <ActivityList items={activity} limit={4} />
        </section>
      </div>

      <PayrollReview view={view} checks={checks} />

      <section className="card mini-facts">
        <h2>{t('고객 정보', 'Client')}</h2>
        <dl className="facts-grid">
          <div><dt>{t('대표', 'Owner')}</dt><dd>{company.ownerName}</dd></div>
          <div><dt>{t('이메일', 'Email')}</dt><dd>{company.ownerEmail}</dd></div>
          <div><dt>{t('전화', 'Phone')}</dt><dd>{company.phone}</dd></div>
          <div><dt>{t('IRS 예치', 'IRS deposits')}</dt><dd>{company.depositSchedule === 'monthly' ? t('월별', 'Monthly') : t('반주별', 'Semiweekly')}</dd></div>
          <div><dt>{t('총 출금액', 'Cash out')}</dt><dd>${cashOutOf(view.results).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
          <div><dt>{t('주소', 'Address')}</dt><dd>{[company.address.street, company.address.city, company.address.state, company.address.zip].filter(Boolean).join(', ')}</dd></div>
        </dl>
      </section>
    </div>
  )
}

/** 회계법인: 고객사 화면 (이번 회차 검토 / 세금·신고 / 급여 내역) */
export default function FirmReview({ tab = 'review' }: { tab?: 'review' | 'taxes' | 'history' }) {
  const { t } = usePrefs()
  const { companyId } = useParams()
  const { companies, removeCompany } = usePortal()
  const navigate = useNavigate()
  const data = companies.find((c) => c.company.id === companyId)
  if (!data) return <div className="page"><div className="card empty">{t('고객사를 찾을 수 없습니다', 'Client not found')}</div></div>
  const base = `/firm/c/${companyId}`
  return (
    <CompanyProvider key={companyId} companyId={companyId!}>
      <nav className="firm-tabs" aria-label={data.company.dba}>
        <strong>{data.company.dba}</strong>
        <NavLink to={base} end>{t('이번 회차 검토', 'This payroll')}</NavLink>
        <NavLink to={`${base}/taxes`}>{t('세금·신고', 'Taxes & filings')}</NavLink>
        <NavLink to={`${base}/history`}>{t('급여 내역', 'History')}</NavLink>
        <button
          type="button"
          className="btn sm danger-ghost firm-delete"
          onClick={() => {
            const name = data.company.dba
            if (!window.confirm(t(`${name} 고객사와 모든 급여 기록을 삭제할까요? 되돌릴 수 없습니다.`, `Delete ${name} and all of its payroll records? This can’t be undone.`))) return
            void removeCompany(data.company.id).then(() => navigate('/firm'))
          }}
        >
          <Trash2 size={15} aria-hidden /> {t('고객사 삭제', 'Delete client')}
        </button>
      </nav>
      {tab === 'review' ? <Review /> : tab === 'taxes' ? <Taxes /> : <History />}
    </CompanyProvider>
  )
}
