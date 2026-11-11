import { ArrowRight, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/RunStatus'
import { companySchedule, standardHours } from '../config/payrollConfig'
import { runChecks } from '../lib/checks'
import { computeResults } from '../lib/compute'
import { formatCurrency, formatDate } from '../lib/format'
import { industryLabel } from '../lib/labels'
import { effectiveEmployee } from '../lib/payroll'
import { cashOutOf, timeLeft } from '../lib/runStatus'
import { parseISODate, subtractBusinessDays } from '../lib/schedule'
import { ytdFor } from '../lib/ytd'
import { currentPayDate, usePortal } from '../portal'
import { usePrefs } from '../prefs'
import type { RunStatus } from '../types'

type Filter = 'all' | 'action' | 'waiting' | 'done'

export default function FirmQueue() {
  const { t, locale } = usePrefs()
  const { companies, session } = usePortal()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [now] = useState(() => new Date())
  const payDate = currentPayDate(now)

  const rows = useMemo(
    () =>
      companies.map((c) => {
        const status: RunStatus = c.current.payDate === payDate ? c.current.status : 'draft'
        const ytdAll = ytdFor(c.runs, payDate)
        const ytd = Object.fromEntries(Object.entries(ytdAll).map(([id, y]) => [id, y.gross]))
        const view = c.current.snapshot && (status === 'submitted' || status === 'in_review' || status === 'processed')
          ? c.current.snapshot
          : { employees: c.employees, time: c.time, results: computeResults(c.employees, c.time, ytdAll, c.company.sutaRate) }
        const checks = runChecks({
          employees: view.employees.filter((e) => e.active).map((e) => effectiveEmployee(e, view.time[e.id], companySchedule.frequency)),
          time: view.time,
          results: view.results,
          ytdGross: ytd,
          standardHours: standardHours[companySchedule.frequency],
          today: now,
        })
        const deadline = subtractBusinessDays(parseISODate(payDate), c.company.cutoffBusinessDays)
        deadline.setHours(15, 0, 0, 0)
        return { c, status, view, checks, deadline, lastActivity: [...c.activity].sort((a, b) => b.at.localeCompare(a.at))[0] }
      }),
    [companies, payDate, now],
  )

  const bucket = (s: RunStatus): Filter => (s === 'submitted' || s === 'in_review' ? 'action' : s === 'processed' ? 'done' : 'waiting')
  const counts = { all: rows.length, action: rows.filter((r) => bucket(r.status) === 'action').length, waiting: rows.filter((r) => bucket(r.status) === 'waiting').length, done: rows.filter((r) => bucket(r.status) === 'done').length }
  const order: Record<RunStatus, number> = { submitted: 0, in_review: 1, changes_requested: 2, draft: 3, processed: 4 }
  const list = rows
    .filter((r) => filter === 'all' || bucket(r.status) === filter)
    .filter((r) => !query.trim() || `${r.c.company.dba} ${r.c.company.legalName} ${r.c.company.ownerName}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => order[a.status] - order[b.status])

  return (
    <div className="page">
      <header className="page-head row between wrap">
        <div>
          <p className="eyebrow">{t('지급일', 'Pay date')} {formatDate(parseISODate(payDate), locale)}</p>
          <h1>{t(`안녕하세요, ${session?.name}님`, `Hi, ${session?.name}`)}</h1>
          <p className="lead">{t('이번 회차 고객사 급여 제출 현황입니다. 제출된 곳부터 검토하세요.', 'Here’s where every client stands this pay period. Start with submitted runs.')}</p>
        </div>
        <Link className="btn primary" to="/firm/new"><Plus size={18} aria-hidden /> {t('새 고객사', 'New client')}</Link>
      </header>

      <section className="people-summary">
        <button className={filter === 'action' ? 'on' : ''} onClick={() => setFilter('action')}><strong>{counts.action}</strong><span>{t('검토할 제출', 'To review')}</span></button>
        <button className={filter === 'waiting' ? 'on' : ''} onClick={() => setFilter('waiting')}><strong>{counts.waiting}</strong><span>{t('고객 작성·수정 중', 'With client')}</span></button>
        <button className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}><strong>{counts.done}</strong><span>{t('처리 완료', 'Processed')}</span></button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}><strong>{counts.all}</strong><span>{t('전체 고객사', 'All clients')}</span></button>
      </section>

      <section className="card list-card">
        <div className="table-toolbar">
          <div className="search compact">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('고객사 검색', 'Search clients')} />
          </div>
        </div>
        <div className="qlist-head" aria-hidden>
          <span>{t('고객사', 'Client')}</span>
          <span>{t('상태', 'Status')}</span>
          <span>{t('제출 마감', 'Cutoff')}</span>
          <span className="num">{t('총 출금액', 'Cash out')}</span>
          <span className="num">{t('경고', 'Flags')}</span>
          <span />
        </div>
        <ul className="qlist">
          {list.map(({ c, status, view, checks, deadline, lastActivity }) => {
            const due = timeLeft(deadline, now, t)
            const flags = checks.filter((x) => x.severity !== 'info').length
            const crit = checks.filter((x) => x.severity === 'critical').length
            return (
              <li key={c.company.id}>
                <Link to={`/firm/c/${c.company.id}`} className="qlist-row">
                  <span className="plist-person">
                    <span className="identity-logo sm">{c.company.dba.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                    <span className="plist-name">
                      <strong>{c.company.dba}</strong>
                      <small>{industryLabel(c.company.industry, t)} · {c.company.ownerName} · {t(`직원 ${view.results.length}명`, `${view.results.length} people`)} · EIN {c.company.ein}</small>
                    </span>
                  </span>
                  <span className="q-status">
                    <StatusBadge status={status} />
                    {lastActivity && <small className="muted">{formatDate(new Date(lastActivity.at), locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>}
                  </span>
                  <span className={`q-due${status === 'draft' || status === 'changes_requested' ? (due.overdue ? ' over' : due.urgent ? ' urgent' : '') : ''}`}>
                    {formatDate(deadline, locale, { month: 'short', day: 'numeric', hour: 'numeric' })}
                    <small>{status === 'draft' || status === 'changes_requested' ? due.text : '—'}</small>
                  </span>
                  <span className="num"><strong>{formatCurrency(cashOutOf(view.results))}</strong></span>
                  <span className="num">
                    {flags ? <span className={`tag ${crit ? 'crit' : 'warn'}`}>{flags}</span> : <span className="tag good">0</span>}
                  </span>
                  <ArrowRight size={18} className="plist-chev" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
