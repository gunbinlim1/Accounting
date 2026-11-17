// 고객 채팅 AI 첫 답변 (Supabase Edge Function, Deno)
//
// 고객이 채팅에 메시지를 쓰면 브라우저가 이 함수를 부릅니다.
// 1) 로그인한 고객의 권한(2단계 인증·회사 소속)은 고객 본인 토큰으로 DB를 읽어 RLS로 확인
// 2) 담당자 연결 중이 아니고, 마지막 메시지가 고객 것일 때만 답변
// 3) Claude가 답변 + "담당자 연결 필요" 여부를 JSON으로 돌려줌 → AI 메시지 저장(service_role), 필요하면 담당자 연결
//
// 필요한 비밀값 (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY
// 선택: FIRM_NAME (기본 "Jae Jin Yang CPA PC")
// SSN·계좌번호·급여 금액 같은 민감 정보는 AI에 보내지 않습니다 (회사 이름·업종·일정·회차 상태·대화만).

import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const MODEL = 'claude-opus-5-5'
const HISTORY = 30
const MAX_AI_PER_HOUR = 30

// src/config/payrollConfig.ts의 companySchedule과 같게 유지
const SCHEDULE = { frequency: 'biweekly', anchor: '2026-01-09' }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface ChatRow { sender: 'client' | 'firm' | 'ai'; author_name: string; body: string; created_at: string }

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Message shown to the client, in the language the client is writing in.' },
    handoff: { type: 'boolean', description: 'true when a person at the CPA firm needs to take over.' },
    handoff_reason: { type: 'string', description: 'Short note for the CPA firm (English or Korean). Empty when handoff is false.' },
  },
  required: ['reply', 'handoff', 'handoff_reason'],
  additionalProperties: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const { companyId } = await req.json().catch(() => ({}))
  if (!auth || typeof companyId !== 'string') return json({ error: 'bad request' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const asServer = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 고객 회사 소속인지 (RLS: 2단계 인증 + 회사 멤버만 읽힘)
  const { data: userData } = await asUser.auth.getUser()
  const user = userData.user
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { data: member } = await asUser.from('company_members').select('company_id').eq('company_id', companyId).eq('user_id', user.id).maybeSingle()
  if (!member) return json({ error: 'forbidden' }, 403)

  const { data: thread } = await asUser.from('chat_threads').select('handoff_at').eq('company_id', companyId).maybeSingle()
  if (thread?.handoff_at) return json({ skipped: 'handoff' })

  const { data: recent, error: msgErr } = await asUser
    .from('chat_messages').select('sender, author_name, body, created_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(HISTORY)
  if (msgErr) return json({ error: msgErr.message }, 500)
  const history = ((recent ?? []) as ChatRow[]).reverse()
  if (history.length === 0 || history[history.length - 1].sender !== 'client') return json({ skipped: 'nothing to answer' })

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await asServer.from('chat_messages').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('sender', 'ai').gte('created_at', hourAgo)
  if ((count ?? 0) >= MAX_AI_PER_HOUR) {
    await handOff(asUser, companyId, 'AI hourly limit reached')
    return json({ skipped: 'rate limit' })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const lastText = history[history.length - 1].body
  const korean = /[가-힣]/.test(lastText)
  if (!apiKey) {
    await postAi(asServer, companyId, korean
      ? '지금은 자동 답변을 준비 중이에요. 회계법인 담당자에게 메시지를 전달했으니 업무 시간에 답변드릴게요.'
      : 'Automatic answers aren’t set up yet. I’ve passed your message to your CPA team, and they’ll reply during business hours.')
    await handOff(asUser, companyId, 'AI not configured (ANTHROPIC_API_KEY missing)')
    return json({ ok: true, handoff: true })
  }

  const context = await companyContext(asUser, companyId)
  const client = new Anthropic({ apiKey })

  let reply: { reply: string; handoff: boolean; handoff_reason: string }
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      system: systemPrompt(Deno.env.get('FIRM_NAME') || 'Jae Jin Yang CPA PC'),
      messages: [
        { role: 'user', content: `<portal_context>\n${context}\n</portal_context>\nThe conversation with the client follows.` },
        ...toMessages(history),
      ],
    })
    if (response.stop_reason === 'refusal') throw new Error('refusal')
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    reply = JSON.parse(text)
    if (typeof reply.reply !== 'string' || !reply.reply.trim()) throw new Error('empty reply')
  } catch (e) {
    console.error('chat-ai', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e))
    reply = {
      reply: korean
        ? '죄송해요, 지금은 답변을 만들지 못했어요. 회계법인 담당자에게 전달했습니다.'
        : 'Sorry, I couldn’t answer that just now. I’ve passed it to your CPA team.',
      handoff: true,
      handoff_reason: 'AI error',
    }
  }

  await postAi(asServer, companyId, reply.reply.slice(0, 4000))
  if (reply.handoff) await handOff(asUser, companyId, reply.handoff_reason || 'AI suggested a person')
  return json({ ok: true, handoff: reply.handoff })
})

// deno-lint-ignore no-explicit-any
type Db = any

async function postAi(db: Db, companyId: string, body: string) {
  const { error } = await db.from('chat_messages').insert({ company_id: companyId, sender: 'ai', author_name: 'AI', body })
  if (error) console.error('chat-ai insert', error.message)
}

async function handOff(db: Db, companyId: string, reason: string) {
  const { error } = await db.rpc('chat_request_human', { p_company_id: companyId, p_reason: reason })
  if (error) console.error('chat-ai handoff', error.message)
}

/** Claude 대화 형식: 고객 = user, AI·회계법인 = assistant (연속 같은 역할은 API가 합침) */
function toMessages(rows: ChatRow[]): Anthropic.Beta.BetaMessageParam[] {
  return rows.map((r) => r.sender === 'client'
    ? { role: 'user' as const, content: r.body }
    : { role: 'assistant' as const, content: r.sender === 'firm' ? `[CPA staff ${r.author_name}] ${r.body}` : r.body })
}

/** 오늘 날짜 (텍사스 중부 시간) */
function todayCentral(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return new Date(`${s}T00:00:00Z`)
}

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

function cutoff(pay: Date, businessDays: number): Date {
  const d = new Date(pay)
  let moved = 0
  while (moved < businessDays) {
    d.setUTCDate(d.getUTCDate() - 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) moved++
  }
  return d
}

async function companyContext(db: Db, companyId: string): Promise<string> {
  const [{ data: c }, { data: runs }, { count: active }] = await Promise.all([
    db.from('companies').select('legal_name, dba, industry, tips_enabled, deposit_schedule, cutoff_business_days, created_at').eq('id', companyId).single(),
    db.from('pay_runs').select('pay_date, status, note').eq('company_id', companyId).order('pay_date', { ascending: false }).limit(4),
    db.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
  ])
  const today = todayCentral()
  const anchor = new Date(`${SCHEDULE.anchor}T00:00:00Z`)
  const step = 14 * DAY
  const k = Math.max(0, Math.ceil((today.getTime() - anchor.getTime()) / step))
  const days = cutoffDays(c)
  const lines = [0, 1, 2].map((i) => {
    const pay = new Date(anchor.getTime() + (k + i) * step)
    const start = new Date(pay.getTime() - 13 * DAY)
    const due = cutoff(pay, days)
    const run = (runs ?? []).find((r: { pay_date: string }) => r.pay_date === iso(pay))
    return `- pay date ${weekday(pay)} ${iso(pay)}, period ${iso(start)}..${iso(pay)}, submit by ${weekday(due)} ${iso(due)} 3:00 PM Central, status: ${run?.status ?? 'draft (not submitted)'}${i === 0 ? ' (current)' : ''}`
  })
  const past = (runs ?? []).filter((r: { pay_date: string }) => r.pay_date < iso(today))
    .map((r: { pay_date: string; status: string }) => `- ${r.pay_date}: ${r.status}`)
  return [
    `Today (Texas): ${weekday(today)} ${iso(today)}`,
    `Company: ${c?.dba || c?.legal_name} (legal name ${c?.legal_name}), industry: ${c?.industry}, tipped employees: ${c?.tips_enabled ? 'yes' : 'no'}, active employees: ${active ?? 0}`,
    `Pay schedule: ${SCHEDULE.frequency}, Fridays. Submit hours by ${days} business days before pay date, 3:00 PM Central.`,
    `Federal tax deposit schedule: ${c?.deposit_schedule}`,
    'Upcoming pay periods:',
    ...lines,
    past.length ? 'Recent past runs:' : 'No past runs recorded yet.',
    ...past,
  ].join('\n')
}

function cutoffDays(c: { cutoff_business_days?: number } | null): number {
  return typeof c?.cutoff_business_days === 'number' ? c.cutoff_business_days : 2
}

function systemPrompt(firm: string): string {
  return `You are the first-line assistant in the payroll portal of ${firm}, a Texas CPA firm. The people writing to you are the firm's clients: business owners or their office staff (restaurants, service, retail, manufacturing). The firm reviews and processes their payroll, deposits payroll taxes, and files Forms 941, 940, W-2/W-3 and Texas TWC C-3 for them as their reporting agent.

How the portal works, so you can guide clients:
- Home shows the payroll schedule: process-by deadline, status, pay period and pay date for the current and next pay periods.
- "Run payroll" (/run): the client enters hours, overtime, tips and fringe benefits per employee, reviews, then submits to the CPA. They can recall a submission until the CPA starts reviewing. The CPA may send it back with "changes requested".
- "Employees": add or edit employees, W-4 and I-9 details, direct deposit, document uploads.
- "History": past pay runs and pay stubs. "Taxes": deposits and filing deadlines handled by the CPA. "Company": company details and authorizations (Form 8655 reporting agent, TWC).
- Past pay periods cannot be entered in the portal; the CPA handles those.

How to answer:
- Reply in the language the client writes in (Korean or English). Keep it short and friendly: a few sentences or a short list. Plain words, no jargon unless the client uses it.
- Use <portal_context> for dates and status. Never invent numbers, amounts, or statuses you don't have.
- General payroll questions (federal withholding, FICA, FUTA, Texas TWC, tips, overtime, deadlines) can be answered at a general level. Say when the firm should confirm for their specific case.
- Never ask for or repeat Social Security numbers, bank routing/account numbers, passwords or 2-step codes in chat. If a client shares one, tell them not to send it in chat and to use the secure employee form instead.
- You cannot change anything in the portal or in their payroll; you can only explain.

Set handoff to true (and say a person from the firm will follow up during business hours) when:
- the client asks for a person, a call, or a meeting;
- they need something changed after submitting, a missed or late payroll, an off-cycle or correction run, a tax notice from IRS or TWC, penalties, or a billing question;
- the answer depends on facts or judgment only the firm has (their filings, their account, legal or tax advice for their situation);
- they are upset or the issue is urgent (for example, employees not paid);
- you are not sure.
Otherwise set handoff to false. handoff_reason is a short note for the firm about what the client needs.`
}
