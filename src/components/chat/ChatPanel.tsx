import { Bot, Headset, Send, ShieldAlert, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatDate } from '../../lib/format'
import { MAX_CHAT_LENGTH, type ChatMessage } from '../../lib/chat'
import { usePrefs } from '../../prefs'
import type { ChatState } from './useChat'

/** 대화 화면 (고객 채팅 창 · 회계법인 고객사 채팅 탭 공용) */
export default function ChatPanel({ chat, viewer, firmName, compact }: {
  chat: ChatState
  viewer: 'client' | 'firm'
  firmName: string
  compact?: boolean
}) {
  const { t, locale } = usePrefs()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { messages, loaded, sending, aiThinking, error, handoff } = chat

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, aiThinking])

  const submit = async (text = draft) => {
    if (!text.trim() || sending) return
    const ok = await chat.send(text)
    if (ok && text === draft) setDraft('')
    inputRef.current?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  const suggestions = [
    t('다음 급여 마감이 언제예요?', 'When is my next payroll due?'),
    t('새 직원은 어떻게 등록하나요?', 'How do I add a new employee?'),
    t('제출한 급여를 고치고 싶어요', 'I need to fix a payroll I submitted'),
  ]

  const dayKey = (m: ChatMessage) => m.createdAt.slice(0, 10)

  return (
    <div className={`chat-panel${compact ? ' compact' : ''}`}>
      <div className={`chat-mode ${handoff ? 'human' : 'ai'}`} role="status">
        {handoff
          ? <><Headset size={15} aria-hidden /><span className="chat-mode-text">{viewer === 'client'
            ? t(`${firmName} 담당자와 연결됐어요. 업무 시간에 답변드려요.`, `You’re connected with ${firmName}. They’ll reply during business hours.`)
            : t('담당자 응대 중 — AI는 답하지 않아요', 'Staff handling — AI is paused')}</span></>
          : <><Sparkles size={15} aria-hidden /><span className="chat-mode-text">{viewer === 'client'
            ? t('AI 도우미가 먼저 답해요. 필요하면 담당자에게 바로 연결해 드려요.', 'An AI assistant answers first and brings in your CPA when needed.')
            : t('AI가 먼저 답하는 중', 'AI is answering first')}</span></>}
        {viewer === 'client' && !handoff && (
          <button type="button" className="link-btn" onClick={() => void chat.askForPerson()}>{t('담당자 연결', 'Talk to a person')}</button>
        )}
        {viewer === 'firm' && handoff && (
          <button type="button" className="link-btn" onClick={() => void chat.backToAi()}>{t('AI에게 다시 맡기기', 'Hand back to AI')}</button>
        )}
      </div>
      {viewer === 'firm' && handoff && chat.thread?.handoffReason && (
        <p className="chat-reason">{t('연결 사유', 'Reason')}: {chat.thread.handoffReason}</p>
      )}

      <div className="chat-list" ref={listRef} aria-live="polite">
        {!loaded && <p className="muted small chat-empty">{t('불러오는 중…', 'Loading…')}</p>}
        {loaded && messages.length === 0 && (
          <div className="chat-empty">
            <span className="chat-empty-icon"><Bot size={26} aria-hidden /></span>
            {viewer === 'client' ? (
              <>
                <strong>{t('무엇이든 물어보세요', 'Ask us anything')}</strong>
                <p className="muted small">{t('급여 일정, 포털 사용법, 세금 질문 등 AI 도우미가 먼저 답하고, 필요하면 회계법인 담당자가 이어서 도와드려요.', 'Pay schedule, using the portal, tax questions — the AI assistant answers first and your CPA steps in when needed.')}</p>
                <div className="chat-suggest">
                  {suggestions.map((s) => <button key={s} type="button" className="chip" disabled={sending} onClick={() => void submit(s)}>{s}</button>)}
                </div>
              </>
            ) : (
              <p className="muted small">{t('아직 대화가 없어요.', 'No messages yet.')}</p>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender === viewer
          const newDay = i === 0 || dayKey(messages[i - 1]) !== dayKey(m)
          const grouped = !newDay && i > 0 && messages[i - 1].sender === m.sender
          return (
            <div key={m.id} className="chat-item">
              {newDay && <div className="chat-day"><span>{formatDate(new Date(m.createdAt), locale, { month: 'long', day: 'numeric', weekday: 'short' })}</span></div>}
              <div className={`chat-msg ${mine ? 'mine' : 'theirs'} ${m.sender}${grouped ? ' grouped' : ''}`}>
                {!mine && !grouped && (
                  <span className={`chat-avatar ${m.sender}`} aria-hidden>
                    {m.sender === 'ai' ? <Sparkles size={14} /> : m.sender === 'firm' ? 'CPA' : <UserRound size={14} />}
                  </span>
                )}
                <div className="chat-bubble-wrap">
                  {!mine && !grouped && (
                    <span className="chat-author">
                      {m.sender === 'ai' ? t('AI 도우미', 'AI assistant') : m.authorName || (m.sender === 'firm' ? firmName : t('고객', 'Client'))}
                    </span>
                  )}
                  <div className="chat-bubble">{m.body}</div>
                  <time className="chat-time" dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</time>
                </div>
              </div>
            </div>
          )
        })}
        {aiThinking && (
          <div className="chat-msg theirs ai">
            <span className="chat-avatar ai" aria-hidden><Sparkles size={14} /></span>
            <div className="chat-bubble-wrap">
              <span className="chat-author">{t('AI 도우미', 'AI assistant')}</span>
              <div className="chat-bubble typing" aria-label={t('답변 작성 중', 'Typing')}><i /><i /><i /></div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="chat-error" role="alert">{t('문제가 생겼어요', 'Something went wrong')}: {error}</p>}

      <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={viewer === 'client' ? t('메시지를 입력하세요', 'Type a message') : t('고객에게 답장', 'Reply to the client')}
          aria-label={t('메시지', 'Message')}
        />
        <button type="submit" className="btn primary chat-send" disabled={!draft.trim() || sending} aria-label={t('보내기', 'Send')}>
          <Send size={17} aria-hidden />
        </button>
      </form>
      <p className="chat-note"><ShieldAlert size={13} aria-hidden /> {viewer === 'client'
        ? t('SSN·계좌번호는 채팅에 쓰지 마세요. AI 답변은 참고용이며 최종 판단은 회계법인이 합니다.', 'Don’t share SSNs or bank numbers here. AI answers are guidance; your CPA makes the final call.')
        : t('회계법인 답장을 보내면 AI는 멈추고 담당자 응대로 바뀌어요.', 'Replying as staff pauses the AI for this client.')}</p>
    </div>
  )
}
