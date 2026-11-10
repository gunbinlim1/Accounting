import { Check, MessageSquareWarning } from 'lucide-react'
import { formatDate } from '../lib/format'
import { statusLabel, statusTone } from '../lib/runStatus'
import { usePrefs } from '../prefs'
import type { ActivityEvent, RunStatus } from '../types'

export function StatusBadge({ status }: { status: RunStatus }) {
  const { t } = usePrefs()
  return <span className={`status-badge ${statusTone(status)}`}><span className="dot" />{statusLabel(status, t)}</span>
}

/** 작성 → 제출 → 회계법인 검토 → 처리 완료 진행 표시 */
export function StatusTimeline({ status, submittedAt }: { status: RunStatus; submittedAt?: string }) {
  const { t, locale } = usePrefs()
  const order: RunStatus[] = ['draft', 'submitted', 'in_review', 'processed']
  const idx = status === 'changes_requested' ? 2 : order.indexOf(status)
  const steps = [
    { label: t('작성', 'Prepare'), sub: t('근무·팁 입력', 'Hours & tips') },
    { label: t('제출', 'Submit'), sub: submittedAt ? formatDate(new Date(submittedAt), locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('고객', 'Client') },
    { label: status === 'changes_requested' ? t('수정 요청', 'Changes requested') : t('회계법인 검토', 'CPA review'), sub: t('회계법인', 'CPA firm') },
    { label: t('처리 완료', 'Processed'), sub: t('급여명세서 발행', 'Stubs issued') },
  ]
  return (
    <ol className="status-timeline">
      {steps.map((s, i) => {
        const state = i < idx || status === 'processed' ? 'done' : i === idx ? (status === 'changes_requested' ? 'warn' : 'current') : ''
        return (
          <li key={i} className={state}>
            <span className="tl-dot">{state === 'done' ? <Check size={13} /> : state === 'warn' ? <MessageSquareWarning size={13} /> : i + 1}</span>
            <span className="tl-text">
              <strong>{s.label}</strong>
              <small>{s.sub}</small>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 고객·회계법인 활동 기록 */
export function ActivityList({ items, limit }: { items: ActivityEvent[]; limit?: number }) {
  const { t, lang, locale } = usePrefs()
  const shown = limit ? items.slice(0, limit) : items
  if (shown.length === 0) return <p className="muted small">{t('아직 기록이 없습니다.', 'No activity yet.')}</p>
  return (
    <ul className="activity">
      {shown.map((a) => (
        <li key={a.id} className={a.kind}>
          <span className={`act-avatar ${a.actor}`}>{a.actor === 'firm' ? 'CPA' : a.actorName.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
          <div>
            <p>{lang === 'ko' ? a.ko : a.en}</p>
            <small>
              {a.actorName} · {formatDate(new Date(a.at), locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </small>
          </div>
        </li>
      ))}
    </ul>
  )
}
