import { ArrowRight, Headset, MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { hasUnread, loadThreads, subscribeChat, type ChatThread } from '../../lib/chat'
import { formatDate } from '../../lib/format'
import { usePortal } from '../../portal'
import { usePrefs } from '../../prefs'

/** 회계법인 대기열: 답변이 필요한 고객 채팅 */
export default function FirmChatInbox() {
  const { t, locale } = usePrefs()
  const { companies } = usePortal()
  const [threads, setThreads] = useState<ChatThread[]>([])

  const refresh = useCallback(() => { loadThreads().then(setThreads).catch(() => {}) }, [])
  useEffect(() => {
    refresh()
    const unsubscribe = subscribeChat(null, refresh)
    const poll = window.setInterval(refresh, 30_000)
    return () => { unsubscribe(); window.clearInterval(poll) }
  }, [refresh])

  const open = threads
    .filter((th) => th.handoffAt || hasUnread(th, 'firm'))
    .map((th) => ({ th, company: companies.find((c) => c.company.id === th.companyId)?.company }))
    .filter((x) => x.company)
    .sort((a, b) => Number(Boolean(b.th.handoffAt)) - Number(Boolean(a.th.handoffAt)) || (b.th.lastMessageAt ?? '').localeCompare(a.th.lastMessageAt ?? ''))

  if (open.length === 0) return null
  const waiting = open.filter((x) => x.th.handoffAt && x.th.lastSender !== 'firm').length

  return (
    <section className="card chat-inbox" aria-live="polite">
      <div className="card-head">
        <h2><MessageCircle size={18} aria-hidden /> {t('고객 채팅', 'Client chats')}</h2>
        {waiting > 0 && <span className="badge warn">{t(`답변 대기 ${waiting}`, `${waiting} awaiting reply`)}</span>}
      </div>
      <ul className="new-client-list">
        {open.map(({ th, company }) => (
          <li key={th.companyId}>
            <Link to={`/firm/c/${th.companyId}/chat`} className="new-client-name">
              <strong>
                {company!.dba}{' '}
                {th.handoffAt
                  ? <span className="badge warn"><Headset size={12} aria-hidden />&nbsp;{t('담당자 요청', 'Needs a person')}</span>
                  : <span className="badge good">{t('AI 응대 · 새 메시지', 'AI handled · new')}</span>}
              </strong>
              <small className="muted">
                {th.handoffReason ? `${th.handoffReason} · ` : ''}
                {th.lastMessageAt ? formatDate(new Date(th.lastMessageAt), locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
              </small>
            </Link>
            <Link to={`/firm/c/${th.companyId}/chat`} className="btn sm">{t('열기', 'Open')} <ArrowRight size={14} aria-hidden /></Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
