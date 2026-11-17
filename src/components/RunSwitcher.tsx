import { formatDate } from '../lib/format'
import { parseISODate } from '../lib/schedule'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import FrequencyBadge from './FrequencyBadge'
import { StatusBadge } from './RunStatus'

/** 열린 회차가 여러 개(스케줄이 여러 개)일 때 어느 회차를 볼지 고름 */
export default function RunSwitcher() {
  const { t, locale } = usePrefs()
  const { openRuns, payDate, selectRun, schedules } = useStore()
  if (openRuns.length < 2) return null
  return (
    <div className="run-switcher" role="tablist" aria-label={t('급여 회차 선택', 'Choose a payroll')}>
      {openRuns.map((r) => (
        <button key={r.payDate} type="button" role="tab" aria-selected={r.payDate === payDate} className={r.payDate === payDate ? 'on' : ''} onClick={() => selectRun(r.payDate)}>
          <span className="rs-badges">
            {r.schedules.map(({ schedule: s }) => <FrequencyBadge key={s.id} frequency={s.frequency} name={schedules.length > 1 ? s.name || undefined : undefined} size="sm" />)}
          </span>
          <strong>{t('지급일', 'Pay date')} {formatDate(parseISODate(r.payDate), locale, { month: 'short', day: 'numeric', weekday: 'short' })}</strong>
          <RunStatusOf payDate={r.payDate} />
        </button>
      ))}
    </div>
  )
}

function RunStatusOf({ payDate }: { payDate: string }) {
  const { openStatus } = useStore()
  return <StatusBadge status={openStatus(payDate)} />
}
