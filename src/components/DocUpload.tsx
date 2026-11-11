import { CheckCircle2, Download, FileUp, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { demoFormPdf, mapI9, mapW4, readPdfFields, type I9Extract, type W4Extract } from '../lib/docExtract'
import { usePrefs } from '../prefs'

type Kind = 'W-4' | 'I-9'
interface Result { fileName: string; filled: number; scanned: boolean }

interface Props {
  onW4: (x: W4Extract, file: File) => void
  onI9: (x: I9Extract, file: File) => void
}

/** W-4·I-9 파일을 올리면 양식 칸을 읽어 직원 정보에 자동 입력 */
export default function DocUpload({ onW4, onI9 }: Props) {
  const { t } = usePrefs()
  const [result, setResult] = useState<Partial<Record<Kind, Result>>>({})
  const [busy, setBusy] = useState<Kind | null>(null)

  const handle = async (kind: Kind, file: File) => {
    setBusy(kind)
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
      const fields = isPdf ? await readPdfFields(file).catch(() => []) : []
      const filledFields = fields.filter((f) => f.value || f.checked)
      if (kind === 'W-4') {
        const x = mapW4(fields)
        onW4(x, file)
        setResult((r) => ({ ...r, [kind]: { fileName: file.name, filled: Object.keys(x).length, scanned: filledFields.length === 0 } }))
      } else {
        const x = mapI9(fields)
        onI9(x, file)
        setResult((r) => ({ ...r, [kind]: { fileName: file.name, filled: Object.keys(x).length, scanned: filledFields.length === 0 } }))
      }
    } finally {
      setBusy(null)
    }
  }

  const sample = async (kind: Kind) => {
    const blob = await demoFormPdf(kind)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `demo-${kind.toLowerCase()}-sample.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const card = (kind: Kind, desc: string) => {
    const r = result[kind]
    return (
      <div className={`doc-card${r ? (r.scanned ? ' scanned' : ' done') : ''}`}>
        <label className="doc-drop">
          {r ? (r.scanned ? <ScanLine size={22} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />) : <FileUp size={22} aria-hidden />}
          <strong>{busy === kind ? t('읽는 중…', 'Reading…') : r ? r.fileName : t(`${kind} 올리기`, `Upload ${kind}`)}</strong>
          <span className="small">
            {r
              ? r.scanned
                ? t('스캔본·사진이에요. 파일은 첨부로 기록했고, 자동 인식은 서버(AI) 연결 후 지원돼요. 칸을 직접 확인해 주세요.', 'Scanned image: attached for the record. Auto-reading needs the server (AI) step — please fill in below.')
                : t(`${r.filled}개 항목을 채웠어요 — 다음 단계에서 꼭 확인하세요`, `Filled ${r.filled} items — review them in the next steps`)
              : desc}
          </span>
          <input type="file" accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && handle(kind, e.target.files[0])} />
        </label>
        <button type="button" className="link-btn" onClick={() => sample(kind)}>
          <Download size={13} aria-hidden /> {t(`데모용 ${kind} 샘플 PDF`, `Demo ${kind} sample PDF`)}
        </button>
      </div>
    )
  }

  return (
    <section className="doc-upload">
      <div className="doc-upload-head">
        <strong>{t('서류로 빠르게 시작', 'Start from the paperwork')}</strong>
        <span className="muted small">{t('직원에게 받은 W-4·I-9를 올리면 이름·SSN·주소·신고 상태·시민권 정보를 채워 드려요. 파일은 이 브라우저에서만 읽고 서버로 보내지 않습니다.', 'Upload the W-4 and I-9 you collected; we fill in name, SSN, address, filing status and citizenship. Files are read in this browser only.')}</span>
      </div>
      <div className="doc-cards">
        {card('W-4', t('작성 가능한 PDF는 칸 값을 바로 읽어요', 'Fillable PDFs are read field by field'))}
        {card('I-9', t('Section 1 직원 정보와 시민권 상태', 'Section 1 details and status'))}
      </div>
    </section>
  )
}
