import { ArrowRight, Building2, CalendarDays, CircleCheck, Landmark, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { segmentsOf } from '../lib/segments'
import BreakdownBar from '../components/BreakdownBar'
import CheckList from '../components/CheckList'
import { companySchedule } from '../config/payrollConfig'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../lib/format'
import { sumResults } from '../lib/payroll'
import { daysBetween, parseISODate, previousPayDate, upcomingDeadlines } from '../lib/schedule'
import { useChecks } from '../lib/useChecks'
import { usePrefs } from '../prefs'
import { useStore } from '../store'

export default function Dashboard() {
  const { t, locale } = usePrefs()
  const { payDate, results, approvedForPayDate, runs, employees } = useStore()
  const checks = useChecks()
  const [today] = useState(() => new Date())
  const pay = parseISODate(payDate)
  const daysLeft = daysBetween(today, pay)
  const periodStart = previousPayDate(companySchedule.frequency, pay)
  const periodLen = daysBetween(periodStart, pay)
  const progress = Math.min(1, Math.max(0, (periodLen - daysLeft) / periodLen))

  const totals = sumResults(approvedForPayDate?.results ?? results)
  const centsHome = totals.gross > 0 ? Math.round((totals.net / totals.gross) * 100) : 0
  const hour = today.getHours()
  const greeting =
    hour < 12 ? t('좋은 아침이에요', 'Good morning') : hour < 18 ? t('좋은 오후예요', 'Good afternoon') : t('좋은 저녁이에요', 'Good evening')
  const critical = checks.filter((c) => c.severity !== 'info').length
  const activeCount = employees.filter((e) => e.active).length

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{formatDate(today, locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <h1>{greeting} 👋</h1>
      </header>

      <section className="hero card">
        <div className="hero-main">
          <span className="eyebrow">{t('다음 급여일', 'Next payday')}</span>
          <div className="hero-date">
            {formatDate(pay, locale)}
            <span className="dday">{daysLeft === 0 ? t('오늘', 'Today') : `D-${daysLeft}`}</span>
          </div>
          <div className="progress" aria-label={t('급여 기간 진행률', 'Pay period progress')}>
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="muted small">
            {t('급여 기간', 'Pay period')} {formatDate(periodStart, locale, { month: 'short', day: 'numeric' })} –{' '}
            {formatDate(pay, locale, { month: 'short', day: 'numeric' })} · {t('격주 지급', 'Biweekly')}
          </p>
        </div>
        <div className="hero-cta">
          {approvedForPayDate ? (
            <div className="approved-pill">
              <CircleCheck size={18} aria-hidden /> {t('이번 회차 승인 완료', 'This run is approved')}
            </div>
          ) : (
            <>
              <p>
                {critical > 0
                  ? t(`승인 전에 살펴볼 항목이 ${critical}건 있어요`, `${critical} item(s) to review before approving`)
                  : t('모든 점검을 통과했어요', 'Everything checks out')}
              </p>
              <Link to="/run" className="btn primary lg">
                {t('급여 실행하기', 'Run payroll')} <ArrowRight size={18} aria-hidden />
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="tiles">
        <div className="tile card">
          <Wallet size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('직원 실수령 합계', 'Total take-home')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.net)}</span>
          <span className="muted small">{t(`재직 ${activeCount}명`, `${activeCount} active people`)}</span>
        </div>
        <div className="tile card">
          <Landmark size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('IRS 예치 예정액', 'Due to IRS')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.federalDeposit)}</span>
          <span className="muted small">{t('연방 원천징수 + FICA(직원·회사)', 'Federal withholding + FICA (both halves)')}</span>
        </div>
        <div className="tile card">
          <Building2 size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('회사 총 인건비', 'Total employer cost')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.employerCost)}</span>
          <span className="muted small">
            {t('총급여', 'Gross')} {formatCurrencyWhole(totals.gross)} + {t('회사 부담 세금', 'employer taxes')}{' '}
            {formatCurrencyWhole(totals.employerTaxes)}
          </span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>{t('급여 $1은 어디로 갈까요?', 'Where does each $1 go?')}</h2>
          <p className="lead">
            {t('이번 회차 급여 $1 중 ', 'Of every $1 in gross pay, ')}
            <strong className="accent">{centsHome}¢</strong>
            {t('가 직원 통장으로 들어갑니다.', ' lands in employees’ bank accounts.')}
          </p>
          <BreakdownBar
            size="lg"
            segments={segmentsOf({
              netPay: totals.net,
              pretaxDeductions: totals.pretax,
              federalWithholding: totals.federal,
              stateWithholding: totals.state,
              socialSecurity: totals.socialSecurity,
              medicare: totals.medicare,
            })}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{t('자동 점검', 'Smart checks')}</h2>
            <Link to="/run?step=2" className="link">
              {t('전체 보기', 'See all')}
            </Link>
          </div>
          <CheckList checks={checks} limit={4} />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>{t('다가오는 신고 기한', 'Upcoming filing deadlines')}</h2>
          <ul className="timeline">
            {upcomingDeadlines(today).map((d) => (
              <li key={d.form}>
                <div className="tl-date">
                  <CalendarDays size={16} aria-hidden />
                  {formatDate(d.date, locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="tl-body">
                  <strong>Form {d.form}</strong>
                  <span className="muted">{t(d.ko, d.en)}</span>
                </div>
                <span className="tl-dday">D-{daysBetween(today, d.date)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {t('기한이 주말·공휴일이면 다음 영업일까지입니다.', 'If a deadline falls on a weekend or holiday, it moves to the next business day.')}
          </p>
        </section>

        <section className="card">
          <h2>{t('최근 급여 내역', 'Recent payrolls')}</h2>
          <ul className="history">
            {runs.slice(0, 5).map((run) => {
              const s = sumResults(run.results)
              return (
                <li key={run.id}>
                  <div>
                    <strong>{formatDate(parseISODate(run.payDate), locale, { month: 'long', day: 'numeric' })}</strong>
                    <span className="muted small">{t(`${run.results.length}명 지급`, `${run.results.length} paid`)}</span>
                  </div>
                  <div className="num">
                    <strong>{formatCurrency(s.net)}</strong>
                    <span className="muted small">{t('실수령', 'net')}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <p className="disclaimer">
        {t(
          '데모 버전: 연방·주 원천징수는 임시 정률이며, 데이터는 이 브라우저에만 저장됩니다. 실제 직원 정보를 입력하지 마세요.',
          'Demo: federal/state withholding uses flat placeholder rates and data stays in this browser only. Do not enter real employee data.',
        )}
      </p>
    </div>
  )
}
