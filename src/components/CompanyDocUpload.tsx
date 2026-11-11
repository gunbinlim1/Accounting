import { CheckCircle2, Download, FileUp, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { demoCompanyDocPdf, parseEinText, parseTwcText, readPdfText, type EinExtract, type TwcExtract } from '../lib/companyDocs'
import { usePrefs } from '../prefs'

type Kind = 'EIN' | 'TWC'
interface Result { fileName: string; filled: string[]; scanned: boolean }

interface Props {
  onEin: (x: EinExtract, file: File) => void
  onTwc: (x: TwcExtract, file: File) => void
}

/** Form SS-4(EIN 확인서)·TWC 통지서를 올리면 EIN·TWC 계정번호 등을 자동 입력 */
export default function CompanyDocUpload({ onEin, onTwc }: Props) {
  const { t } = usePrefs()
  const [result, setResult] = useState<Partial<Record<Kind, Result>>>({})
  const [busy, setBusy] = useState<Kind | null>(null)

  const label = (k: string) =>
    ({
      ein: 'EIN', legalName: t('법인명', 'Legal name'), dba: 'DBA', street: t('주소', 'Address'), city: t('도시', 'City'),
      state: t('주', 'State'), zip: 'ZIP', twcAccount: t('TWC 계정번호', 'TWC account'), sutaRate: t('TWC 세율', 'TWC rate'),
    })[k] ?? k

  const handle = async (kind: Kind, file: File) => {
    setBusy(kind)
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
      const text = isPdf ? await readPdfText(file) : ''
      const x = kind === 'EIN' ? parseEinText(text) : parseTwcText(text)
      const filled = Object.keys(x)
      if (kind === 'EIN') onEin(x, file)
      else onTwc(x, file)
      setResult((r) => ({ ...r, [kind]: { fileName: file.name, filled: filled.map(label), scanned: !text.trim() } }))
    } finally {
      setBusy(null)
    }
  }

  const sample = async (kind: Kind) => {
    const url = URL.createObjectURL(await demoCompanyDocPdf(kind))
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'EIN' ? 'demo-ss-4-sample.pdf' : 'demo-twc-letter-sample.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const card = (kind: Kind, title: string, desc: string, sampleLabel: string) => {
    const r = result[kind]
    return (
      <div className={`doc-card${r ? (r.scanned || !r.filled.length ? ' scanned' : ' done') : ''}`}>
        <label className="doc-drop">
          {r ? (r.scanned || !r.filled.length ? <ScanLine size={22} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />) : <FileUp size={22} aria-hidden />}
          <strong>{busy === kind ? t('읽는 중…', 'Reading…') : r ? r.fileName : title}</strong>
          <span className="small">
            {r
              ? r.scanned
                ? t('스캔본·사진이에요. 첨부로 기록했고, 자동 인식은 서버(AI) 연결 후 지원돼요. 아래 칸을 직접 입력해 주세요.', 'Scanned image: attached for the record. Auto-reading needs the server (AI) step — please type the values below.')
                : r.filled.length
                  ? t(`자동 입력: ${r.filled.join(', ')} — 아래에서 꼭 확인하세요`, `Filled: ${r.filled.join(', ')} — please check below`)
                  : t('번호를 찾지 못했어요. 아래 칸에 직접 입력해 주세요.', 'No number found. Please type it below.')
              : desc}
          </span>
          <input type="file" accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && handle(kind, e.target.files[0])} />
        </label>
        <button type="button" className="link-btn" onClick={() => sample(kind)}>
          <Download size={13} aria-hidden /> {sampleLabel}
        </button>
      </div>
    )
  }

  return (
    <section className="doc-upload">
      <div className="doc-upload-head">
        <strong>{t('서류로 자동 입력', 'Fill from your documents')}</strong>
        <span className="muted small">
          {t('IRS에서 받은 Form SS-4(EIN이 적힌 사본) 또는 CP 575·147C 확인서와 TWC 고용주 등록 통지서(Liability Letter)를 올리면 EIN·TWC 계정번호·세율을 채워 드려요. 파일은 이 브라우저에서만 읽습니다.',
            'Upload your Form SS-4 (with the assigned EIN) or IRS CP 575/147C letter, and the TWC liability letter; we fill in the EIN, TWC account number and rate. Files are read in this browser only.')}
        </span>
      </div>
      <div className="doc-cards">
        {card('EIN', t('Form SS-4 · EIN 확인서', 'Form SS-4 · EIN letter'), t('EIN, 법인명, 상호, 주소', 'EIN, legal name, DBA, address'), t('데모용 SS-4 샘플 PDF', 'Demo SS-4 sample PDF'))}
        {card('TWC', t('TWC Liability Letter', 'TWC liability letter'), t('TWC 계정번호와 실업세율', 'TWC account number and tax rate'), t('데모용 TWC 통지서 샘플 PDF', 'Demo TWC letter sample PDF'))}
      </div>
    </section>
  )
}
