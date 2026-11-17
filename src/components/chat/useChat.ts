import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askAi, hasUnread, loadMessages, loadThread, markRead, requestHuman, returnToAi, sendMessage, subscribeChat,
  type ChatMessage, type ChatThread,
} from '../../lib/chat'

const POLL_MS = 20_000

/** 한 고객사의 대화: 불러오기 · 실시간 수신 · 보내기 · AI 답변 요청 */
export function useChat(companyId: string, viewer: 'client' | 'firm', authorName: string, open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  const refresh = useCallback(async () => {
    try {
      const [m, th] = await Promise.all([loadMessages(companyId), loadThread(companyId)])
      setMessages(m)
      setThread(th)
      setLoaded(true)
      setError(null)
      if (openRef.current && hasUnread(th, viewer)) {
        await markRead(companyId)
        setThread(await loadThread(companyId))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [companyId, viewer])

  useEffect(() => {
    void refresh()
    let timer: number | undefined
    const unsubscribe = subscribeChat(companyId, () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 150)
    })
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, POLL_MS)
    return () => { unsubscribe(); window.clearInterval(poll); window.clearTimeout(timer) }
  }, [companyId, refresh])

  // 창을 열면 읽음 처리
  useEffect(() => {
    if (open && hasUnread(thread, viewer)) void markRead(companyId).then(refresh).catch(() => {})
  }, [open, thread, viewer, companyId, refresh])

  const send = useCallback(async (body: string) => {
    const text = body.trim()
    if (!text) return false
    setSending(true)
    setError(null)
    try {
      const msg = await sendMessage(companyId, viewer, authorName, text)
      setMessages((m) => [...m, msg])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSending(false)
      return false
    }
    setSending(false)
    if (viewer === 'client' && !thread?.handoffAt) {
      setAiThinking(true)
      try {
        await askAi(companyId)
      } catch {
        // AI 서버에 닿지 못하면 담당자에게 넘김
        await requestHuman(companyId, 'AI unavailable').catch(() => {})
      } finally {
        setAiThinking(false)
      }
    }
    await refresh()
    return true
  }, [companyId, viewer, authorName, thread?.handoffAt, refresh])

  const askForPerson = useCallback(async () => {
    try {
      await requestHuman(companyId, 'Client asked for a person')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [companyId, refresh])

  const backToAi = useCallback(async () => {
    try {
      await returnToAi(companyId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [companyId, refresh])

  return {
    messages, thread, loaded, sending, aiThinking, error,
    unread: hasUnread(thread, viewer),
    handoff: Boolean(thread?.handoffAt),
    send, askForPerson, backToAi, refresh,
  }
}

export type ChatState = ReturnType<typeof useChat>
