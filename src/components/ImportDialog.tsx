import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { downloadCsv } from '../lib/csv'
import { formatCurrency } from '../lib/format'
import { usePrefs } from '../prefs'
import type { Employee, TimeEntry } from '../types'

type Field = 'employee' | 'regular' | 'overtime' | 'cashTips' | 'cardTips' | 'rate'
type Mapping = Record<Field, number>

const guesses: Record<Field, RegExp> = {
  employee: /(name|employee|직원|이름|emp|staff)/i,
  regular: /(reg(ular)?\s*(h|hr|hours)?|정규|^hours$|^hrs$|근무\s*시간)/i,
  overtime: /(\bot\b|o\/t|overtime|초과)/i,
  cashTips: /(cash.*tip|tip.*cash|현금)/i,
  cardTips: /((card|cc|credit|charge).*tip|tip.*(card|cc|credit)|카드)/i,
  rate: /(rate|wage|시급|단가)/i,
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ')
const toNum = (v: unknown) => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

interface Props {
  companyId: string
  employees: Employee[]
  onClose: () => void
  onApply: (updates: { id: string; patch: Partial<TimeEntry> }[]) => void
}

/** 고객이 쓰는 엑셀·CSV 근무표를 올리면 열을 연결해 급여 실행 표에 채움 */
export default function ImportDialog({ companyId, employees, onClose, onApply }: Props) {
  const { t } = usePrefs()
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [map, setMap] = useState<Mapping | null>(null)
  const storeKey = `import-map-${companyId}`

  const fields: { key: Field; label: string; required?: boolean }[] = [
    { key: 'employee', label: t('직원 이름 또는 사번', 'Employee name or ID'), required: true },
    { key: 'regular', label: t('정규 시간', 'Regular hours') },
    { key: 'overtime', label: t('OT 시간', 'OT hours') },
    { key: 'cashTips', label: t('현금 팁', 'Cash tips') },
    { key: 'cardTips', label: t('카드 팁', 'Card tips') },
    { key: 'rate', label: t('시급 (선택)', 'Rate (optional)') },
  ]

  const load = async (file: File) => {
    setError('')
    setFileName(file.name)
    try {
      let data: unknown[][]
      if (/\.csv$/i.test(file.name)) data = parseCsv(await file.text())
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser')
        const sheets = await readXlsxFile(file)
        data = (sheets[0]?.data ?? []) as unknown[][]
      } else if (/\.pdf$/i.test(file.name)) {
        setRows(null)
        return setError(t('PDF 근무표 자동 인식은 서버(AI 문서 인식) 연결 후 지원됩니다. 지금은 엑셀(.xlsx)이나 CSV로 올려 주세요.', 'PDF timesheets need server-side AI recognition (coming next). Please upload .xlsx or .csv for now.'))
      } else return setError(t('.xlsx 또는 .csv 파일을 올려 주세요.', 'Upload an .xlsx or .csv file.'))
      if (data.length < 2) return setError(t('제목 행과 데이터가 있는 파일이 필요해요.', 'The file needs a header row and data.'))
      setRows(data)
      const header = data[0].map((h) => String(h ?? ''))
      let saved: Mapping | null = null
      try { saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null') } catch { saved = null }
      const guess = Object.fromEntries(
        (Object.keys(guesses) as Field[]).map((f) => {
          if (saved && saved[f] >= 0 && saved[f] < header.length) return [f, saved[f]]
          const idx = header.findIndex((h) => guesses[f].test(h) && !(f === 'regular' && guesses.overtime.test(h)))
          return [f, idx]
        }),
      ) as Mapping
      setMap(guess)
    } catch {
      setError(t('파일을 읽지 못했어요. 형식을 확인해 주세요.', 'Could not read the file. Check its format.'))
    }
  }

  const preview = useMemo(() => {
    if (!rows || !map || map.employee < 0) return []
    const byKey = new Map<string, Employee>()
    for (const e of employees) { byKey.set(e.id.toLowerCase(), e); byKey.set(norm(e.name), e) }
    return rows.slice(1).map((r) => {
      const key = String(r[map.employee] ?? '').trim()
      const e = byKey.get(key.toLowerCase()) ?? byKey.get(norm(key))
      const patch: Partial<TimeEntry> = {}
      if (map.regular >= 0) patch.regular = toNum(r[map.regular])
      if (map.overtime >= 0) patch.overtime = toNum(r[map.overtime])
      if (map.cashTips >= 0) patch.cashTips = toNum(r[map.cashTips])
      if (map.cardTips >= 0) patch.cardTips = toNum(r[map.cardTips])
      if (map.rate >= 0 && toNum(r[map.rate]) > 0) patch.rate = toNum(r[map.rate])
      return { key, employee: e, patch }
    })
  }, [rows, map, employees])

  const matched = preview.filter((p) => p.employee && p.employee.payType !== 'salary')
  const header = rows?.[0].map((h) => String(h ?? '')) ?? []

  const sample = () => {
    const lines = [['Employee', 'Regular Hours', 'OT Hours', 'Cash Tips', 'Card Tips']]
    for (const e of employees.filter((x) => x.active && x.payType !== 'salary')) lines.push([e.name, '72', '4', e.payType === 'tipped' ? '320' : '0', e.payType === 'tipped' ? '910' : '0'])
    downloadCsv('timesheet-sample.csv', lines.map((l) => l.join(',')).join('\n'))
  }

  const apply = () => {
    if (map) try { localStorage.setItem(storeKey, JSON.stringify(map)) } catch { /* ignore */ }
    onApply(matched.map((p) => ({ id: p.employee!.id, patch: p.patch })))
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2><FileSpreadsheet size={20} aria-hidden /> {t('근무표 가져오기', 'Import timesheet')}</h2>
          <button className="round-btn" onClick={onClose} aria-label={t('닫기', 'Close')}><X size={18} /></button>
        </div>
        <p className="muted small">{t('POS나 근태 프로그램에서 받은 엑셀(.xlsx)·CSV를 올리면 열을 연결해 급여 표에 채웁니다. 연결 방식은 다음에도 기억해요.', 'Upload the .xlsx or .csv from your POS or time clock. We map the columns and remember them next time.')}</p>

        <label className="dropzone">
          <Upload size={22} aria-hidden />
          <strong>{fileName || t('파일 선택 (.xlsx, .csv)', 'Choose a file (.xlsx, .csv)')}</strong>
          <span className="muted small">{t('PDF는 서버 연결 후 지원', 'PDF supported once the server is connected')}</span>
          <input type="file" accept=".xlsx,.csv,.pdf" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </label>
        <button className="link-btn" onClick={sample}><Download size={14} aria-hidden /> {t('연습용 샘플 CSV 받기', 'Download a sample CSV')}</button>
        {error && <p className="error-text">{error}</p>}

        {rows && map && (
          <>
            <h3 className="sub">{t('열 연결', 'Map columns')}</h3>
            <div className="map-grid">
              {fields.map((f) => (
                <label key={f.key} className="field">
                  <span>{f.label}{f.required && ' *'}</span>
                  <select value={map[f.key]} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>{t('— 사용 안 함 —', '— Not used —')}</option>
                    {header.map((h, i) => <option key={i} value={i}>{h || `${t('열', 'Column')} ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <h3 className="sub">{t(`미리보기 · ${matched.length}명 적용 예정`, `Preview · ${matched.length} will be updated`)}</h3>
            <div className="table-scroll import-preview">
              <table className="run-table">
                <thead>
                  <tr>
                    <th>{t('파일의 이름', 'Name in file')}</th>
                    <th>{t('연결된 직원', 'Matched employee')}</th>
                    <th className="num">{t('정규', 'Reg')}</th>
                    <th className="num">OT</th>
                    <th className="num">{t('현금 팁', 'Cash')}</th>
                    <th className="num">{t('카드 팁', 'Card')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i}>
                      <td>{p.key || '—'}</td>
                      <td>
                        {p.employee
                          ? p.employee.payType === 'salary' ? <span className="tag neutral">{t('연봉 직원 — 건너뜀', 'Salaried — skipped')}</span> : <strong>{p.employee.name}</strong>
                          : <span className="tag warn">{t('찾지 못함', 'No match')}</span>}
                      </td>
                      <td className="num">{p.patch.regular ?? '—'}</td>
                      <td className="num">{p.patch.overtime ?? '—'}</td>
                      <td className="num">{p.patch.cashTips !== undefined ? formatCurrency(p.patch.cashTips) : '—'}</td>
                      <td className="num">{p.patch.cardTips !== undefined ? formatCurrency(p.patch.cardTips) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="drawer-foot">
          <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
          <button className="btn primary" disabled={!matched.length} onClick={apply}>
            {t(`${matched.length}명 적용`, `Apply to ${matched.length}`)}
          </button>
        </div>
      </div>
    </div>
  )
}
