import { ArrowRight, Banknote, CalendarCog, Palmtree, CalendarDays, CalendarRange, Clock, HandCoins, Landmark, MessageSquareWarning, PiggyBank, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import BreakdownBar from '../components/BreakdownBar'
import CheckList from '../components/CheckList'
import PayrollSchedule from '../components/PayrollSchedule'
import { openChat } from '../components/chat/events'
import { ActivityList, StatusBadge, StatusTimeline } from '../components/RunStatus'
import { periodsPerYear } from '../config/payrollConfig'
import FrequencyBadge from '../components/FrequencyBadge'
import RunDatesEditor from '../components/RunDatesEditor'
import RunSwitcher from '../components/RunSwitcher'
import { formatCurrencyWhole, formatDate } from '../lib/format'
import { sumResults } from '../lib/payroll'
import { timeLeft } from '../lib/runStatus'
import { daysBetween, frequencyLabel, parseISODate, toISODate, upcomingDeadlines } from '../lib/schedule'
import { employmentStatus } from '../lib/employment'
import { segmentsOf } from '../lib/segments'
import { useChecks } from '../lib/useChecks'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'

export default function Dashboard() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const store = useStore()
  const { company, payDate, view, status, current, deadline, activity, employees, period, openRun, frequency } = store
  const [editingDates, setEditingDates] = useState(false)
  const ptoPending = store.pto.requests.filter((r) => r.status === 'pending').length
  const checks = useChecks()
  const [now] = useState(() => new Date())
  const pay = parseISODate(payDate)
  const daysLeft = daysBetween(now, pay)
  const periodStart = parseISODate(period.start)
  const periodEnd = parseISODate(period.end)
  const periodDays = daysBetween(periodStart, periodEnd) + 1
  const elapsed = Math.min(periodDays, Math.max(0, daysBetween(periodStart, now) + 1))
  const changed = openRun.schedules.some((x) => x.period.changed)
  const due = timeLeft(deadline, now, t)
  const totals = sumResults(view.results)
  const centsHome = totals.gross > 0 ? Math.round(((totals.net + totals.cashTips) / totals.gross) * 100) : 0
  const hour = now.getHours()
  const hello = hour < 12 ? t('좋은 아침이에요', 'Good morning') : hour < 18 ? t('좋은 오후예요', 'Good afternoon') : t('좋은 저녁이에요', 'Good evening')
  const firstName = (session?.name ?? company.ownerName).split(' ')[0]
  const flagged = checks.filter((c) => c.severity !== 'info').length
  const activeCount = employees.filter((e) => employmentStatus(e, toISODate(now)) !== 'former').length

  const cta = {
    draft: { text: t('급여 입력 시작', 'Start payroll'), msg: flagged ? t(`제출 전에 살펴볼 항목이 ${flagged}건 있어요`, `${flagged} item(s) to look at before submitting`) : t('근무시간과 팁을 입력하고 회계법인에 제출하세요', 'Enter hours and tips, then submit to your CPA') },
    changes_requested: { text: t('수정하고 다시 제출', 'Fix and resubmit'), msg: t('회계법인이 수정을 요청했어요', 'Your CPA asked for changes') },
    submitted: { text: t('제출 내역 보기', 'View submission'), msg: t('회계법인 검토를 기다리는 중이에요', 'Waiting for your CPA to review') },
    in_review: { text: t('제출 내역 보기', 'View submission'), msg: t('회계법인이 검토하고 있어요', 'Your CPA is reviewing it') },
    processed: { text: t('급여명세서 보기', 'View pay stubs'), msg: t('처리 완료! 지급일에 입금됩니다', 'Processed! Paid on pay day') },
  }[status]

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{company.dba} · {formatDate(now, locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <h1>{t(`${firstName}님, ${hello}`, `${hello}, ${firstName}`)} 👋</h1>
      </header>

      {ptoPending > 0 && (
        <Link to="/pto" className="pto-notice link-card">
          <Palmtree size={20} aria-hidden />
          <div>
            <strong>{t(`휴가 승인 대기 ${ptoPending}건`, `${ptoPending} time-off request(s) to review`)}</strong>
            <p>{t('직원이 직원 포털에서 휴가를 신청했어요.', 'Employees asked for time off in their portal.')}</p>
          </div>
          <ArrowRight size={18} aria-hidden />
        </Link>
      )}

      {status === 'changes_requested' && current.note && (
        <Link to="/run" className="firm-note link-card">
          <MessageSquareWarning size={20} aria-hidden />
          <div>
            <strong>{t('회계법인 수정 요청', 'Changes requested by your CPA')}</strong>
            <p>{t(current.note, current.noteEn ?? current.note)}</p>
          </div>
          <ArrowRight size={18} aria-hidden />
        </Link>
      )}

      <section className="hero card">
        <div className="hero-main">
          <RunSwitcher />
          <div className="hero-top">
            <span className="eyebrow">{t('이번 회차', 'This pay period')} · <StatusBadge status={status} /></span>
            <span className="hero-freqs">
              {openRun.schedules.map(({ schedule: sc }) => <FrequencyBadge key={sc.id} frequency={sc.frequency} name={sc.name || undefined} size="lg" />)}
              {changed && <span className="tag warn">{t('날짜 변경됨', 'Dates changed')}</span>}
            </span>
          </div>
          {editingDates ? (
            <RunDatesEditor
              payDate={payDate}
              start={period.start}
              end={period.end}
              onCancel={() => setEditingDates(false)}
              onSave={async (d) => { await store.changeRunDates(d, session?.name ?? company.ownerName); setEditingDates(false) }}
            />
          ) : (
          <div className="date-card">
            <div className="dc-pane dc-period">
              <span className="dc-label"><CalendarRange size={14} aria-hidden /> {t('급여 기간', 'Pay period')}</span>
              <strong className="dc-range">
                {formatDate(periodStart, locale, { month: 'short', day: 'numeric', weekday: 'short' })}
                <span className="dc-arrow" aria-hidden>→</span>
                {formatDate(periodEnd, locale, { month: 'short', day: 'numeric', weekday: 'short' })}
              </strong>
              <div className="dc-progress" role="img" aria-label={t(`급여 기간 ${periodDays}일 중 ${elapsed}일 지남`, `${elapsed} of ${periodDays} days elapsed`)}>
                <span style={{ width: `${Math.round((elapsed / periodDays) * 100)}%` }} />
              </div>
              <span className="dc-meta">{t(`${periodDays}일 · ${frequencyLabel(frequency, t)}`, `${periodDays} days · ${frequencyLabel(frequency, t)}`)}{elapsed > 0 && elapsed < periodDays ? t(` · ${elapsed}일째`, ` · day ${elapsed}`) : ''}</span>
            </div>
            <div className="dc-pane dc-pay">
              <span className="dc-label"><Banknote size={14} aria-hidden /> {t('지급일', 'Pay date')}</span>
              <strong className="dc-paydate">{formatDate(pay, locale, { month: 'short', day: 'numeric', weekday: 'short' })}</strong>
              <span className="dc-meta"><span className="dc-dday">{daysLeft === 0 ? t('오늘 지급', 'Today') : `D-${daysLeft}`}</span> {t('직원에게 입금되는 날', 'Employees get paid')}</span>
            </div>
          </div>
          )}
          {!editingDates && status === 'draft' && (
            <button type="button" className="link-btn hero-edit" onClick={() => setEditingDates(true)}>
              <CalendarCog size={15} aria-hidden /> {t('이번 회차 급여 기간·지급일 변경', 'Change this run’s pay period or pay date')}
            </button>
          )}
          <StatusTimeline status={status} submittedAt={current.submittedAt} />
        </div>
        <div className="hero-cta">
          {(status === 'draft' || status === 'changes_requested') && (
            <div className={`deadline-pill${due.overdue ? ' over' : due.urgent ? ' urgent' : ''}`}>
              <Clock size={16} aria-hidden />
              <span>
                {t('제출 마감', 'Submit by')} <strong>{formatDate(deadline, locale, { month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</strong>
                <small>{due.text}</small>
              </span>
            </div>
          )}
          <p>{cta.msg}</p>
          <Link to="/run" className="btn primary lg">{cta.text} <ArrowRight size={18} aria-hidden /></Link>
        </div>
      </section>

      <PayrollSchedule now={now} onAsk={openChat} />

      <section className="tiles four">
        <div className="tile card">
          <Wallet size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('급여 입금 합계', 'Paychecks')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.net)}</span>
          <span className="muted small">{t(`재직 ${activeCount}명 · 카드 팁 포함`, `${activeCount} active · incl. card tips`)}</span>
        </div>
        <div className="tile card">
          <HandCoins size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('이번 회차 팁', 'Tips this run')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.cashTips + totals.cardTips)}</span>
          <span className="muted small">{t('현금', 'Cash')} {formatCurrencyWhole(totals.cashTips)} · {t('카드', 'Card')} {formatCurrencyWhole(totals.cardTips)}</span>
        </div>
        <div className="tile card">
          <Landmark size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('세금 (IRS + TWC/FUTA)', 'Taxes (IRS + TWC/FUTA)')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.federalDeposit + totals.suta + totals.futa)}</span>
          <span className="muted small">{t('회계법인이 예치·신고', 'Deposited & filed by your CPA')}</span>
        </div>
        <div className="tile card highlight">
          <PiggyBank size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('45B 팁 크레딧 (연 환산)', '45B tip credit (annualized)')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.tipCredit45B * periodsPerYear[frequency])}</span>
          <span className="muted small">{t('팁에 낸 회사 FICA를 세액공제로', 'Employer FICA on tips back as a credit')}</span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>{t('급여 $1은 어디로 갈까요?', 'Where does each $1 go?')}</h2>
          <p className="lead">
            {t('팁 포함 총급여 $1 중 ', 'Of every $1 earned, tips included, ')}
            <strong className="accent">{centsHome}¢</strong>
            {t('가 직원 손에 남습니다 (입금 + 현금 팁).', ' stays with employees (paycheck + cash tips).')}
          </p>
          <BreakdownBar size="lg" segments={segmentsOf({ netPay: totals.net, cashTips: totals.cashTips, pretaxDeductions: totals.pretax, federalWithholding: totals.federal, socialSecurity: totals.socialSecurity, medicare: totals.medicare })} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>{t('자동 점검', 'Smart checks')}</h2>
            <Link to="/run" className="link">{t('급여 실행으로', 'Go to payroll')}</Link>
          </div>
          <CheckList checks={checks} limit={4} />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>{t('회계법인과의 진행 기록', 'Activity with your CPA')}</h2>
          <ActivityList items={activity} limit={6} />
        </section>
        <section className="card">
          <h2>{t('다가오는 신고 기한', 'Upcoming filing deadlines')}</h2>
          <ul className="timeline">
            {upcomingDeadlines(now, 4).map((d) => (
              <li key={d.form}>
                <div className="tl-date"><CalendarDays size={16} aria-hidden />{formatDate(d.date, locale, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <div className="tl-body"><strong>Form {d.form}</strong><span className="muted">{t(d.ko, d.en)}</span></div>
                <span className="tl-dday">D-{daysBetween(now, d.date)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('신고와 예치는 회계법인이 처리합니다.', 'Your CPA files and deposits these.')}</p>
        </section>
      </div>
    </div>
  )
}
