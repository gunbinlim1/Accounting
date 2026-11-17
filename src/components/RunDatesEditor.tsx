import { CalendarCog, Check, X } from 'lucide-react'
import { useState } from 'react'
import { validateOverride } from '../lib/paySchedules'
import { usePrefs } from '../prefs'

/** 이번 회차 지급일·급여 기간 바꾸기 (제출 전) */
export default function RunDatesEditor({ payDate, start, end, onSave, onCancel }: {
  payDate: string
  start: string
  end: string
  onSave: (d: { payDate: string; start: string; end: string }) => Promise<void>
  onCancel: () => void
}) {
  const { t } = usePrefs()
  const [d, setD] = useState({ payDate, start, end })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = validateOverride(d, t)
  const unchanged = d.payDate === payDate && d.start === start && d.end === end

  const save = async () => {
    if (problem || unchanged) return
    setSaving(true)
    setError(null)
    try {
      await onSave(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="dates-editor" role="group" aria-label={t('이번 회차 날짜 변경', 'Change this run’s dates')}>
      <p className="de-title"><CalendarCog size={17} aria-hidden /> {t('이번 회차 날짜 변경', 'Change this run’s dates')}</p>
      <p className="muted small">{t('공휴일 등으로 이번 회차만 바꿀 때 쓰세요. 다음 회차부터는 원래 일정대로 돌아가요. 입력해 둔 근무시간은 그대로 옮겨져요.', 'For one-off changes like holidays. Later runs keep the regular schedule, and hours you entered move with it.')}</p>
      <div className="de-grid">
        <label className="field">
          <span>{t('급여 기간 시작', 'Period start')}</span>
          <input type="date" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('급여 기간 끝', 'Period end')}</span>
          <input type="date" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
        </label>
        <label className="field de-pay">
          <span>{t('지급일', 'Pay date')}</span>
          <input type="date" value={d.payDate} onChange={(e) => setD({ ...d, payDate: e.target.value })} />
        </label>
      </div>
      {(problem || error) && <p className="de-error" role="alert">{problem ?? error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}><X size={15} aria-hidden /> {t('취소', 'Cancel')}</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!!problem || unchanged || saving}>
          <Check size={15} aria-hidden /> {saving ? t('저장 중…', 'Saving…') : t('날짜 저장', 'Save dates')}
        </button>
      </div>
    </div>
  )
}
