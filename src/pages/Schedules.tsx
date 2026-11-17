import { ArrowLeft, CalendarPlus, Pencil, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FrequencyBadge from '../components/FrequencyBadge'
import { formatDate } from '../lib/format'
import { fullName, compareByName } from '../lib/names'
import { frequencyInfo, openPeriod, periodsAfter, scheduleOf } from '../lib/paySchedules'
import { parseISODate } from '../lib/schedule'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { PayFrequency, PaySchedule } from '../types'

const FREQS: PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly']

/** 급여 스케줄 관리: 스케줄 보기·추가·수정, 직원을 스케줄에 배정 */
export default function Schedules({ backTo = '/' }: { backTo?: string }) {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const store = useStore()
  const { schedules, employees, company } = store
  const me = session?.name ?? company.ownerName
  const actor = session?.role === 'firm' ? 'firm' : 'client'
  const [now] = useState(() => new Date())
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const active = useMemo(() => employees.filter((e) => e.active).sort(compareByName), [employees])
  const d = (iso: string) => formatDate(parseISODate(iso), locale, { month: 'short', day: 'numeric', weekday: 'short' })

  return (
    <div className="page">
      <header className="page-head">
        <Link to={backTo} className="back-link"><ArrowLeft size={16} aria-hidden /> {t('홈', 'Home')}</Link>
        <h1>{t('급여 스케줄', 'Pay schedules')}</h1>
        <p className="lead">{t('직원마다 급여를 받는 주기가 다르면 스케줄을 추가하고 직원을 배정하세요. 예: 시급 직원은 격주, 사무직은 매월.', 'If groups of employees are paid on different cycles, add a schedule and assign them — e.g. hourly staff biweekly, office staff monthly.')}</p>
      </header>

      <section className="freq-legend card">
        {FREQS.map((f) => (
          <div key={f}><FrequencyBadge frequency={f} size="md" /><small className="muted">{frequencyInfo(f, t).detail}</small></div>
        ))}
      </section>

      <div className="sched-list">
        {schedules.map((s) => {
          const open = openPeriod(s, now)
          const upcoming = [open, ...periodsAfter(s, open, 2)]
          const members = active.filter((e) => scheduleOf(e, schedules)?.id === s.id)
          return (
            <section key={s.id} className={`card sched-card freq-${s.frequency}${s.active ? '' : ' off'}`}>
              {editing === s.id ? (
                <ScheduleForm initial={s} onCancel={() => setEditing(null)} onSave={async (v) => { await store.saveSchedule({ ...v, id: s.id }, me, actor); setEditing(null) }} />
              ) : (
                <>
                  <div className="sched-head">
                    <div>
                      <FrequencyBadge frequency={s.frequency} size="lg" />
                      <h2>{s.name || (s.isDefault ? t('기본 스케줄', 'Default schedule') : frequencyInfo(s.frequency, t).label)}</h2>
                      <p className="muted small">{frequencyInfo(s.frequency, t).detail}{s.frequency === 'weekly' || s.frequency === 'biweekly' ? t(` · 기준 지급일 ${d(s.firstPayDate)}`, ` · first pay date ${d(s.firstPayDate)}`) : ''}{!s.active ? t(' · 사용 안 함', ' · Off') : ''}</p>
                    </div>
                    <div className="row gap">
                      <button type="button" className="btn sm" onClick={() => setEditing(s.id)}><Pencil size={14} aria-hidden /> {t('수정', 'Edit')}</button>
                      {!s.isDefault && (
                        <button
                          type="button"
                          className="btn sm ghost"
                          aria-label={t('삭제', 'Delete')}
                          onClick={() => {
                            if (!window.confirm(t('이 스케줄을 삭제할까요? 배정된 직원은 기본 스케줄로 돌아가요.', 'Delete this schedule? Its employees go back to the default schedule.'))) return
                            void store.removeSchedule(s.id, me, actor)
                          }}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                  <ol className="sched-dates">
                    {upcoming.map((p, i) => (
                      <li key={p.scheduled} className={i === 0 ? 'now' : ''}>
                        <small>{i === 0 ? t('이번 회차', 'This run') : t('다음', 'Next')}{p.changed ? t(' · 변경됨', ' · changed') : ''}</small>
                        <span>{d(p.start)} – {d(p.end)}</span>
                        <strong>{t('지급', 'Pay')} {d(p.payDate)}</strong>
                      </li>
                    ))}
                  </ol>
                  <div className="sched-people">
                    <span><Users size={15} aria-hidden /> {t(`직원 ${members.length}명`, `${members.length} people`)}{members.length ? ': ' : ''}<span className="muted">{members.slice(0, 6).map(fullName).join(', ')}{members.length > 6 ? ' …' : ''}</span></span>
                    {schedules.length > 1 && <button type="button" className="link-btn" onClick={() => setAssigning(assigning === s.id ? null : s.id)}>{t('직원 배정', 'Assign people')}</button>}
                  </div>
                  {assigning === s.id && (
                    <ul className="assign-list">
                      {active.map((e) => {
                        const current = scheduleOf(e, schedules)
                        const here = current?.id === s.id
                        return (
                          <li key={e.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={here}
                                disabled={here && s.isDefault}
                                onChange={() => {
                                  const target = here ? undefined : s.isDefault ? undefined : s.id
                                  store.upsertEmployee({ ...e, scheduleId: target }, me)
                                }}
                              />
                              <span>{fullName(e)}</span>
                              {!here && current && <FrequencyBadge frequency={current.frequency} name={current.name || undefined} size="sm" />}
                            </label>
                          </li>
                        )
                      })}
                      <li className="muted small">{t('체크를 풀면 기본 스케줄로 돌아가요. 이미 입력한 이번 회차 근무시간은 새 스케줄 회차에서 다시 입력해야 해요.', 'Unchecking moves them back to the default. Hours already entered for this run need to be re-entered on the new schedule’s run.')}</li>
                    </ul>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>

      {editing === 'new' ? (
        <section className="card sched-card">
          <ScheduleForm onCancel={() => setEditing(null)} onSave={async (v) => { await store.saveSchedule(v, me, actor); setEditing(null) }} />
        </section>
      ) : (
        <button type="button" className="btn primary" onClick={() => setEditing('new')}><CalendarPlus size={16} aria-hidden /> {t('급여 스케줄 추가', 'Add a pay schedule')}</button>
      )}
    </div>
  )
}

function ScheduleForm({ initial, onSave, onCancel }: {
  initial?: PaySchedule
  onSave: (s: Omit<PaySchedule, 'id' | 'isDefault'>) => Promise<void>
  onCancel: () => void
}) {
  const { t } = usePrefs()
  const [name, setName] = useState(initial?.name ?? '')
  const [frequency, setFrequency] = useState<PayFrequency>(initial?.frequency ?? 'monthly')
  const [first, setFirst] = useState(initial?.firstPayDate ?? '2026-01-09')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchored = frequency === 'weekly' || frequency === 'biweekly'
  const firstPayDate = anchored ? first : frequency === 'monthly' ? '2026-01-31' : '2026-01-15'

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({ name, frequency, firstPayDate, overrides: initial && initial.frequency === frequency && initial.firstPayDate === firstPayDate ? initial.overrides : {}, active: initial?.active ?? true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="sched-form">
      <h2>{initial ? t('스케줄 수정', 'Edit schedule') : t('새 급여 스케줄', 'New pay schedule')}</h2>
      <div className="freq-choices" role="radiogroup" aria-label={t('지급 주기', 'Pay frequency')}>
        {FREQS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={frequency === f} className={`freq-choice freq-${f}${frequency === f ? ' on' : ''}`} onClick={() => setFrequency(f)}>
            <FrequencyBadge frequency={f} />
            <small>{frequencyInfo(f, t).detail}</small>
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>{t('이름 (선택)', 'Name (optional)')}</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('예: 사무직, 주방', 'e.g. Office, Kitchen')} />
        </label>
        {anchored && (
          <label className="field">
            <span>{t('첫 지급일 (이 날부터 같은 요일로 반복)', 'First pay date (repeats on that weekday)')}</span>
            <input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
        )}
      </div>
      {initial && (initial.frequency !== frequency || initial.firstPayDate !== firstPayDate) && Object.keys(initial.overrides).length > 0 && (
        <p className="muted small">{t('주기나 첫 지급일을 바꾸면 회차별로 바꿔 둔 날짜는 지워져요.', 'Changing the cycle clears one-off date changes.')}</p>
      )}
      {error && <p className="de-error" role="alert">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('취소', 'Cancel')}</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={saving || (anchored && !first)}>{saving ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button>
      </div>
    </div>
  )
}
