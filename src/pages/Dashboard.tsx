import { ArrowRight, CalendarDays, Clock, HandCoins, Landmark, MessageSquareWarning, PiggyBank, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import BreakdownBar from '../components/BreakdownBar'
import CheckList from '../components/CheckList'
import { ActivityList, StatusBadge, StatusTimeline } from '../components/RunStatus'
import { companySchedule, periodsPerYear } from '../config/payrollConfig'
import { formatCurrencyWhole, formatDate } from '../lib/format'
import { sumResults } from '../lib/payroll'
import { timeLeft } from '../lib/runStatus'
import { daysBetween, parseISODate, previousPayDate, upcomingDeadlines } from '../lib/schedule'
import { segmentsOf } from '../lib/segments'
import { useChecks } from '../lib/useChecks'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'

export default function Dashboard() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const { company, payDate, view, status, current, deadline, activity, employees } = useStore()
  const checks = useChecks()
  const [now] = useState(() => new Date())
  const pay = parseISODate(payDate)
  const daysLeft = daysBetween(now, pay)
  const periodStart = previousPayDate(companySchedule.frequency, pay)
  const due = timeLeft(deadline, now, t)
  const totals = sumResults(view.results)
  const centsHome = totals.gross > 0 ? Math.round(((totals.net + totals.cashTips) / totals.gross) * 100) : 0
  const hour = now.getHours()
  const hello = hour < 12 ? t('좋은 아침이에요', 'Good morning') : hour < 18 ? t('좋은 오후예요', 'Good afternoon') : t('좋은 저녁이에요', 'Good evening')
  const firstName = (session?.name ?? company.ownerName).split(' ')[0]
  const flagged = checks.filter((c) => c.severity !== 'info').length
  const activeCount = employees.filter((e) => e.active).length

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
          <span className="eyebrow">{t('이번 회차', 'This pay period')} · <StatusBadge status={status} /></span>
          <div className="hero-date">
            {formatDate(pay, locale)}
            <span className="dday">{daysLeft === 0 ? t('오늘 지급', 'Pays today') : `D-${daysLeft}`}</span>
          </div>
          <StatusTimeline status={status} submittedAt={current.submittedAt} />
          <p className="muted small">
            {t('급여 기간', 'Pay period')} {formatDate(periodStart, locale, { month: 'short', day: 'numeric' })} – {formatDate(pay, locale, { month: 'short', day: 'numeric' })} · {t('격주 · 텍사스', 'Biweekly · Texas')}
          </p>
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
          <span className="tile-value">{formatCurrencyWhole(totals.tipCredit45B * periodsPerYear[companySchedule.frequency])}</span>
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

      <p className="disclaimer">
        {t('데모 포털: 가상의 고객사·직원 데이터이며 이 브라우저에만 저장됩니다. 실제 직원 정보를 입력하지 마세요.', 'Demo portal: fictional clients and staff, stored in this browser only. Do not enter real employee data.')}
      </p>
    </div>
  )
}
