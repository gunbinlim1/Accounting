import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 연결 설정 (빌드 시 환경 변수)
 * - VITE_SUPABASE_URL: https://<project>.supabase.co
 * - VITE_SUPABASE_ANON_KEY: 공개(anon) 키 — 브라우저에 노출돼도 되는 키. 데이터 보호는 RLS가 담당
 * service_role 키는 절대 여기에 넣지 않습니다.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

/** 설정이 없으면 화면에서 안내하므로, 여기까지 왔다면 반드시 있음 */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** 회계법인 이름 (로그인 화면·사이드바 표시) */
export const firmName = (import.meta.env.VITE_FIRM_NAME as string | undefined)?.trim() || 'Payday'

/** 파일 저장 버킷 */
export const DOCS_BUCKET = 'payroll-docs'
