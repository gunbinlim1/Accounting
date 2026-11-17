import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Hourglass, MessageCircle, PenLine } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { companySchedule } from '../config/payrollConfig'
import { formatDate } from '../lib/format'
import { buildSchedule } from '../lib/payrollSchedule'
import { statusLabel, timeLeft } from '../lib/runStatus'
import { daysBetween, frequencyLabel, parseISODate } from '../lib/schedule'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { PayFrequency, RunStatus } from '../types'

type Tone = 'crit' | 'warn' | 'todo' | 'wait' | 'good'
type T = (ko: string, en: string) => string

/** 회사에 설정된 급여 스케줄 (지금은 1개, 여러 개가 되면 여기에 추가) */
const schedules: { id: string; frequency: PayFrequency; anchor: string }[] = [
  { id: 'main', frequency: companySchedule.frequency, anchor: companySchedule.anchorDate },
]

/** 홈 화면: 스케줄마다 다음 급여일 한 줄 + 처리 안 된 지난 회차 알림 */
export default function PayrollSchedule({ now, onAsk }: { now: Date; onAsk?: () => void }) {
  const { t, locale } = usePrefs()
  const { company, payDate, status, runs, deadline } = useStore()

  const rows = useMemo(
    () => schedules.map((s) => {
      const all = buildSchedule({
        frequency: s.frequency,
        anchor: parseISODate(s.anchor),
        currentPayDate: parseISODate(payDate),
        createdAt: company.createdAt,
        processedPayDates: runs.map((r) => r.payDate),
        cutoffBusinessDays: company.cutoffBusinessDays,
        upcoming: 0,
      })
      return { schedule: s, next: all.find((r) => r.kind === 'current')!, missed: all.filter((r) => r.kind === 'missed') }
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
          const s = stateOf(status, deadline, now, t)
          const dLeft = daysBetween(now, next.payDate)
          const editable = status === 'draft' || status === 'changes_requested'
          return (
            <article key={schedule.id} className={`next-run tone-${s.tone}`}>
              <div className="nr-status">
                <span className="nr-freq">{frequencyLabel(schedule.frequency, t)}</span>
                <span className="nr-state">{s.icon}<strong>{s.label}</strong></span>
                <small>{s.sub}</small>
              </div>
              <dl className="nr-facts">
                <div className="nr-due">
                  <dt>{t('처리 마감', 'Process by')}</dt>
                  <dd><strong>{dayW(next.cutoff)}</strong> <span>{next.cutoff.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span></dd>
                </div>
                <div className="nr-period">
                  <dt>{t('급여 기간', 'Pay period')}</dt>
                  <dd>{day(next.start)} – {day(next.end)}</dd>
                </div>
                <div>
                  <dt>{t('지급일', 'Pay date')}</dt>
                  <dd><strong>{dayW(next.payDate)}</strong> <span className="nr-dday">{dLeft === 0 ? t('오늘', 'Today') : `D-${dLeft}`}</span></dd>
                </div>
              </dl>
              <Link to="/run" className={`btn ${editable ? 'primary' : ''} nr-action`}>
                {editable ? t('급여 입력', 'Run payroll') : t('내역 보기', 'View')} <ArrowRight size={16} aria-hidden />
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function stateOf(status: RunStatus, deadline: Date, now: Date, t: T): { tone: Tone; label: string; sub: string; icon: ReactNode } {
  if (status === 'draft' || status === 'changes_requested') {
    const due = timeLeft(deadline, now, t)
    if (due.overdue) return { tone: 'crit', label: t('마감 지남', 'Overdue'), sub: t(`${due.text} · 바로 제출하세요`, `${due.text} · submit now`), icon: <AlertTriangle size={18} aria-hidden /> }
    if (status === 'changes_requested') return { tone: 'warn', label: statusLabel(status, t), sub: t(`마감까지 ${due.text}`, `${due.text} to deadline`), icon: <AlertTriangle size={18} aria-hidden /> }
    return { tone: due.urgent ? 'warn' : 'todo', label: t('입력할 차례', 'Your turn'), sub: t(`마감까지 ${due.text}`, `${due.text} to deadline`), icon: <PenLine size={18} aria-hidden /> }
  }
  if (status === 'processed') return { tone: 'good', label: statusLabel(status, t), sub: t('지급일에 입금돼요', 'Paid on pay day'), icon: <CheckCircle2 size={18} aria-hidden /> }
  return { tone: 'wait', label: statusLabel(status, t), sub: t('회계법인이 확인 중이에요', 'Your CPA has it'), icon: <Hourglass size={18} aria-hidden /> }
}
