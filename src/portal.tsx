import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { companySchedule } from './config/payrollConfig'
import { createClientCompany, deleteCompany, loadCompanies, resolveSession, runWrite, uploadDoc } from './lib/db/api'
import { companyToRow, withoutSecrets } from './lib/db/mappers'
import { planWrites, type Write } from './lib/db/plan'
import { nextPayDate, parseISODate, toISODate } from './lib/schedule'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { Company, CompanyData, CompanyDoc, Session } from './types'

export const currentPayDate = (from = new Date()) =>
  toISODate(nextPayDate(companySchedule.frequency, parseISODate(companySchedule.anchorDate), from))

/**
 * 로그인 상태
 * - unconfigured: Supabase 설정(환경 변수)이 없음
 * - signed_out: 로그인 전
 * - mfa: 비밀번호는 확인됐고 2단계 인증(등록 또는 코드 입력)이 남음
 * - recovery: 비밀번호 재설정 링크로 들어옴
 * - no_role: 로그인했지만 연결된 회사·직원 기록이 없음
 * - ready: 데이터를 불러옴
 */
export type AuthStatus = 'loading' | 'unconfigured' | 'signed_out' | 'mfa' | 'recovery' | 'no_role' | 'ready' | 'error'

/** 가입 목적 (가입 시 user_metadata.intent) — 회사가 없을 때 어디로 보낼지 정함 */
export type SignupIntent = 'client' | 'employee' | 'firm'

interface Portal {
  status: AuthStatus
  session: Session | null
  /** 로그인한 계정 이메일 (역할이 없어도) */
  email: string
  /** 가입 목적: client면 회사가 없을 때 회사 포털 만들기로 안내 */
  intent: SignupIntent
  companies: CompanyData[]
  /** 저장 중인 변경이 있음 */
  saving: boolean
  error: string | null
  dismissError: () => void
  /** 화면 상태를 바꾸고, 바뀐 부분을 DB에 저장 */
  updateCompany: (id: string, fn: (c: CompanyData) => CompanyData) => void
  /** 회계법인: 새 고객사 (+ 첨부 서류 업로드) → 새 ID */
  createCompany: (c: Company, files: Partial<Record<CompanyDoc['kind'], File>>) => Promise<string>
  removeCompany: (id: string) => Promise<void>
  /** 로그인·2단계 인증 직후 다시 판단 */
  refreshAuth: () => Promise<void>
  reload: () => Promise<void>
  logout: () => Promise<void>
}

const PortalContext = createContext<Portal | null>(null)

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function PortalProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? 'loading' : 'unconfigured')
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [intent, setIntent] = useState<SignupIntent>('client')
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /** 최신 화면 상태 (연속된 변경이 서로 덮어쓰지 않도록 즉시 갱신) */
  const companiesRef = useRef<CompanyData[]>([])

  const reload = useCallback(async () => {
    const list = await loadCompanies(currentPayDate())
    companiesRef.current = list
    setCompanies(list)
  }, [])

  const evaluate = useCallback(async () => {
    if (!supabase) return
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setSession(null)
        companiesRef.current = []
        setCompanies([])
        setStatus('signed_out')
        return
      }
      setEmail(data.session.user.email ?? '')
      const meta = data.session.user.user_metadata as { intent?: SignupIntent } | undefined
      setIntent(meta?.intent ?? 'client')
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal.data?.currentLevel !== 'aal2') {
        setStatus('mfa')
        return
      }
      const s = await resolveSession()
      setSession(s)
      if (!s) {
        setStatus('no_role')
        return
      }
      await reload()
      setStatus('ready')
    } catch (e) {
      setError(errText(e))
      setStatus('error')
    }
  }, [reload])

  useEffect(() => {
    if (!supabase) return
    void evaluate()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('recovery')
      else if (event === 'SIGNED_OUT') {
        setSession(null)
        setCompanies([])
        setStatus('signed_out')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [evaluate])

  // ── 저장 대기열: 한 번에 하나씩 순서대로. 근무 입력만 바뀐 경우는 잠깐 모아서 저장
  const chain = useRef<Promise<void>>(Promise.resolve())
  const timeBuffer = useRef(new Map<string, Write>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enqueue = useCallback(
    (writes: Write[]) => {
      if (!writes.length) return
      setPending((n) => n + 1)
      chain.current = chain.current
        .then(async () => {
          for (const w of writes) await runWrite(w)
        })
        .catch(async (e) => {
          setError(errText(e))
          // 실패하면 DB 기준으로 화면을 되돌림
          await reload().catch(() => {})
        })
        .finally(() => setPending((n) => n - 1))
    },
    [reload],
  )

  const flushTime = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const writes = [...timeBuffer.current.values()]
    timeBuffer.current.clear()
    enqueue(writes)
  }, [enqueue])

  const save = useCallback(
    (writes: Write[]) => {
      if (!writes.length) return
      if (writes.every((w) => w.kind === 'time')) {
        for (const w of writes) if (w.kind === 'time') timeBuffer.current.set(`${w.row.company_id}|${w.row.pay_date}|${w.row.employee_id}`, w)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flushTime, 600)
        return
      }
      // 회차 상태 변경 등은 모아 둔 입력을 먼저 저장한 뒤 실행
      if (timeBuffer.current.size) flushTime()
      enqueue(writes)
    },
    [enqueue, flushTime],
  )

  const updateCompany = useCallback(
    (id: string, fn: (c: CompanyData) => CompanyData) => {
      const prev = companiesRef.current.find((c) => c.company.id === id)
      if (!prev) return
      const next = fn(prev)
      const writes = planWrites(prev, next)
      // 전체 SSN·계좌번호는 저장 요청에만 담고 화면 상태에서는 바로 지움
      const clean: CompanyData = writes.some((w) => w.kind === 'secrets') ? { ...next, employees: next.employees.map(withoutSecrets) } : next
      companiesRef.current = companiesRef.current.map((c) => (c.company.id === id ? clean : c))
      setCompanies(companiesRef.current)
      save(writes)
    },
    [save],
  )

  const createCompany = useCallback(
    async (c: Company, files: Partial<Record<CompanyDoc['kind'], File>>) => {
      const row = { ...companyToRow(c), documents: [] }
      const id = await createClientCompany(row)
      const docs: CompanyDoc[] = []
      for (const d of c.documents ?? []) {
        const file = files[d.kind]
        docs.push(file ? { ...d, path: await uploadDoc(id, 'company', file) } : d)
      }
      if (docs.length) await runWrite({ kind: 'company', id, row: { ...row, documents: docs } })
      await reload()
      return id
    },
    [reload],
  )

  const value = useMemo<Portal>(
    () => ({
      status,
      session,
      email,
      intent,
      companies,
      saving: pending > 0,
      error,
      dismissError: () => setError(null),
      updateCompany,
      createCompany,
      removeCompany: async (id) => {
        await deleteCompany(id)
        companiesRef.current = companiesRef.current.filter((x) => x.company.id !== id)
        setCompanies(companiesRef.current)
      },
      refreshAuth: evaluate,
      reload,
      logout: async () => {
        if (timeBuffer.current.size) flushTime()
        await chain.current
        await supabase?.auth.signOut()
      },
    }),
    [status, session, email, intent, companies, pending, error, updateCompany, createCompany, evaluate, reload, flushTime],
  )

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal(): Portal {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider')
  return ctx
}
