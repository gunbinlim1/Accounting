import { AlertTriangle, CalendarClock, MessageCircle } from 'lucide-react'
import { useMemo } from 'react'
import { companySchedule } from '../config/payrollConfig'
import { formatDate } from '../lib/format'
import { buildSchedule } from '../lib/payrollSchedule'
import { daysBetween, frequencyLabel, parseISODate } from '../lib/schedule'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { PayFrequency } from '../types'

/** 회사에 설정된 급여 스케줄 (지금은 1개, 여러 개가 되면 여기에 추가) */
const schedules: { id: string; frequency: PayFrequency; anchor: string }[] = [
  { id: 'main', frequency: companySchedule.frequency, anchor: companySchedule.anchorDate },
]

/** 홈 화면: 스케줄마다 이번 회차 다음의 급여 일정 한 줄 + 처리 안 된 지난 회차 알림 (이번 회차는 위 히어로 카드) */
export default function PayrollSchedule({ now, onAsk }: { now: Date; onAsk?: () => void }) {
  const { t, locale } = usePrefs()
  const { company, payDate, runs } = useStore()

  const rows = useMemo(
    () => schedules.map((s) => {
      const all = buildSchedule({
        frequency: s.frequency,
        anchor: parseISODate(s.anchor),
        currentPayDate: parseISODate(payDate),
        createdAt: company.createdAt,
        processedPayDates: runs.map((r) => r.payDate),
        cutoffBusinessDays: company.cutoffBusinessDays,
        upcoming: 1,
      })
      return { schedule: s, next: all.find((r) => r.kind === 'upcoming')!, missed: all.filter((r) => r.kind === 'missed') }
    }),
    [payDate, company.createdAt, company.cutoffBusinessDays, runs],
  )

  const day = (d: Date) => formatDate(d, locale, { month: 'short', day: 'numeric' })
  const dayW = (d: Date) => formatDate(d, locale, { month: 'short', day: 'numeric', weekday: 'short' })
  const missed = rows.flatMap((r) => r.missed)

  return (
    <section className="card schedule-card" aria-labelledby="schedule-title">
      <div className="schedule-head">
        <h2 id="schedule-title"><CalendarClock size={19} aria-hidden /> {t('다음 급여 일정', 'Next payroll')}</h2>
        <span className="muted small">{t(`마감: 지급일 ${company.cutoffBusinessDays}영업일 전 오후 3시`, `Due ${company.cutoffBusinessDays} business days before pay day, 3 PM`)}</span>
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
        {rows.map(({ schedule, next }) => {
          const dLeft = daysBetween(now, next.payDate)
          const weeks = Math.round(daysBetween(now, next.cutoff) / 7)
          return (
            <article key={schedule.id} className="next-run tone-next">
              <div className="nr-status">
                <span className="nr-freq">{frequencyLabel(schedule.frequency, t)}</span>
                <span className="nr-state"><CalendarClock size={18} aria-hidden /><strong>{t('다음 회차', 'Next period')}</strong></span>
                <small>{t(`이번 회차 지급 후 입력 · 약 ${weeks}주 뒤 마감`, `Opens after this pay day · due in ~${weeks} weeks`)}</small>
              </div>
              <dl className="nr-facts">
                <div className="nr-period">
                  <dt>{t('급여 기간', 'Pay period')}</dt>
                  <dd><strong>{day(next.start)} – {day(next.end)}</strong></dd>
                </div>
                <div>
                  <dt>{t('처리 마감', 'Process by')}</dt>
                  <dd>{dayW(next.cutoff)} <span>{next.cutoff.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span></dd>
                </div>
                <div>
                  <dt>{t('지급일', 'Pay date')}</dt>
                  <dd>{dayW(next.payDate)} <span className="nr-dday">D-{dLeft}</span></dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}
