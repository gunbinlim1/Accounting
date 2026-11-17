import { Download, FileCheck2, FileUp, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { formatDate } from '../lib/format'
import { ANNUAL_FORMS, addFiling, downloadFiling, formLabel, listFilings, removeFiling, type Filing, type FilingForm } from '../lib/filings'
import { fullName } from '../lib/names'
import { usePrefs } from '../prefs'
import type { Employee } from '../types'

const FORMS: FilingForm[] = ['941', 'C-3', '940', 'W-2', 'W-3', '8027', 'other']
const yearOf = (period: string) => period.slice(0, 4)
const periodLabel = (p: string) => p.replace('-', ' ')

/**
 * 신고서 보관함
 * - 고객: 회계법인이 제출한 신고서 PDF 내려받기
 * - 회계법인: PDF 올리기·삭제
 * filter가 있으면 해당 신고서만 짧게 (분기 탭 등에서 사용)
 */
export default function FiledReturns({ companyId, employees, isFirm, filter, compact }: {
  companyId: string
  employees: Employee[]
  isFirm: boolean
  filter?: (f: Filing) => boolean
  compact?: boolean
}) {
  const { t, locale } = usePrefs()
  const [items, setItems] = useState<Filing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    listFilings(companyId).then((x) => { setItems(x); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [companyId])
  useEffect(refresh, [refresh])

  const shown = useMemo(() => (items ?? []).filter(filter ?? (() => true)), [items, filter])
  const years = [...new Set(shown.map((f) => yearOf(f.period)))].sort().reverse()
  const empName = (id: string | null) => {
    const e = id ? employees.find((x) => x.id === id) : undefined
    return e ? fullName(e) : null
  }

  const download = async (f: Filing) => {
    setBusy(f.id)
    try { await downloadFiling(f) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const remove = async (f: Filing) => {
    if (!window.confirm(t(`${formLabel(f.form, t)} ${periodLabel(f.period)} 파일을 삭제할까요? 고객도 더 이상 받을 수 없어요.`, `Delete ${formLabel(f.form, t)} ${periodLabel(f.period)}? The client won’t be able to download it.`))) return
    setBusy(f.id)
    try { await removeFiling(f); refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const row = (f: Filing) => {
    const who = empName(f.employeeId)
    return (
      <li key={f.id} className="filing-row">
        <span className={`filing-form f-${f.form.replace(/\W/g, '')}`}>{formLabel(f.form, t)}</span>
        <span className="filing-info">
          <strong>{periodLabel(f.period)}{who ? ` · ${who}` : ''}{f.title ? ` · ${f.title}` : ''}</strong>
          <small className="muted">
            {f.filedOn ? t(`제출일 ${formatDate(new Date(`${f.filedOn}T00:00`), locale, { month: 'short', day: 'numeric', year: 'numeric' })}`, `Filed ${formatDate(new Date(`${f.filedOn}T00:00`), locale, { month: 'short', day: 'numeric', year: 'numeric' })}`) : t('제출 완료', 'Filed')}
            {' · '}{f.fileName}
          </small>
        </span>
        <span className="filing-actions">
          <button type="button" className="btn sm primary" disabled={busy === f.id} onClick={() => void download(f)}>
            <Download size={15} aria-hidden /> {t('PDF 받기', 'Download PDF')}
          </button>
          {isFirm && (
            <button type="button" className="btn sm ghost" disabled={busy === f.id} onClick={() => void remove(f)} aria-label={t('삭제', 'Delete')}>
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </span>
      </li>
    )
  }

  if (compact) {
    if (!items || shown.length === 0) return null
    return (
      <div className="filed-strip">
        <FileCheck2 size={18} aria-hidden />
        <span>{t('제출된 신고서', 'Filed returns')}</span>
        {shown.map((f) => (
          <button key={f.id} type="button" className="btn sm" disabled={busy === f.id} onClick={() => void download(f)}>
            <Download size={14} aria-hidden /> {formLabel(f.form, t)}{empName(f.employeeId) ? ` · ${empName(f.employeeId)}` : ''}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className="card filed-card">
      <div className="card-head">
        <h2><FileCheck2 size={19} aria-hidden /> {t('제출한 신고서 (PDF)', 'Filed returns (PDF)')}</h2>
      </div>
      <p className="muted small">
        {isFirm
          ? t('신고를 마친 뒤 제출본 PDF를 올리면 고객이 바로 내려받을 수 있어요. 고객 활동 기록에도 남습니다.', 'Upload the filed copy after filing — the client can download it right away and sees it in their activity.')
          : t('회계법인이 고객님 대신 제출한 분기·연간 신고서 사본이에요. 보관용으로 내려받으세요.', 'Copies of the quarterly and annual returns your CPA filed for you. Download them for your records.')}
      </p>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {isFirm && <UploadForm companyId={companyId} employees={employees} onDone={refresh} />}
      {items === null ? (
        <p className="muted small">{t('불러오는 중…', 'Loading…')}</p>
      ) : shown.length === 0 ? (
        <div className="filed-empty muted">{t('아직 올라온 신고서가 없어요. 회계법인이 신고를 마치면 여기에서 PDF를 받을 수 있어요.', 'Nothing here yet. Once your CPA files a return, its PDF appears here.')}</div>
      ) : (
        years.map((y) => {
          const ofYear = shown.filter((f) => yearOf(f.period) === y)
          const quarterly = ofYear.filter((f) => f.period.includes('-Q')).sort((a, b) => b.period.localeCompare(a.period))
          const annual = ofYear.filter((f) => !f.period.includes('-Q'))
          return (
            <div key={y} className="filed-year">
              <h3>{y}</h3>
              {quarterly.length > 0 && (<><h4>{t('분기 신고', 'Quarterly')}</h4><ul className="filing-list">{quarterly.map(row)}</ul></>)}
              {annual.length > 0 && (<><h4>{t('연간 신고 · W-2', 'Annual · W-2')}</h4><ul className="filing-list">{annual.map(row)}</ul></>)}
            </div>
          )
        })
      )}
    </section>
  )
}

function UploadForm({ companyId, employees, onDone }: { companyId: string; employees: Employee[]; onDone: () => void }) {
  const { t } = usePrefs()
  const [now] = useState(() => new Date())
  const thisYear = now.getFullYear()
  // 기본값: 직전 분기 (신고는 분기가 끝난 뒤에 함)
  const prevQ = Math.floor(now.getMonth() / 3) || 4
  const [form, setForm] = useState<FilingForm>('941')
  const [year, setYear] = useState(String(prevQ === 4 && now.getMonth() < 3 ? thisYear - 1 : thisYear))
  const [q, setQ] = useState(String(prevQ))
  const [filedOn, setFiledOn] = useState(() => now.toISOString().slice(0, 10))
  const [employeeId, setEmployeeId] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const annual = ANNUAL_FORMS.includes(form) || (form === 'other' && q === 'year')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setSaving(true)
    setErr(null)
    try {
      await addFiling(companyId, {
        form,
        period: annual ? year : `${year}-Q${q === 'year' ? 4 : q}`,
        title: title.trim(),
        filedOn,
        employeeId: form === 'W-2' && employeeId ? employeeId : null,
      }, file)
      setFile(null)
      setTitle('')
      setInputKey((k) => k + 1)
      onDone()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="filing-upload" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>{t('서식', 'Form')}</span>
        <select value={form} onChange={(e) => setForm(e.target.value as FilingForm)}>
          {FORMS.map((f) => <option key={f} value={f}>{formLabel(f, t)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('연도', 'Year')}</span>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      {!ANNUAL_FORMS.includes(form) && (
        <label className="field">
          <span>{t('분기', 'Quarter')}</span>
          <select value={q} onChange={(e) => setQ(e.target.value)}>
            {['1', '2', '3', '4'].map((x) => <option key={x} value={x}>Q{x}</option>)}
            {form === 'other' && <option value="year">{t('연간', 'Annual')}</option>}
          </select>
        </label>
      )}
      {form === 'W-2' && (
        <label className="field" title={t('직원을 고르면 그 직원도 직원 포털에서 본인 W-2를 받을 수 있어요', 'Pick an employee so they can also download it in their employee portal')}>
          <span>{t('직원 (선택 시 직원 포털에도 공개)', 'Employee (shared to their portal)')}</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t('전체 묶음', 'All employees')}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>{t('제출일', 'Filed on')}</span>
        <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('메모 (선택)', 'Note (optional)')}</span>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t('예: 수정 신고', 'e.g. Amended')} />
      </label>
      <label className="field file-field">
        <span>PDF</span>
        <input key={inputKey} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <button type="submit" className="btn primary" disabled={!file || saving}><FileUp size={16} aria-hidden /> {saving ? t('올리는 중…', 'Uploading…') : t('올리기', 'Upload')}</button>
      {err && <p className="chat-error" role="alert">{err}</p>}
    </form>
  )
}
