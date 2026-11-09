import { ArrowLeft, ArrowRight, Check, FileCheck2, IdCard, Lock, ShieldCheck, UserRound, Utensils } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BreakdownBar from '../components/BreakdownBar'
import { companySchedule, payrollConfig as cfg } from '../config/payrollConfig'
import { restaurantRoles, roleOrder } from '../config/restaurantRoles'
import { addBusinessDays, keepLast4, maskSsn } from '../lib/compliance'
import { defaultW4 } from '../lib/federalWithholding'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../lib/format'
import { citizenshipLabel, filingLabel, payLabel, roleLabel } from '../lib/labels'
import { calculatePayroll } from '../lib/payroll'
import { parseISODate, toISODate } from '../lib/schedule'
import { segmentsOf } from '../lib/segments'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { CitizenshipStatus, Employee, FilingStatus, PayType, RoleId } from '../types'

interface DocDraft {
  title: string
  issuer: string
  number: string
  expires: string
}

interface Draft {
  id?: string
  active: boolean
  name: string
  role: RoleId
  payType: PayType
  rate: string
  pretax: string
  hireDate: string
  ssn: string
  ssnLast4Existing: string
  dob: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  zip: string
  w4Received: boolean
  filingStatus: FilingStatus
  multipleJobs: boolean
  dependents: string
  children: string
  otherDependents: string
  otherIncome: string
  deductions: string
  extraWithholding: string
  exempt: boolean
  w4Signed: string
  citizenship: CitizenshipStatus
  uscis: string
  workAuthExpires: string
  section1Date: string
  documentPath: 'A' | 'BC'
  docs: DocDraft[]
  section2Date: string
}

const today = () => toISODate(new Date())
const blankDoc: DocDraft = { title: '', issuer: '', number: '', expires: '' }

function newDraft(): Draft {
  const role: RoleId = 'server'
  return {
    active: true, name: '', role, payType: restaurantRoles[role].payType, rate: String(restaurantRoles[role].rate), pretax: '0',
    hireDate: today(), ssn: '', ssnLast4Existing: '', dob: '', phone: '', email: '',
    street: '', city: 'Houston', state: 'TX', zip: '',
    w4Received: true, filingStatus: 'single', multipleJobs: false, dependents: '0', children: '0', otherDependents: '0',
    otherIncome: '0', deductions: '0', extraWithholding: '0', exempt: false, w4Signed: today(),
    citizenship: 'citizen', uscis: '', workAuthExpires: '', section1Date: today(),
    documentPath: 'A', docs: [{ ...blankDoc }, { ...blankDoc }], section2Date: '',
  }
}

function fromEmployee(e: Employee): Draft {
  const w4 = e.w4 ?? defaultW4
  const docs = e.i9.documents.map((d) => ({ title: d.title, issuer: d.issuer, number: d.numberLast4, expires: d.expires ?? '' }))
  while (docs.length < 2) docs.push({ ...blankDoc })
  return {
    id: e.id, active: e.active, name: e.name, role: e.role, payType: e.payType, rate: String(e.rate),
    pretax: String(Math.round(e.pretaxDeferralRate * 1000) / 10), hireDate: e.hireDate,
    ssn: '', ssnLast4Existing: e.ssnLast4, dob: e.dateOfBirth ?? '', phone: e.phone ?? '', email: e.email ?? '',
    street: e.address.street, city: e.address.city, state: e.address.state, zip: e.address.zip,
    w4Received: e.w4 !== null, filingStatus: w4.filingStatus, multipleJobs: w4.multipleJobs, dependents: String(w4.dependentsAmount),
    children: '0', otherDependents: '0', otherIncome: String(w4.otherIncome), deductions: String(w4.deductions),
    extraWithholding: String(w4.extraWithholding), exempt: w4.exempt, w4Signed: w4.signedDate || today(),
    citizenship: e.i9.citizenship, uscis: e.i9.uscisLast4 ?? '', workAuthExpires: e.i9.workAuthExpires ?? '',
    section1Date: e.i9.section1Date ?? '', documentPath: e.i9.documentPath, docs, section2Date: e.i9.section2Date ?? '',
  }
}

const num = (s: string) => (s.trim() === '' ? 0 : Number(s))

function toEmployee(d: Draft, id: string): Employee {
  const docs = (d.documentPath === 'A' ? d.docs.slice(0, 1) : d.docs.slice(0, 2))
    .filter((x) => x.title.trim())
    .map((x) => ({ title: x.title.trim(), issuer: x.issuer.trim(), numberLast4: keepLast4(x.number), expires: x.expires || undefined }))
  const needsUscis = d.citizenship === 'lpr' || d.citizenship === 'authorized'
  return {
    id,
    name: d.name.trim(),
    role: d.role,
    payType: d.payType,
    rate: num(d.rate),
    pretaxDeferralRate: num(d.pretax) / 100,
    active: d.active,
    hireDate: d.hireDate,
    ssnLast4: d.ssn ? keepLast4(d.ssn) : d.ssnLast4Existing,
    dateOfBirth: d.dob || undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim() || undefined,
    address: { street: d.street.trim(), city: d.city.trim(), state: d.state.trim().toUpperCase(), zip: d.zip.trim() },
    w4: d.w4Received
      ? {
          filingStatus: d.filingStatus, multipleJobs: d.multipleJobs, dependentsAmount: num(d.dependents),
          otherIncome: num(d.otherIncome), deductions: num(d.deductions), extraWithholding: num(d.extraWithholding),
          exempt: d.exempt, signedDate: d.w4Signed,
        }
      : null,
    i9: {
      citizenship: d.citizenship,
      uscisLast4: needsUscis ? keepLast4(d.uscis) || undefined : undefined,
      workAuthExpires: d.citizenship === 'authorized' ? d.workAuthExpires || undefined : undefined,
      section1Date: d.section1Date || undefined,
      documentPath: d.documentPath,
      documents: docs,
      section2Date: d.section2Date || undefined,
    },
  }
}

/* ───────── small form primitives ───────── */

function Field({ label, hint, error, children, wide }: { label: string; hint?: string; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <em>{error}</em>}
    </label>
  )
}

function Money({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="input-affix">
      <span>$</span>
      <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button type="button" key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const listA = ['U.S. Passport', 'U.S. Passport Card', 'Permanent Resident Card (I-551)', 'Employment Authorization Document (I-766)', 'Foreign passport with I-94']
const listB = ["Driver's License", 'State ID Card', 'School ID with photograph', 'Voter registration card', 'U.S. Military card']
const listC = ['Social Security Card', 'Birth Certificate', 'Certification of Report of Birth', 'Employment authorization document (DHS)']

export default function EmployeeForm() {
  const { t, locale } = usePrefs()
  const { id } = useParams()
  const navigate = useNavigate()
  const { employees, upsertEmployee } = useStore()
  const existing = employees.find((e) => e.id === id)
  const [d, setD] = useState<Draft>(() => (existing ? fromEmployee(existing) : newDraft()))
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setDoc = (i: number, patch: Partial<DocDraft>) => setD((p) => ({ ...p, docs: p.docs.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  const steps = [
    { label: t('직무·급여', 'Role & pay'), icon: <Utensils size={16} /> },
    { label: t('개인 정보', 'Personal'), icon: <UserRound size={16} /> },
    { label: 'W-4', icon: <FileCheck2 size={16} /> },
    { label: 'I-9', icon: <IdCard size={16} /> },
    { label: t('확인', 'Review'), icon: <ShieldCheck size={16} /> },
  ]

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!d.name.trim()) e.name = t('법적 이름을 입력하세요', 'Enter the legal name')
      if (!(num(d.rate) > 0)) e.rate = t('0보다 큰 금액을 입력하세요', 'Enter an amount above 0')
      if (!d.hireDate) e.hireDate = t('입사일을 입력하세요', 'Enter the hire date')
      const p = num(d.pretax)
      if (!(p >= 0 && p <= 100)) e.pretax = t('0~100 사이', '0–100')
    }
    if (step === 1) {
      const digits = d.ssn.replace(/\D/g, '')
      if (!d.ssnLast4Existing && digits.length !== 9 && digits.length !== 4) e.ssn = t('SSN 9자리 또는 뒤 4자리를 입력하세요', 'Enter the 9-digit SSN or its last 4')
      if (d.ssn && digits.length !== 9 && digits.length !== 4) e.ssn = t('숫자 9자리 또는 4자리', '9 or 4 digits')
      if (d.zip && !/^\d{5}(-\d{4})?$/.test(d.zip.trim())) e.zip = t('ZIP 5자리', '5-digit ZIP')
    }
    if (step === 2 && d.w4Received) {
      for (const k of ['dependents', 'otherIncome', 'deductions', 'extraWithholding'] as const) {
        if (!(num(d[k]) >= 0)) e[k] = t('0 이상 숫자', 'A number ≥ 0')
      }
    }
    if (step === 3) {
      if ((d.citizenship === 'lpr' || d.citizenship === 'authorized') && keepLast4(d.uscis).length !== 4)
        e.uscis = t('A-Number/USCIS 번호를 입력하세요', 'Enter the A-Number/USCIS number')
      if (d.citizenship === 'authorized' && !d.workAuthExpires) e.workAuthExpires = t('취업허가 만료일을 입력하세요', 'Enter the expiration date')
      if (d.section2Date) {
        const need = d.documentPath === 'A' ? 1 : 2
        if (d.docs.slice(0, need).some((x) => !x.title.trim())) e.docs = t('Section 2를 완료하려면 서류를 모두 입력하세요', 'Enter all documents to complete Section 2')
      }
    }
    return e
  }, [d, step, t])

  const valid = Object.keys(errors).length === 0
  const err = (k: string) => (showErrors ? errors[k] : undefined)

  const next = () => {
    if (!valid) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep((s) => Math.min(s + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const newId = useMemo(() => {
    let n = employees.length + 1
    while (employees.some((e) => e.id === `EMP-${String(n).padStart(3, '0')}`)) n++
    return `EMP-${String(n).padStart(3, '0')}`
  }, [employees])

  const preview = useMemo(() => {
    const emp = toEmployee(d, d.id ?? newId)
    if (!(emp.rate > 0)) return null
    return calculatePayroll({ employee: emp, payFrequency: companySchedule.frequency, time: restaurantRoles[d.role].defaultTime })
  }, [d, newId])

  const save = () => {
    upsertEmployee(toEmployee(d, d.id ?? newId))
    navigate('/employees')
  }

  const pickRole = (role: RoleId) => {
    const tpl = restaurantRoles[role]
    setD((p) => ({ ...p, role, payType: tpl.payType, rate: String(tpl.rate) }))
  }

  const rateWarning =
    d.payType === 'tipped' && num(d.rate) < cfg.tippedCashWage
      ? t('팁 직원 현금 시급은 최소 $2.13입니다', 'Tipped cash wage must be at least $2.13')
      : d.payType === 'hourly' && num(d.rate) < cfg.minimumWage
        ? t('텍사스 최저임금은 $7.25입니다', 'Texas minimum wage is $7.25')
        : undefined
  const i9Due = d.hireDate ? addBusinessDays(parseISODate(d.hireDate), 3) : null

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/employees" className="back-link">
          <ArrowLeft size={16} aria-hidden /> {t('직원 목록', 'People')}
        </Link>
        <h1>{d.id ? t(`${d.name || '직원'} 정보 수정`, `Edit ${d.name || 'employee'}`) : t('새 직원 등록', 'New hire')}</h1>
        <p className="lead">{t('레스토랑 직무를 고르면 급여 형태와 시급이 자동으로 채워집니다. W-4와 I-9 핵심 항목도 함께 받아 두세요.', 'Pick a restaurant role to prefill pay. Capture the key W-4 and I-9 details as you go.')}</p>
      </header>

      <ol className="steps steps-5">
        {steps.map((s, i) => (
          <li key={s.label} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="step-dot">{i < step ? <Check size={14} /> : i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="form-layout">
        <section className="card form-card">
          {step === 0 && (
            <>
              <h2>{t('직무 템플릿', 'Role template')}</h2>
              <div className="role-grid">
                {roleOrder.map((r) => {
                  const tpl = restaurantRoles[r]
                  return (
                    <button type="button" key={r} className={`role-card${d.role === r ? ' on' : ''}`} onClick={() => pickRole(r)}>
                      <strong>{roleLabel(r, t)}</strong>
                      <span className="muted small">{payLabel(tpl, t)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="form-grid">
                <Field label={t('법적 이름 (I-9 / W-4와 동일)', 'Legal name (as on I-9 / W-4)')} error={err('name')} wide>
                  <input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Jamie Yoon" autoFocus />
                </Field>
                <Field label={t('급여 형태', 'Pay type')}>
                  <Segmented<PayType>
                    value={d.payType}
                    onChange={(v) => set('payType', v)}
                    options={[
                      { value: 'tipped', label: t('팁 직원', 'Tipped') },
                      { value: 'hourly', label: t('시급', 'Hourly') },
                      { value: 'salary', label: t('연봉', 'Salary') },
                    ]}
                  />
                </Field>
                <Field
                  label={d.payType === 'salary' ? t('연봉', 'Annual salary') : d.payType === 'tipped' ? t('현금 시급 (팁 크레딧 적용)', 'Cash wage (tip credit)') : t('시급', 'Hourly rate')}
                  error={err('rate') ?? rateWarning}
                  hint={d.payType === 'tipped' ? t('최저 $2.13 + 팁으로 $7.25 이상 보장, 부족하면 자동 보전', '$2.13 minimum; tips must bring pay to $7.25/h or we add make-up pay') : undefined}
                >
                  <Money value={d.rate} onChange={(v) => set('rate', v)} />
                </Field>
                <Field label={t('입사일 (근무 첫날)', 'Hire date (first day)')} error={err('hireDate')}>
                  <input type="date" value={d.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
                </Field>
                <Field label={t('401(k) 세전 저축률', '401(k) pre-tax rate')} error={err('pretax')}>
                  <div className="input-affix">
                    <input inputMode="decimal" value={d.pretax} onChange={(e) => set('pretax', e.target.value)} />
                    <span>%</span>
                  </div>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>{t('개인 정보', 'Personal information')}</h2>
              <div className="privacy-note">
                <Lock size={16} aria-hidden />
                {t('보안을 위해 SSN과 서류 번호는 뒤 4자리만 저장합니다. 데모 사이트이니 실제 번호를 입력하지 마세요.', 'For security only the last 4 digits of SSNs and document numbers are stored. This is a demo — do not enter real numbers.')}
              </div>
              <div className="form-grid">
                <Field
                  label={t('사회보장번호 (SSN)', 'Social Security number')}
                  error={err('ssn')}
                  hint={d.ssnLast4Existing ? t(`저장됨: ${maskSsn(d.ssnLast4Existing)} — 바꿀 때만 입력`, `On file: ${maskSsn(d.ssnLast4Existing)} — enter only to change`) : undefined}
                >
                  <input inputMode="numeric" autoComplete="off" value={d.ssn} onChange={(e) => set('ssn', e.target.value)} placeholder="123-45-6789" />
                </Field>
                <Field label={t('생년월일', 'Date of birth')}>
                  <input type="date" value={d.dob} onChange={(e) => set('dob', e.target.value)} />
                </Field>
                <Field label={t('주소', 'Street address')} wide>
                  <input value={d.street} onChange={(e) => set('street', e.target.value)} placeholder="8100 Bellaire Blvd #12" />
                </Field>
                <Field label={t('도시', 'City')}>
                  <input value={d.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <div className="field-row">
                  <Field label={t('주', 'State')}>
                    <input value={d.state} maxLength={2} onChange={(e) => set('state', e.target.value)} />
                  </Field>
                  <Field label="ZIP" error={err('zip')}>
                    <input inputMode="numeric" value={d.zip} onChange={(e) => set('zip', e.target.value)} placeholder="77036" />
                  </Field>
                </div>
                <Field label={t('전화', 'Phone')}>
                  <input type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(713) 555-0100" />
                </Field>
                <Field label={t('이메일', 'Email')}>
                  <input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="card-head">
                <h2>Form W-4 · {t('연방 원천징수', 'Federal withholding')}</h2>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={!d.w4Received} onChange={(e) => set('w4Received', !e.target.checked)} />
                <span>{t('아직 W-4를 받지 못함 (Single·조정 없음으로 원천징수)', "Haven't received a W-4 yet (withhold as Single, no adjustments)")}</span>
              </label>
              {d.w4Received && (
                <div className="w4">
                  <div className="w4-step">
                    <span className="w4-num">1c</span>
                    <Field label={t('신고 상태', 'Filing status')} wide>
                      <Segmented<FilingStatus>
                        value={d.filingStatus}
                        onChange={(v) => set('filingStatus', v)}
                        options={(['single', 'married', 'hoh'] as const).map((s) => ({ value: s, label: filingLabel(s, t) }))}
                      />
                    </Field>
                  </div>
                  <div className="w4-step">
                    <span className="w4-num">2</span>
                    <label className="toggle">
                      <input type="checkbox" checked={d.multipleJobs} onChange={(e) => set('multipleJobs', e.target.checked)} />
                      <span>
                        {t('복수 직장 또는 배우자도 근무 (Step 2(c) 체크)', 'Multiple jobs or spouse works (Step 2(c) checked)')}
                        <small className="muted block">{t('체크하면 표준공제·세율 구간을 절반으로 적용해 더 많이 원천징수', 'Uses half the standard deduction and brackets, so more is withheld')}</small>
                      </span>
                    </label>
                  </div>
                  <div className="w4-step">
                    <span className="w4-num">3</span>
                    <div className="stack-sm wide">
                      <Field label={t('부양가족 공제 합계 (연간)', 'Dependents amount (annual)')} error={err('dependents')}>
                        <Money value={d.dependents} onChange={(v) => set('dependents', v)} />
                      </Field>
                      <div className="calc-row">
                        <span className="muted small">{t('계산 도우미', 'Helper')}:</span>
                        <input className="mini" inputMode="numeric" value={d.children} onChange={(e) => set('children', e.target.value)} aria-label={t('17세 미만 자녀 수', 'Children under 17')} />
                        <span className="small">{t('자녀 × $2,200', 'children × $2,200')} +</span>
                        <input className="mini" inputMode="numeric" value={d.otherDependents} onChange={(e) => set('otherDependents', e.target.value)} aria-label={t('기타 부양가족 수', 'Other dependents')} />
                        <span className="small">{t('기타 × $500', 'other × $500')}</span>
                        <button type="button" className="chip" onClick={() => set('dependents', String(num(d.children) * 2200 + num(d.otherDependents) * 500))}>
                          {t('적용', 'Apply')}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="w4-step">
                    <span className="w4-num">4</span>
                    <div className="form-grid three">
                      <Field label={t('(a) 기타 소득 (연간)', '(a) Other income (yr)')} error={err('otherIncome')}>
                        <Money value={d.otherIncome} onChange={(v) => set('otherIncome', v)} />
                      </Field>
                      <Field label={t('(b) 추가 공제 (연간)', '(b) Deductions (yr)')} error={err('deductions')} hint={t('팁·OT 공제 예상액 포함 가능', 'May include expected tips/OT deductions')}>
                        <Money value={d.deductions} onChange={(v) => set('deductions', v)} />
                      </Field>
                      <Field label={t('(c) 회당 추가 원천징수', '(c) Extra per paycheck')} error={err('extraWithholding')}>
                        <Money value={d.extraWithholding} onChange={(v) => set('extraWithholding', v)} />
                      </Field>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="toggle">
                      <input type="checkbox" checked={d.exempt} onChange={(e) => set('exempt', e.target.checked)} />
                      <span>{t('면세(Exempt) 신청 — 매년 2월 15일까지 갱신 필요', 'Claims exempt — must be renewed by Feb 15 each year')}</span>
                    </label>
                    <Field label={t('서명일', 'Date signed')}>
                      <input type="date" value={d.w4Signed} onChange={(e) => set('w4Signed', e.target.value)} />
                    </Field>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2>Form I-9 · {t('취업 자격 확인', 'Employment eligibility')}</h2>
              <h3 className="sub">{t('Section 1 — 직원 작성 (근무 첫날까지)', 'Section 1 — Employee (by first day of work)')}</h3>
              <div className="choice-grid">
                {(['citizen', 'national', 'lpr', 'authorized'] as const).map((c, i) => (
                  <button type="button" key={c} className={`choice${d.citizenship === c ? ' on' : ''}`} onClick={() => set('citizenship', c)}>
                    <span className="choice-num">{i + 1}</span>
                    {citizenshipLabel(c, t)}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                {(d.citizenship === 'lpr' || d.citizenship === 'authorized') && (
                  <Field label={t('A-Number / USCIS 번호', 'A-Number / USCIS number')} error={err('uscis')} hint={t('뒤 4자리만 저장', 'Only the last 4 are stored')}>
                    <input value={d.uscis} onChange={(e) => set('uscis', e.target.value)} placeholder="A123456789" autoComplete="off" />
                  </Field>
                )}
                {d.citizenship === 'authorized' && (
                  <Field label={t('취업허가 만료일', 'Work authorization expires')} error={err('workAuthExpires')} hint={t('만료 90일 전부터 알림', 'Alerts start 90 days before')}>
                    <input type="date" value={d.workAuthExpires} onChange={(e) => set('workAuthExpires', e.target.value)} />
                  </Field>
                )}
                <Field label={t('Section 1 서명일', 'Section 1 signed')}>
                  <input type="date" value={d.section1Date} onChange={(e) => set('section1Date', e.target.value)} />
                </Field>
              </div>

              <h3 className="sub">
                {t('Section 2 — 고용주 서류 확인', 'Section 2 — Employer document review')}
                {i9Due && (
                  <span className="due-pill">
                    {t('기한', 'Due')} {formatDate(i9Due, locale, { month: 'short', day: 'numeric' })} ({t('3 영업일', '3 business days')})
                  </span>
                )}
              </h3>
              <Segmented<'A' | 'BC'>
                value={d.documentPath}
                onChange={(v) => set('documentPath', v)}
                options={[
                  { value: 'A', label: t('List A 1개', 'One List A') },
                  { value: 'BC', label: t('List B + List C', 'List B + List C') },
                ]}
              />
              <datalist id="list-a">{listA.map((x) => <option key={x} value={x} />)}</datalist>
              <datalist id="list-b">{listB.map((x) => <option key={x} value={x} />)}</datalist>
              <datalist id="list-c">{listC.map((x) => <option key={x} value={x} />)}</datalist>
              {(d.documentPath === 'A' ? [0] : [0, 1]).map((i) => {
                const list = d.documentPath === 'A' ? 'list-a' : i === 0 ? 'list-b' : 'list-c'
                const label = d.documentPath === 'A' ? 'List A' : i === 0 ? t('List B (신원)', 'List B (identity)') : t('List C (취업 자격)', 'List C (work eligibility)')
                return (
                  <div key={`${d.documentPath}-${i}`} className="doc-row">
                    <span className="doc-tag">{label}</span>
                    <div className="form-grid four">
                      <Field label={t('서류명', 'Document title')}>
                        <input list={list} value={d.docs[i].title} onChange={(e) => setDoc(i, { title: e.target.value })} placeholder={t('선택 또는 입력', 'Pick or type')} />
                      </Field>
                      <Field label={t('발급 기관', 'Issuing authority')}>
                        <input value={d.docs[i].issuer} onChange={(e) => setDoc(i, { issuer: e.target.value })} />
                      </Field>
                      <Field label={t('서류 번호', 'Document number')} hint={t('뒤 4자리만 저장', 'Last 4 stored')}>
                        <input value={d.docs[i].number} onChange={(e) => setDoc(i, { number: e.target.value })} autoComplete="off" />
                      </Field>
                      <Field label={t('만료일', 'Expiration')}>
                        <input type="date" value={d.docs[i].expires} onChange={(e) => setDoc(i, { expires: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                )
              })}
              {err('docs') && <p className="error-text">{err('docs')}</p>}
              <div className="form-grid">
                <Field label={t('Section 2 완료일 (원본 서류 확인)', 'Section 2 completed (originals examined)')} hint={t('비워 두면 미완료로 표시되고 기한 알림이 갑니다', 'Leave blank to track it as pending')}>
                  <input type="date" value={d.section2Date} onChange={(e) => set('section2Date', e.target.value)} />
                </Field>
              </div>
              <p className="muted small">
                {t('I-9은 입사 후 3년 또는 퇴사 후 1년 중 늦은 날까지 보관해야 합니다.', 'Keep the I-9 for 3 years after hire or 1 year after termination, whichever is later.')}
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <h2>{t('입력 내용 확인', 'Review')}</h2>
              <dl className="review-list">
                <div><dt>{t('이름', 'Name')}</dt><dd>{d.name}</dd></div>
                <div><dt>{t('직무', 'Role')}</dt><dd>{roleLabel(d.role, t)} · {payLabel({ payType: d.payType, rate: num(d.rate) }, t)}</dd></div>
                <div><dt>{t('입사일', 'Hire date')}</dt><dd>{d.hireDate}</dd></div>
                <div><dt>SSN</dt><dd>{maskSsn(d.ssn ? keepLast4(d.ssn) : d.ssnLast4Existing)}</dd></div>
                <div><dt>{t('주소', 'Address')}</dt><dd>{[d.street, d.city, d.state, d.zip].filter(Boolean).join(', ') || '—'}</dd></div>
                <div>
                  <dt>W-4</dt>
                  <dd>
                    {d.w4Received
                      ? `${filingLabel(d.filingStatus, t)}${d.multipleJobs ? ' · Step 2' : ''} · ${t('부양가족', 'dependents')} ${formatCurrencyWhole(num(d.dependents))}${num(d.extraWithholding) ? ` · +${formatCurrency(num(d.extraWithholding))}/${t('회', 'check')}` : ''}${d.exempt ? ' · Exempt' : ''}`
                      : t('미제출 — Single 기준', 'Not received — Single default')}
                  </dd>
                </div>
                <div>
                  <dt>I-9</dt>
                  <dd>
                    {citizenshipLabel(d.citizenship, t)} · {d.section2Date ? t('Section 2 완료', 'Section 2 done') : t('Section 2 대기', 'Section 2 pending')}
                  </dd>
                </div>
              </dl>
            </>
          )}

          <div className="actions between form-actions">
            <button type="button" className="btn" onClick={() => (step === 0 ? navigate('/employees') : setStep(step - 1))}>
              <ArrowLeft size={18} aria-hidden /> {step === 0 ? t('취소', 'Cancel') : t('이전', 'Back')}
            </button>
            {step < steps.length - 1 ? (
              <button type="button" className="btn primary" onClick={next}>
                {t('다음', 'Next')} <ArrowRight size={18} aria-hidden />
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={save}>
                <Check size={18} aria-hidden /> {d.id ? t('저장', 'Save') : t('직원 등록', 'Add employee')}
              </button>
            )}
          </div>
        </section>

        <aside className="card preview">
          <span className="eyebrow">{t('예상 급여 미리보기', 'Paycheck preview')}</span>
          {preview ? (
            <>
              <div className="preview-net">{formatCurrency(preview.netPay)}</div>
              <p className="muted small">
                {d.payType === 'salary'
                  ? t('격주 급여 입금액', 'Biweekly paycheck')
                  : t(
                      `${roleLabel(d.role, t)} 평균 2주 (${preview.hours}h${preview.cashTips + preview.cardTips ? `, 팁 ${formatCurrencyWhole(preview.cashTips + preview.cardTips)}` : ''}) 기준 입금액`,
                      `Typical 2 weeks as ${roleLabel(d.role, t)} (${preview.hours}h${preview.cashTips + preview.cardTips ? `, ${formatCurrencyWhole(preview.cashTips + preview.cardTips)} tips` : ''})`,
                    )}
              </p>
              <BreakdownBar segments={segmentsOf(preview)} legend={false} />
              <dl className="preview-list">
                <div><dt>{t('총급여', 'Gross')}</dt><dd>{formatCurrency(preview.grossPay)}</dd></div>
                {preview.hours > 0 && <div><dt>{t('팁 포함 시간당', 'Effective /h')}</dt><dd>{formatCurrency(preview.grossPay / preview.hours)}</dd></div>}
                <div><dt>{t('연방 소득세', 'Federal tax')}</dt><dd>−{formatCurrency(preview.federalWithholding)}</dd></div>
                <div><dt>FICA</dt><dd>−{formatCurrency(preview.socialSecurity + preview.medicare)}</dd></div>
                <div><dt>{t('텍사스 주세', 'Texas tax')}</dt><dd>$0.00</dd></div>
                <div><dt>{t('회사 인건비', 'Labor cost')}</dt><dd>{formatCurrency(preview.employerCost)}</dd></div>
              </dl>
              <p className="muted small">{t('W-4 항목을 바꾸면 즉시 반영됩니다.', 'Updates instantly as you change the W-4.')}</p>
            </>
          ) : (
            <p className="muted">{t('급여를 입력하면 미리보기가 나타납니다.', 'Enter pay to see a preview.')}</p>
          )}
        </aside>
      </div>
    </div>
  )
}
