import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, MessageCircle } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { companySchedule } from '../config/payrollConfig'
import { formatDate } from '../lib/format'
import { buildSchedule, type ScheduleRow } from '../lib/payrollSchedule'
import { statusLabel, timeLeft } from '../lib/runStatus'
import { daysBetween, frequencyLabel, parseISODate } from '../lib/schedule'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { RunStatus } from '../types'

type Tone = 'crit' | 'warn' | 'info' | 'good' | 'neutral'

/** 홈 화면: 지난 미처리 회차 · 이번 회차 · 다음 회차를 한 표로 */
export default function PayrollSchedule({ now, onAsk }: { now: Date; onAsk?: () => void }) {
  const { t, locale } = usePrefs()
  const { company, payDate, status, runs, deadline } = useStore()

  const rows = useMemo(
    () => buildSchedule({
      frequency: companySchedule.frequency,
      anchor: parseISODate(companySchedule.anchorDate),
      currentPayDate: parseISODate(payDate),
      createdAt: company.createdAt,
      processedPayDates: runs.map((r) => r.payDate),
      cutoffBusinessDays: company.cutoffBusinessDays,
    }),
    [payDate, company.createdAt, company.cutoffBusinessDays, runs],
  )

  const freq = frequencyLabel(companySchedule.frequency, t)
  const day = (d: Date) => formatDate(d, locale, { month: 'short', day: 'numeric' })
  const dayW = (d: Date) => formatDate(d, locale, { month: 'short', day: 'numeric', weekday: 'short' })
  const missedCount = rows.filter((r) => r.kind === 'missed').length

  const stateOf = (r: ScheduleRow): { tone: Tone; label: string; sub: string } => {
    if (r.kind === 'missed') return { tone: 'crit', label: t('미처리', 'Not run'), sub: t('지급일 지남', 'Pay date passed') }
    if (r.kind === 'upcoming') {
      const weeks = Math.round(daysBetween(now, r.cutoff) / 7)
      return { tone: 'neutral', label: t('예정', 'Upcoming'), sub: weeks <= 1 ? t(`${daysBetween(now, r.cutoff)}일 후 마감`, `Due in ${daysBetween(now, r.cutoff)} days`) : t(`${weeks}주 후 마감`, `Due in ${weeks} weeks`) }
    }
    return currentState(status, deadline, now, t)
  }

  return (
    <section className="card schedule-card" aria-labelledby="schedule-title">
      <div className="card-head schedule-head">
        <div>
          <h2 id="schedule-title"><CalendarClock size={19} aria-hidden /> {t('급여 일정', 'Payroll schedule')}</h2>
          <p className="muted small">
            {t(
              `${freq} 지급 · 마감은 지급일 ${company.cutoffBusinessDays}영업일 전 오후 3시`,
              `${freq} pay · due ${company.cutoffBusinessDays} business days before pay day, 3 PM`,
            )}
          </p>
        </div>
        {missedCount > 0 && (
          <span className="badge crit"><AlertTriangle size={13} aria-hidden />&nbsp;{t(`미처리 ${missedCount}회차`, `${missedCount} not run`)}</span>
        )}
      </div>

      <div className="schedule" role="table" aria-label={t('급여 일정', 'Payroll schedule')}>
        <div className="schedule-row schedule-th" role="row">
          <span role="columnheader">{t('처리 마감', 'Process by')}</span>
          <span role="columnheader">{t('상태', 'Status')}</span>
          <span role="columnheader">{t('급여 주기', 'Schedule')}</span>
          <span role="columnheader">{t('급여 기간', 'Pay period')}</span>
          <span role="columnheader">{t('지급일', 'Pay date')}</span>
          <span role="columnheader" className="sr-only">{t('바로가기', 'Action')}</span>
        </div>
        {rows.map((r) => {
          const s = stateOf(r)
          return (
            <div key={r.payDate.toISOString()} role="row" className={`schedule-row ${r.kind} tone-${s.tone}`}>
              <span role="cell" className="sc-cutoff">
                <small className="sc-label">{t('처리 마감', 'Process by')}</small>
                <strong>{dayW(r.cutoff)}</strong>
                <small className="muted">{r.cutoff.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</small>
              </span>
              <span role="cell" className="sc-status">
                <span className={`sc-pill ${s.tone}`}><span className="dot" />{s.label}</span>
                <small className="muted">{s.sub}</small>
              </span>
              <span role="cell" className="sc-freq"><small className="sc-label">{t('급여 주기', 'Schedule')}</small>{freq}</span>
              <span role="cell" className="sc-period">
                <small className="sc-label">{t('급여 기간', 'Pay period')}</small>
                {day(r.start)} – {day(r.end)}
              </span>
              <span role="cell" className="sc-pay">
                <small className="sc-label">{t('지급일', 'Pay date')}</small>
                <CalendarDays size={14} aria-hidden /> <strong>{dayW(r.payDate)}</strong>
              </span>
              <span role="cell" className="sc-action">
                {r.kind === 'current' && (
                  <Link to="/run" className="btn primary sm">
                    {status === 'draft' || status === 'changes_requested' ? t('급여 입력', 'Run payroll') : t('보기', 'View')} <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
                {r.kind === 'missed' && onAsk && (
                  <button type="button" className="btn sm" onClick={onAsk}><MessageCircle size={14} aria-hidden /> {t('문의', 'Ask')}</button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {missedCount > 0 && (
        <p className="muted small schedule-foot">
          {t('지난 회차는 포털에서 바로 입력할 수 없어요. 채팅으로 회계법인에 알려 주시면 따로 처리해 드립니다.', 'Past pay periods can’t be entered here. Let your CPA know in chat and they’ll handle it.')}
        </p>
      )}
    </section>
  )
}

function currentState(status: RunStatus, deadline: Date, now: Date, t: (ko: string, en: string) => string): { tone: Tone; label: string; sub: string } {
  if (status === 'draft' || status === 'changes_requested') {
    const due = timeLeft(deadline, now, t)
    if (due.overdue) return { tone: 'crit', label: t('마감 지남', 'Overdue'), sub: due.text }
    return {
      tone: due.urgent || status === 'changes_requested' ? 'warn' : 'info',
      label: status === 'changes_requested' ? statusLabel(status, t) : t('입력할 차례', 'Ready to run'),
      sub: due.text,
    }
  }
  if (status === 'processed') return { tone: 'good', label: statusLabel(status, t), sub: t('지급일에 입금', 'Paid on pay day') }
  return { tone: 'info', label: statusLabel(status, t), sub: t('회계법인 확인 중', 'With your CPA') }
}
