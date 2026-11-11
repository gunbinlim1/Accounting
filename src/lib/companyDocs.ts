/**
 * 회사 서류 자동 입력 (브라우저에서 처리, 서버로 보내지 않음)
 * - EIN: Form SS-4 (IRS가 EIN을 적어 돌려준 사본), CP 575, 147C 확인서
 * - TWC: Texas Workforce Commission 고용주 등록 통지(Liability Letter)·세율 통지
 * 글자가 들어 있는 PDF는 텍스트를 읽고, 작성 가능한 PDF는 칸 값도 함께 읽습니다.
 * 스캔본·사진은 서버(AI 문서 인식) 단계에서 지원합니다.
 */

export interface EinExtract {
  ein?: string
  legalName?: string
  dba?: string
  street?: string
  city?: string
  state?: string
  zip?: string
}

export interface TwcExtract {
  twcAccount?: string
  /** 퍼센트 값 (2.7 = 2.7%) */
  sutaRate?: string
  legalName?: string
}

/** PDF의 글자와 작성 가능한 칸 값을 한 덩어리 텍스트로 */
export async function readPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const parts: string[] = []
  try {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: data.slice() }).promise
    for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let line = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        line += item.str
        if (item.hasEOL) {
          parts.push(line)
          line = ''
        } else line += ' '
      }
      if (line.trim()) parts.push(line)
    }
  } catch {
    /* 텍스트 없는 PDF */
  }
  try {
    const { PDFDocument, PDFTextField } = await import('pdf-lib')
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    for (const f of doc.getForm().getFields()) {
      if (f instanceof PDFTextField) {
        const v = (f.getText() ?? '').trim()
        if (v) parts.push(`${f.getName()}: ${v}`)
      }
    }
  } catch {
    /* 양식 칸 없음 */
  }
  return parts.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

const CITY = /^(.+?),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/

/** 라벨 뒤 값 (같은 줄 "Label: value" 또는 다음 줄) */
function after(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label)
    if (!m) continue
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:.\-–)]+/, '').trim()
    if (rest) return rest
    if (lines[i + 1]) return lines[i + 1].trim()
  }
  return undefined
}

/** SS-4 / CP 575 / 147C 텍스트 → EIN·법인명·주소 */
export function parseEinText(text: string): EinExtract {
  const lines = text.split('\n')
  const out: EinExtract = {}
  const labeled = text.match(/(?:EIN|Employer Identification Number)[^\d]{0,40}(\d{2})[-\s]?(\d{7})\b/i)
  const any = text.match(/\b(\d{2})-(\d{7})\b/)
  const m = labeled ?? any
  if (m) out.ein = `${m[1]}-${m[2]}`

  const legal = after(lines, /(?:^1\s+)?legal name of (?:the )?entity(?: \(or individual\))?(?: for whom the EIN (?:was|is being) requested)?/i)
  if (legal && !/^\d/.test(legal)) out.legalName = legal
  const trade = after(lines, /trade name of business(?: \(if different from name on line 1\))?/i)
  if (trade && !/^\d/.test(trade)) out.dba = trade

  const street = after(lines, /(?:street address|mailing address)(?: \(room, apt\., suite no\. and street, or P\.O\. box\))?/i)
  if (street && /^\d+\s+\S+/.test(street)) out.street = street
  const cityLine = after(lines, /city, state(?:,)? and ZIP code(?: \(if foreign, see instructions\))?/i) ?? lines.find((l) => CITY.test(l.trim()))
  const c = cityLine?.trim().match(CITY)
  if (c) {
    out.city = c[1].trim()
    out.state = c[2]
    out.zip = c[3]
  }
  return out
}

/** TWC 통지서 텍스트 → 계정번호·세율 */
export function parseTwcText(text: string): TwcExtract {
  const out: TwcExtract = {}
  const acct = text.match(/(?:account|acct\.?)\s*(?:number|no\.?|#)?[^\d]{0,20}(\d{2})[-\s]?(\d{6})[-\s]?(\d)\b/i) ?? text.match(/\b(\d{2})-(\d{6})-(\d)\b/)
  if (acct) out.twcAccount = `${acct[1]}-${acct[2]}-${acct[3]}`
  const rate = text.match(/(?:tax|contribution)\s+rate[^%\n]{0,60}?(\d{1,2}(?:\.\d{1,4})?)\s*%/i)
  if (rate) out.sutaRate = String(Number(rate[1]))
  const name = after(text.split('\n'), /employer(?:'s)? name|business name/i)
  if (name && !/^\d/.test(name)) out.legalName = name
  return out
}

/**
 * 데모용 샘플 PDF (IRS·TWC 공식 서류가 아님) — 자동 입력 흐름 체험용
 */
export async function demoCompanyDocPdf(kind: 'EIN' | 'TWC'): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = 740
  const line = (s: string, f = font, size = 10) => {
    page.drawText(s, { x: 50, y, size, font: f })
    y -= size + 10
  }
  line('DEMO SAMPLE - not an official IRS or TWC document', bold, 9)
  y -= 10
  if (kind === 'EIN') {
    line('Form SS-4  Application for Employer Identification Number', bold, 13)
    line('EIN: 76-5550123')
    line('1 Legal name of entity (or individual) for whom the EIN is being requested')
    line('Gulf Breeze Hospitality LLC')
    line('2 Trade name of business (if different from name on line 1)')
    line('Gulf Breeze Cafe')
    line('4a Mailing address (room, apt., suite no. and street, or P.O. box)')
    line('2200 Westheimer Rd Ste 110')
    line('4b City, state, and ZIP code (if foreign, see instructions)')
    line('Houston, TX 77098')
  } else {
    line('Texas Workforce Commission', bold, 13)
    line('Notice of Employer Liability and Tax Rate')
    line('Employer name: Gulf Breeze Hospitality LLC')
    line('Account Number: 99-555012-3')
    line('Effective date: 01/01/2026')
    line('Your total tax rate for 2026 is 2.70%')
  }
  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
