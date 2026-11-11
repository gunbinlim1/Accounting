/**
 * W-4·I-9 자동 입력 (브라우저에서 처리, 서버로 보내지 않음).
 * - 작성 가능한(fillable) PDF: 양식 칸 값을 직접 읽어 정확도가 높음
 * - 스캔본·사진·평면 PDF: 서버 AI 문서 인식이 필요 (다음 단계)
 * 읽은 값은 항상 고객이 확인해야 합니다.
 */
import type { CitizenshipStatus, FilingStatus } from '../types'
import { splitFirst } from './names'

export interface PdfField {
  name: string
  value: string
  checked?: boolean
  kind: 'text' | 'check'
}

export async function readPdfFields(file: File): Promise<PdfField[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const out: PdfField[] = []
  for (const f of doc.getForm().getFields()) {
    const name = f.getName()
    if (f instanceof PDFTextField) out.push({ name, value: (f.getText() ?? '').trim(), kind: 'text' })
    else if (f instanceof PDFCheckBox) out.push({ name, value: '', checked: f.isChecked(), kind: 'check' })
  }
  return out
}

const SSN = /^\d{3}-?\d{2}-?\d{4}$/
const MONEY = /^\$?\s*[\d,]+(\.\d{1,2})?$/
const CITY = /^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(-\d{4})?)$/
const DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/
const money = (v: string) => Number(v.replace(/[$,\s]/g, '')) || 0
const iso = (v: string) => {
  const m = v.trim().match(DATE)
  if (!m) return ''
  return m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}
const hint = (f: PdfField, re: RegExp) => re.test(f.name)

/** 양식에서 읽은 이름 (성·이름 분리) */
export interface NameExtract {
  firstName?: string
  middleInitial?: string
  lastName?: string
}

export interface W4Extract extends NameExtract {
  ssn?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  filingStatus?: FilingStatus
  multipleJobs?: boolean
  dependents?: string
  otherIncome?: string
  deductions?: string
  extraWithholding?: string
  exempt?: boolean
}

/** W-4 양식 칸 → 직원 정보. 칸 이름 힌트(Step1a, Step3, Step4 등)를 먼저 쓰고, 없으면 값 모양과 순서로 판단 */
export function mapW4(fields: PdfField[]): W4Extract {
  const texts = fields.filter((f) => f.kind === 'text' && f.value)
  const checks = fields.filter((f) => f.kind === 'check')
  const out: W4Extract = {}

  const ssn = texts.find((f) => SSN.test(f.value))
  if (ssn) out.ssn = ssn.value

  const first = texts.find((f) => hint(f, /first|f1_01/i)) ?? texts.find((f) => !/\d/.test(f.value))
  const last = texts.find((f) => f !== first && hint(f, /last|f1_02/i)) ?? texts.filter((f) => !/\d/.test(f.value))[1]
  // W-4 Step 1(a): "First name and middle initial" / "Last name"
  if (first) Object.assign(out, splitFirst(first.value))
  if (last) out.lastName = last.value

  const cityLine = texts.find((f) => CITY.test(f.value))
  if (cityLine) {
    const m = cityLine.value.match(CITY)!
    out.city = m[1].trim()
    out.state = m[2].toUpperCase()
    out.zip = m[3]
  }
  const street = texts.find((f) => f !== cityLine && hint(f, /address|f1_03/i)) ?? texts.find((f) => /^\d+\s+\S+/.test(f.value) && !CITY.test(f.value) && !SSN.test(f.value) && !MONEY.test(f.value))
  if (street) out.street = street.value

  // Step 1(c) 신고 상태: 첫 세 체크박스 = Single / MFJ / HoH
  const statusBoxes = checks.filter((f) => hint(f, /step1c|c1_1\[/i))
  const status = (statusBoxes.length >= 3 ? statusBoxes : checks.slice(0, 3)).findIndex((f) => f.checked)
  if (status >= 0) out.filingStatus = (['single', 'married', 'hoh'] as const)[status]
  const step2 = checks.find((f) => hint(f, /step2|c1_2\[/i)) ?? checks[3]
  if (step2) out.multipleJobs = !!step2.checked

  // Step 3·4 금액
  const step3 = texts.filter((f) => hint(f, /step3|f1_0[6-8]/i) && MONEY.test(f.value))
  const a = texts.find((f) => hint(f, /step4a|f1_09/i) && MONEY.test(f.value))
  const b = texts.find((f) => hint(f, /step4b|f1_10/i) && MONEY.test(f.value))
  const c = texts.find((f) => hint(f, /step4c|f1_11/i) && MONEY.test(f.value))
  if (step3.length || a || b || c) {
    if (step3.length) out.dependents = String(money(step3.at(-1)!.value))
    if (a) out.otherIncome = String(money(a.value))
    if (b) out.deductions = String(money(b.value))
    if (c) out.extraWithholding = String(money(c.value))
  } else {
    const nums = texts.filter((f) => MONEY.test(f.value) && !SSN.test(f.value) && !/^\d{5}$/.test(f.value))
    if (nums.length >= 4) {
      const [dep, oi, ded, extra] = nums.slice(-4)
      out.dependents = String(money(dep.value))
      out.otherIncome = String(money(oi.value))
      out.deductions = String(money(ded.value))
      out.extraWithholding = String(money(extra.value))
    }
  }
  if (texts.some((f) => /^exempt$/i.test(f.value)) || checks.some((f) => hint(f, /exempt/i) && f.checked)) out.exempt = true
  return out
}

export interface I9Extract extends NameExtract {
  ssn?: string
  dob?: string
  email?: string
  phone?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  citizenship?: CitizenshipStatus
  uscis?: string
  workAuthExpires?: string
}

/** I-9 Section 1 양식 칸 → 직원 정보 */
export function mapI9(fields: PdfField[]): I9Extract {
  const texts = fields.filter((f) => f.kind === 'text' && f.value)
  const checks = fields.filter((f) => f.kind === 'check')
  const out: I9Extract = {}
  const last = texts.find((f) => hint(f, /last\s*name/i))
  const first = texts.find((f) => hint(f, /first\s*name/i))
  const middle = texts.find((f) => hint(f, /middle|initial/i) && /^[A-Za-z]\.?$/.test(f.value))
  if (first) Object.assign(out, splitFirst(first.value))
  if (last) out.lastName = last.value
  if (middle) out.middleInitial = middle.value[0].toUpperCase()
  const ssn = texts.find((f) => SSN.test(f.value))
  if (ssn) out.ssn = ssn.value
  const dob = texts.find((f) => hint(f, /birth|dob/i) && iso(f.value))
  if (dob) out.dob = iso(dob.value)
  const email = texts.find((f) => /\S+@\S+\.\S+/.test(f.value))
  if (email) out.email = email.value
  const phone = texts.find((f) => hint(f, /phone|telephone/i))
  if (phone) out.phone = phone.value
  const street = texts.find((f) => hint(f, /address|street/i))
  if (street) out.street = street.value
  const city = texts.find((f) => hint(f, /city|town/i))
  if (city) out.city = city.value
  const state = texts.find((f) => hint(f, /^state$|\bstate\b/i) && /^[A-Za-z]{2}$/.test(f.value))
  if (state) out.state = state.value.toUpperCase()
  const zip = texts.find((f) => /^\d{5}(-\d{4})?$/.test(f.value))
  if (zip) out.zip = zip.value
  // Section 1 체크박스 1~4: 시민 / 비시민 국민 / 영주권자 / 취업허가 외국인
  const boxes = checks.filter((f) => hint(f, /CB_[1-4]|citizen|attest/i))
  const idx = (boxes.length >= 4 ? boxes : checks.slice(0, 4)).findIndex((f) => f.checked)
  if (idx >= 0) out.citizenship = (['citizen', 'national', 'lpr', 'authorized'] as const)[idx]
  const anum = texts.find((f) => hint(f, /alien|uscis|a-?number/i) && /\d{7,9}/.test(f.value))
  if (anum) out.uscis = anum.value
  const exp = texts.find((f) => hint(f, /exp/i) && iso(f.value))
  if (exp) out.workAuthExpires = iso(exp.value)
  return out
}

/**
 * 데모용 작성 가능한 PDF 샘플 (IRS·USCIS 양식이 아님).
 * 실제 W-4·I-9과 같은 칸 구성을 흉내 내 자동 입력 흐름을 체험하기 위한 파일.
 */
export async function demoFormPdf(kind: 'W-4' | 'I-9'): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const form = doc.getForm()
  page.drawText(`DEMO ${kind} SAMPLE - fillable test file, not an official IRS/USCIS form`, { x: 40, y: 750, size: 11, font })
  let y = 700
  const text = (name: string, label: string, value: string) => {
    page.drawText(label, { x: 40, y: y + 4, size: 9, font })
    const f = form.createTextField(name)
    f.setText(value)
    f.addToPage(page, { x: 220, y, width: 320, height: 18 })
    y -= 30
  }
  const check = (name: string, label: string, on: boolean) => {
    page.drawText(label, { x: 70, y: y + 4, size: 9, font })
    const c = form.createCheckBox(name)
    c.addToPage(page, { x: 40, y, width: 14, height: 14 })
    if (on) c.check()
    y -= 24
  }
  if (kind === 'W-4') {
    text('Step1a.FirstName', 'Step 1(a) First name and middle initial', 'Jamie K')
    text('Step1a.LastName', 'Last name', 'Yoon')
    text('Step1a.Address', 'Address', '9500 Bellaire Blvd #7')
    text('Step1a.CityStateZip', 'City, state, ZIP', 'Houston, TX 77036')
    text('Step1b.SSN', 'Step 1(b) SSN', '123-45-6789')
    check('Step1c.Single', 'Single or Married filing separately', false)
    check('Step1c.MFJ', 'Married filing jointly', true)
    check('Step1c.HOH', 'Head of household', false)
    check('Step2c.MultipleJobs', 'Step 2(c) Multiple jobs', false)
    text('Step3.Children', 'Step 3 Children x $2,200', '4,400')
    text('Step3.Other', 'Other dependents x $500', '0')
    text('Step3.Total', 'Step 3 total', '4,400')
    text('Step4a.OtherIncome', 'Step 4(a) Other income', '0')
    text('Step4b.Deductions', 'Step 4(b) Deductions', '2,000')
    text('Step4c.ExtraWithholding', 'Step 4(c) Extra withholding', '25')
  } else {
    text('Last Name', 'Last name', 'Yoon')
    text('First Name', 'First name', 'Jamie')
    text('Middle Initial', 'Middle initial', 'K')
    text('Address Street', 'Address', '9500 Bellaire Blvd #7')
    text('City or Town', 'City', 'Houston')
    text('State', 'State', 'TX')
    text('ZIP Code', 'ZIP', '77036')
    text('Date of Birth', 'Date of birth (mm/dd/yyyy)', '04/12/1999')
    text('US Social Security Number', 'SSN', '123-45-6789')
    text('Employee Email', 'Email', 'jamie.yoon@mail.example')
    text('Telephone', 'Phone', '(713) 555-0199')
    check('CB_1', '1. A citizen of the United States', false)
    check('CB_2', '2. A noncitizen national', false)
    check('CB_3', '3. A lawful permanent resident', false)
    check('CB_4', '4. A noncitizen authorized to work', true)
    text('USCIS ANumber', 'A-Number / USCIS number', 'A123456789')
    text('Exp Date', 'Work authorization expiration', '06/30/2028')
  }
  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
