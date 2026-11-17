/**
 * 고객 ↔ 회계법인 채팅 (Supabase: chat_messages, chat_threads, Edge Function chat-ai)
 * 권한은 DB의 RLS·트리거가 판단합니다. 여기서는 요청만 보냅니다.
 */
import { db } from './supabase'

export type ChatSender = 'client' | 'firm' | 'ai'

export interface ChatMessage {
  id: string
  companyId: string
  sender: ChatSender
  authorName: string
  body: string
  createdAt: string
}

export interface ChatThread {
  companyId: string
  handoffAt: string | null
  handoffReason: string | null
  lastMessageAt: string | null
  lastSender: ChatSender | null
  clientReadAt: string | null
  firmReadAt: string | null
}

interface MessageRow { id: string; company_id: string; sender: ChatSender; author_name: string; body: string; created_at: string }
interface ThreadRow {
  company_id: string; handoff_at: string | null; handoff_reason: string | null; last_message_at: string | null
  last_sender: ChatSender | null; client_read_at: string | null; firm_read_at: string | null
}

const messageFromRow = (r: MessageRow): ChatMessage => ({
  id: r.id, companyId: r.company_id, sender: r.sender, authorName: r.author_name, body: r.body, createdAt: r.created_at,
})
const threadFromRow = (r: ThreadRow): ChatThread => ({
  companyId: r.company_id, handoffAt: r.handoff_at, handoffReason: r.handoff_reason, lastMessageAt: r.last_message_at,
  lastSender: r.last_sender, clientReadAt: r.client_read_at, firmReadAt: r.firm_read_at,
})

export const MAX_CHAT_LENGTH = 4000

export async function loadMessages(companyId: string, limit = 200): Promise<ChatMessage[]> {
  const { data, error } = await db().from('chat_messages').select('id, company_id, sender, author_name, body, created_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data as MessageRow[]).map(messageFromRow).reverse()
}

export async function loadThread(companyId: string): Promise<ChatThread | null> {
  const { data, error } = await db().from('chat_threads').select('*').eq('company_id', companyId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? threadFromRow(data as ThreadRow) : null
}

/** 회계법인: 모든 고객사의 대화 상태 */
export async function loadThreads(): Promise<ChatThread[]> {
  const { data, error } = await db().from('chat_threads').select('*').order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data as ThreadRow[]).map(threadFromRow)
}

export async function sendMessage(companyId: string, sender: Exclude<ChatSender, 'ai'>, authorName: string, body: string): Promise<ChatMessage> {
  const { data, error } = await db().from('chat_messages')
    .insert({ company_id: companyId, sender, author_name: authorName, body: body.slice(0, MAX_CHAT_LENGTH) })
    .select('id, company_id, sender, author_name, body, created_at').single()
  if (error) throw new Error(error.message)
  return messageFromRow(data as MessageRow)
}

/** 고객 메시지에 AI가 답하도록 요청 (담당자 연결 중이면 서버가 건너뜀) */
export async function askAi(companyId: string): Promise<void> {
  const { error } = await db().functions.invoke('chat-ai', { body: { companyId } })
  if (error) throw new Error(error.message)
}

export async function requestHuman(companyId: string, reason?: string): Promise<void> {
  const { error } = await db().rpc('chat_request_human', { p_company_id: companyId, p_reason: reason ?? null })
  if (error) throw new Error(error.message)
}

export async function returnToAi(companyId: string): Promise<void> {
  const { error } = await db().rpc('chat_return_to_ai', { p_company_id: companyId })
  if (error) throw new Error(error.message)
}

export async function markRead(companyId: string): Promise<void> {
  const { error } = await db().rpc('chat_mark_read', { p_company_id: companyId })
  if (error) throw new Error(error.message)
}

/** 새 메시지·상태 변경 실시간 수신. companyId가 없으면 모든 고객사(회계법인) */
export function subscribeChat(companyId: string | null, onChange: () => void): () => void {
  const client = db()
  const filter = companyId ? { filter: `company_id=eq.${companyId}` } : {}
  const channel = client
    .channel(`chat-${companyId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', ...filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads', ...filter }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

/** 상대방 메시지 중 읽지 않은 것이 있는지 */
export function hasUnread(thread: ChatThread | null, viewer: 'client' | 'firm'): boolean {
  if (!thread?.lastMessageAt || !thread.lastSender || thread.lastSender === viewer) return false
  const readAt = viewer === 'client' ? thread.clientReadAt : thread.firmReadAt
  return !readAt || readAt < thread.lastMessageAt
}
