import { AlertTriangle, CalendarClock, MessageCircle, Settings2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/format'
import { cutoffOf, openPeriod, periodsAfter, periodsBefore } from '../lib/paySchedules'
import { daysBetween, parseISODate, toISODate } from '../lib/schedule'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import FrequencyBadge from './FrequencyBadge'

/** 홈 화면: 스케줄마다 이번 회차 다음의 급여 일정 한 줄 + 처리 안 된 지난 회차 알림 (이번 회차는 위 히어로 카드) */
export default function PayrollSchedule({ now, onAsk, manageTo = '/schedules' }: { now: Date; onAsk?: () => void; manageTo?: string }) {
  const { t, locale } = usePrefs()
  const { company, runs, schedules, employees } = useStore()

  const rows = useMemo(() => {
    const done = new Set(runs.map((r) => r.payDate))
    const companySince = company.createdAt ? toISODate(new Date(company.createdAt)) : null
    return schedules.filter((s) => s.active).map((s) => {
      const open = openPeriod(s, now)
      // 기본 스케줄은 회사 가입일부터, 추가 스케줄은 만든 날부터
      const scheduleSince = !s.isDefault && s.createdAt ? toISODate(new Date(s.createdAt)) : null
      const since = [companySince, scheduleSince].filter(Boolean).sort().pop() ?? null
      const missed = since ? periodsBefore(s, open, since, 3).filter((p) => !done.has(p.payDate)).reverse() : []
      const people = employees.filter((e) => e.active && (e.scheduleId === s.id || (!e.scheduleId && s.isDefault))).length
      return { schedule: s, next: periodsAfter(s, open, 1)[0], missed, people }
    })
  }, [schedules, runs, employees, company.createdAt, now])

  const day = (iso: string) => formatDate(parseISODate(iso), locale, { month: 'short', day: 'numeric' })
  const dayW = (iso: string) => formatDate(parseISODate(iso), locale, { month: 'short', day: 'numeric', weekday: 'short' })
  const missed = [...new Map(rows.flatMap((r) => r.missed).map((m) => [m.payDate, m])).values()].sort((a, b) => a.payDate.localeCompare(b.payDate))
  const multi = rows.length > 1

  return (
    <section className="card schedule-card" aria-labelledby="schedule-title">
      <div className="schedule-head">
        <h2 id="schedule-title"><CalendarClock size={19} aria-hidden /> {t('다음 급여 일정', 'Next payroll')}</h2>
        <span className="schedule-head-right">
          <span className="muted small">{t(`마감: 지급일 ${company.cutoffBusinessDays}영업일 전 오후 3시`, `Due ${company.cutoffBusinessDays} business days before pay day, 3 PM`)}</span>
          <Link to={manageTo} className="btn sm"><Settings2 size={14} aria-hidden /> {t('급여 스케줄 관리·추가', 'Manage pay schedules')}</Link>
        </span>
      </div>

      {missed.length > 0 && (
        <div className="schedule-alert" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>
            <strong>{t(`처리되지 않은 지난 급여 ${missed.length}회차`, `${missed.length} past payroll(s) not run`)}</strong>
            <small>{t('지급일', 'Pay date')} {missed.map((m) => day(m.payDate)).join(', ')} · {t('회계법인이 따로 처리해 드려요', 'Your CPA can run these for you')}</small>
          </span>
          {onAsk && <button type="button" className="btn sm" onClick={onAsk}><MessageCircle size={14} aria-hidden /> {t('문의하기', 'Ask your CPA')}</button>}
        </div>
      )}

      <div className="schedule-list">
        {rows.map(({ schedule, next, people }) => {
          const dLeft = daysBetween(now, parseISODate(next.payDate))
          const cutoff = cutoffOf(next.payDate, company.cutoffBusinessDays)
          const weeks = Math.max(1, Math.round(daysBetween(now, cutoff) / 7))
          return (
            <article key={schedule.id} className={`next-run tone-next freq-row freq-${schedule.frequency}`}>
              <div className="nr-status">
                <FrequencyBadge frequency={schedule.frequency} name={multi ? schedule.name || (schedule.isDefault ? t('기본', 'Default') : undefined) : undefined} size="lg" />
                <span className="nr-state"><strong>{t('다음 회차', 'Next period')}</strong>{next.changed && <span className="tag warn">{t('날짜 변경됨', 'Changed')}</span>}</span>
                <small>{multi ? t(`직원 ${people}명 · `, `${people} people · `) : ''}{t(`약 ${weeks}주 뒤 마감`, `due in ~${weeks} weeks`)}</small>
              </div>
              <dl className="nr-facts">
                <div className="nr-period">
                  <dt>{t('급여 기간', 'Pay period')}</dt>
                  <dd><strong>{day(next.start)} – {day(next.end)}</strong></dd>
                </div>
                <div>
                  <dt>{t('처리 마감', 'Process by')}</dt>
                  <dd>{formatDate(cutoff, locale, { month: 'short', day: 'numeric', weekday: 'short' })} <span>{cutoff.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span></dd>
                </div>
                <div>
                  <dt>{t('지급일', 'Pay date')}</dt>
                  <dd><strong className="nr-payday">{dayW(next.payDate)}</strong> <span className="nr-dday">D-{dLeft}</span></dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}
