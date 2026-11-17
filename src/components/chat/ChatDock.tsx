import { MessageCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { firmName } from '../../lib/supabase'
import { usePrefs } from '../../prefs'
import ChatPanel from './ChatPanel'
import { OPEN_CHAT_EVENT } from './events'
import { useChat } from './useChat'

/** 고객 화면 오른쪽 아래 채팅 버튼 + 창 */
export default function ChatDock({ companyId, authorName }: { companyId: string; authorName: string }) {
  const { t } = usePrefs()
  const [open, setOpen] = useState(false)
  const chat = useChat(companyId, 'client', authorName, open)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_CHAT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {open && (
        <section className="chat-dock" role="dialog" aria-label={t('회계법인 채팅', 'Chat with your CPA')}>
          <header className="chat-dock-head">
            <div>
              <strong>{t('회계법인 채팅', 'Chat with your CPA')}</strong>
              <small>{firmName}</small>
            </div>
            <button type="button" className="round-btn" onClick={() => setOpen(false)} aria-label={t('닫기', 'Close')}><X size={18} /></button>
          </header>
          <ChatPanel chat={chat} viewer="client" firmName={firmName} compact />
        </section>
      )}
      <button
        type="button"
        className={`chat-fab${open ? ' hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={chat.unread ? t('채팅 (새 메시지)', 'Chat (new message)') : t('채팅', 'Chat')}
      >
        <MessageCircle size={22} aria-hidden />
        <span className="chat-fab-label">{t('문의하기', 'Chat')}</span>
        {chat.unread && <span className="chat-fab-dot" aria-hidden />}
      </button>
    </>
  )
}
