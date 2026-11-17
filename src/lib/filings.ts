/**
 * 신고서 보관함: 회계법인이 실제 제출한 신고서 PDF를 올리고, 고객이 내려받음.
 * 권한(회계법인만 올리기·삭제)은 DB의 RLS·트리거·저장소 정책이 판단합니다.
 */
import { DOCS_BUCKET, db } from './supabase'

export type FilingForm = '941' | 'C-3' | '940' | 'W-2' | 'W-3' | '8027' | 'other'

export interface Filing {
  id: string
  form: FilingForm
  /** 'YYYY-Qn' 또는 'YYYY' */
  period: string
  title: string
  fileName: string
  path: string
  filedOn: string | null
  employeeId: string | null
  createdAt: string
}

interface FilingRow {
  id: string; form: FilingForm; period: string; title: string; file_name: string; path: string
  filed_on: string | null; employee_id: string | null; created_at: string
}

const fromRow = (r: FilingRow): Filing => ({
  id: r.id, form: r.form, period: r.period, title: r.title, fileName: r.file_name, path: r.path,
  filedOn: r.filed_on, employeeId: r.employee_id, createdAt: r.created_at,
})

/** 분기 신고서 / 연간 신고서 구분 */
export const QUARTERLY_FORMS: FilingForm[] = ['941', 'C-3']
export const ANNUAL_FORMS: FilingForm[] = ['940', 'W-2', 'W-3', '8027']

export const formLabel = (f: FilingForm, t: (ko: string, en: string) => string): string =>
  ({
    '941': 'Form 941',
    'C-3': 'TWC C-3',
    '940': 'Form 940',
    'W-2': 'W-2',
    'W-3': 'W-3',
    '8027': 'Form 8027',
    other: t('기타 서류', 'Other'),
  })[f]

export async function listFilings(companyId: string): Promise<Filing[]> {
  const { data, error } = await db().from('filings').select('*').eq('company_id', companyId)
    .order('period', { ascending: false }).order('form')
  if (error) throw new Error(error.message)
  return (data as FilingRow[]).map(fromRow)
}

/** 회계법인: PDF 올리기 → 목록에 등록 */
export async function addFiling(companyId: string, f: { form: FilingForm; period: string; title?: string; filedOn?: string; employeeId?: string | null }, file: File): Promise<void> {
  const client = db()
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${companyId}/filings/${crypto.randomUUID()}-${safe}`
  const up = await client.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  if (up.error) throw new Error(up.error.message)
  const { error } = await client.from('filings').insert({
    company_id: companyId, form: f.form, period: f.period, title: f.title ?? '', file_name: file.name, path,
    filed_on: f.filedOn || null, employee_id: f.employeeId ?? null,
  })
  if (error) {
    await client.storage.from(DOCS_BUCKET).remove([path])
    throw new Error(error.message)
  }
}

/** 회계법인: 삭제 (목록 + 파일) */
export async function removeFiling(f: Filing): Promise<void> {
  const client = db()
  const { error } = await client.from('filings').delete().eq('id', f.id)
  if (error) throw new Error(error.message)
  await client.storage.from(DOCS_BUCKET).remove([f.path])
}

/** 내려받기: 1분짜리 링크로 파일 받기 */
export async function downloadFiling(f: Filing): Promise<void> {
  const { data, error } = await db().storage.from(DOCS_BUCKET).createSignedUrl(f.path, 60, { download: f.fileName })
  if (error) throw new Error(error.message)
  window.location.assign(data.signedUrl)
}
