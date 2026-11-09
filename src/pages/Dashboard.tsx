import { ArrowRight, CalendarDays, CircleCheck, HandCoins, Landmark, PiggyBank, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { segmentsOf } from '../lib/segments'
import BreakdownBar from '../components/BreakdownBar'
import CheckList from '../components/CheckList'
import { companySchedule, periodsPerYear } from '../config/payrollConfig'
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
  const centsHome = totals.gross > 0 ? Math.round(((totals.net + totals.cashTips) / totals.gross) * 100) : 0
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
            {formatDate(pay, locale, { month: 'short', day: 'numeric' })} · {t('격주 지급 · 텍사스', 'Biweekly · Texas')}
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
          <span className="muted small">
            {t('현금', 'Cash')} {formatCurrencyWhole(totals.cashTips)} · {t('카드', 'Card')} {formatCurrencyWhole(totals.cardTips)}
          </span>
        </div>
        <div className="tile card">
          <Landmark size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('IRS 예치 예정액', 'Due to IRS')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.federalDeposit)}</span>
          <span className="muted small">{t(`+ TWC ${formatCurrencyWhole(totals.suta)} · FUTA ${formatCurrencyWhole(totals.futa)}`, `+ TWC ${formatCurrencyWhole(totals.suta)} · FUTA ${formatCurrencyWhole(totals.futa)}`)}</span>
        </div>
        <div className="tile card highlight">
          <PiggyBank size={20} className="tile-icon" aria-hidden />
          <span className="tile-label">{t('45B 팁 크레딧 (연 환산)', '45B tip credit (annualized)')}</span>
          <span className="tile-value">{formatCurrencyWhole(totals.tipCredit45B * periodsPerYear[companySchedule.frequency])}</span>
          <span className="muted small">{t('팁에 낸 회사 FICA를 세액공제로 돌려받기 (Form 8846)', 'Get employer FICA on tips back as a tax credit (Form 8846)')}</span>
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
          <BreakdownBar
            size="lg"
            segments={segmentsOf({
              netPay: totals.net,
              cashTips: totals.cashTips,
              pretaxDeductions: totals.pretax,
              federalWithholding: totals.federal,
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
          '데모 버전: 2026 IRS 퍼센트 방식·텍사스 기준으로 계산하지만 실제 신고 전 세무 전문가 검토가 필요합니다. 데이터는 이 브라우저에만 저장되니 실제 직원 정보를 입력하지 마세요.',
          'Demo: calculated with the 2026 IRS percentage method for Texas, but have a tax professional review before filing. Data stays in this browser only — do not enter real employee data.',
        )}
      </p>
    </div>
  )
}
