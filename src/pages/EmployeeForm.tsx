import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, FileCheck2, IdCard, Lock, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BreakdownBar from '../components/BreakdownBar'
import DocUpload from '../components/DocUpload'
import type { I9Extract, W4Extract } from '../lib/docExtract'
import { companySchedule, payrollConfig as cfg, periodsPerYear } from '../config/payrollConfig'
import { defaultTimeFor, industries, roleTemplate, rolesFor } from '../config/industries'
import { addBusinessDays, keepLast4, maskSsn } from '../lib/compliance'
import { defaultW4 } from '../lib/federalWithholding'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../lib/format'
import { citizenshipLabel, filingLabel, industryLabel, jobLabel, payLabel, roleLabel } from '../lib/labels'
import { fullName, sortName } from '../lib/names'
import { calculatePayroll } from '../lib/payroll'
import { parseISODate, toISODate } from '../lib/schedule'
import { segmentsOf } from '../lib/segments'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { CitizenshipStatus, Company, Employee, FilingStatus, PayMethod, PayType, RoleId, UploadedDoc } from '../types'

interface DocDraft {
  title: string
  issuer: string
  number: string
  expires: string
}

interface Draft {
  id?: string
  active: boolean
  lastName: string
  firstName: string
  middleInitial: string
  role: RoleId
  jobTitle: string
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
  payMethod: PayMethod
  routing: string
  account: string
  bankType: 'checking' | 'savings'
  /** 저장된 계좌 뒤 4자리 "routing|account" */
  bankExisting: string
  eConsent: boolean
  documents: UploadedDoc[]
  /** 서류에서 자동 입력된 항목 이름 */
  autoFilled: string[]
}

const today = () => toISODate(new Date())
const blankDoc: DocDraft = { title: '', issuer: '', number: '', expires: '' }

/** 업종 기본 직무 (팁 기능이 꺼져 있어 숨겨진 직무면 첫 번째 직무) */
function defaultRoleFor(company: Company): RoleId {
  const list = rolesFor(company)
  const preferred = industries[company.industry].defaultRole
  return list.some((r) => r.id === preferred) ? preferred : list[0].id
}

function newDraft(company: Company): Draft {
  const role = defaultRoleFor(company)
  const tpl = roleTemplate(role)
  return {
    active: true, lastName: '', firstName: '', middleInitial: '', role, jobTitle: '', payType: tpl.payType, rate: String(tpl.rate), pretax: '0',
    hireDate: today(), ssn: '', ssnLast4Existing: '', dob: '', phone: '', email: '',
    street: '', city: 'Houston', state: 'TX', zip: '',
    w4Received: true, filingStatus: 'single', multipleJobs: false, dependents: '0', children: '0', otherDependents: '0',
    otherIncome: '0', deductions: '0', extraWithholding: '0', exempt: false, w4Signed: today(),
    citizenship: 'citizen', uscis: '', workAuthExpires: '', section1Date: today(),
    documentPath: 'A', docs: [{ ...blankDoc }, { ...blankDoc }], section2Date: '',
    payMethod: 'direct_deposit', routing: '', account: '', bankType: 'checking', bankExisting: '', eConsent: true, documents: [], autoFilled: [],
  }
}

function fromEmployee(e: Employee): Draft {
  const w4 = e.w4 ?? defaultW4
  const docs = e.i9.documents.map((d) => ({ title: d.title, issuer: d.issuer, number: d.numberLast4, expires: d.expires ?? '' }))
  while (docs.length < 2) docs.push({ ...blankDoc })
  return {
    id: e.id, active: e.active, lastName: e.lastName, firstName: e.firstName, middleInitial: e.middleInitial ?? '', role: e.role, jobTitle: e.jobTitle ?? '', payType: e.payType, rate: String(e.rate),
    pretax: String(Math.round(e.pretaxDeferralRate * 1000) / 10), hireDate: e.hireDate,
    ssn: '', ssnLast4Existing: e.ssnLast4, dob: e.dateOfBirth ?? '', phone: e.phone ?? '', email: e.email ?? '',
    street: e.address.street, city: e.address.city, state: e.address.state, zip: e.address.zip,
    w4Received: e.w4 !== null, filingStatus: w4.filingStatus, multipleJobs: w4.multipleJobs, dependents: String(w4.dependentsAmount),
    children: '0', otherDependents: '0', otherIncome: String(w4.otherIncome), deductions: String(w4.deductions),
    extraWithholding: String(w4.extraWithholding), exempt: w4.exempt, w4Signed: w4.signedDate || today(),
    citizenship: e.i9.citizenship, uscis: e.i9.uscisLast4 ?? '', workAuthExpires: e.i9.workAuthExpires ?? '',
    section1Date: e.i9.section1Date ?? '', documentPath: e.i9.documentPath, docs, section2Date: e.i9.section2Date ?? '',
    payMethod: e.payMethod ?? 'client_check', routing: '', account: '', bankType: e.bank?.type ?? 'checking',
    bankExisting: e.bank ? `${e.bank.routingLast4}|${e.bank.accountLast4}` : '', eConsent: !!e.eConsent, documents: e.documents ?? [], autoFilled: [],
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
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    middleInitial: d.middleInitial.trim().replace(/\.$/, '').toUpperCase() || undefined,
    role: d.role,
    jobTitle: d.jobTitle.trim() || undefined,
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
    payMethod: d.payMethod,
    bank:
      d.payMethod === 'direct_deposit'
        ? {
            routingLast4: d.routing ? keepLast4(d.routing) : d.bankExisting.split('|')[0] ?? '',
            accountLast4: d.account ? keepLast4(d.account) : d.bankExisting.split('|')[1] ?? '',
            type: d.bankType,
          }
        : undefined,
    eConsent: d.eConsent,
    documents: d.documents,
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
  const { employees, upsertEmployee, company } = useStore()
  const { session } = usePortal()
  const existing = employees.find((e) => e.id === id)
  const [d, setD] = useState<Draft>(() => (existing ? fromEmployee(existing) : newDraft(company)))
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setDoc = (i: number, patch: Partial<DocDraft>) => setD((p) => ({ ...p, docs: p.docs.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  const steps = [
    { label: t('직무·급여', 'Role & pay'), icon: <BriefcaseBusiness size={16} /> },
    { label: t('개인 정보', 'Personal'), icon: <UserRound size={16} /> },
    { label: 'W-4', icon: <FileCheck2 size={16} /> },
    { label: 'I-9', icon: <IdCard size={16} /> },
    { label: t('확인', 'Review'), icon: <ShieldCheck size={16} /> },
  ]

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!d.lastName.trim()) e.lastName = t('성(Last name)을 입력하세요', 'Enter the last name')
      if (!d.firstName.trim()) e.firstName = t('이름(First name)을 입력하세요', 'Enter the first name')
      if (d.middleInitial.trim() && !/^[A-Za-z]\.?$/.test(d.middleInitial.trim())) e.middleInitial = t('영문 한 글자', 'One letter')
      if (d.role === 'other' && !d.jobTitle.trim()) e.jobTitle = t('직함을 입력하세요', 'Enter a job title')
      if (d.payType === 'tipped' && !company.tipsEnabled) e.rate = t('이 회사는 팁 기능이 꺼져 있어요', 'Tips are turned off for this company')
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
      if (d.payMethod === 'direct_deposit') {
        if (!d.bankExisting || d.routing) {
          if (d.routing.replace(/\D/g, '').length !== 9) e.routing = t('라우팅 번호 9자리', '9-digit routing number')
          if (d.account.replace(/\D/g, '').length < 4) e.account = t('계좌번호를 입력하세요', 'Enter the account number')
        }
      }
      if (d.eConsent && !/\S+@\S+\.\S+/.test(d.email)) e.email = t('전자 수령에는 이메일이 필요해요', 'Email is required for electronic delivery')
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
  }, [d, step, t, company.tipsEnabled])

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
    return calculatePayroll({ employee: emp, payFrequency: companySchedule.frequency, time: defaultTimeFor(d.role, company.tipsEnabled), sutaRate: company.sutaRate })
  }, [d, newId, company.tipsEnabled, company.sutaRate])

  const save = () => {
    upsertEmployee(toEmployee(d, d.id ?? newId), session?.name ?? company.ownerName)
    navigate('/employees')
  }

  const addDoc = (kind: 'W-4' | 'I-9', fileName: string, filled: number) =>
    ({ kind, fileName, uploadedAt: new Date().toISOString(), autoFilled: filled }) as UploadedDoc

  const applyW4 = (x: W4Extract, fileName: string) => {
    const labels = [
      (x.firstName || x.lastName) && t('이름', 'Name'), x.ssn && 'SSN', (x.street || x.city) && t('주소', 'Address'), x.filingStatus && t('신고 상태', 'Filing status'),
      x.multipleJobs !== undefined && 'Step 2', x.dependents && t('부양가족', 'Dependents'), (x.otherIncome || x.deductions || x.extraWithholding) && 'Step 4',
    ].filter(Boolean) as string[]
    setD((p) => ({
      ...p,
      firstName: x.firstName ?? p.firstName, lastName: x.lastName ?? p.lastName, middleInitial: x.middleInitial ?? p.middleInitial, ssn: x.ssn ?? p.ssn, street: x.street ?? p.street, city: x.city ?? p.city, state: x.state ?? p.state, zip: x.zip ?? p.zip,
      w4Received: true, filingStatus: x.filingStatus ?? p.filingStatus, multipleJobs: x.multipleJobs ?? p.multipleJobs,
      dependents: x.dependents ?? p.dependents, otherIncome: x.otherIncome ?? p.otherIncome, deductions: x.deductions ?? p.deductions,
      extraWithholding: x.extraWithholding ?? p.extraWithholding, exempt: x.exempt ?? p.exempt,
      documents: [...p.documents.filter((doc) => doc.kind !== 'W-4'), addDoc('W-4', fileName, labels.length)],
      autoFilled: [...new Set([...p.autoFilled, ...labels.map((l) => `W-4 ${l}`)])],
    }))
  }

  const applyI9 = (x: I9Extract, fileName: string) => {
    const labels = [
      (x.firstName || x.lastName) && t('이름', 'Name'), x.ssn && 'SSN', x.dob && t('생년월일', 'DOB'), (x.street || x.city) && t('주소', 'Address'),
      x.email && t('이메일', 'Email'), x.phone && t('전화', 'Phone'), x.citizenship && t('시민권 상태', 'Status'), x.uscis && 'A-Number', x.workAuthExpires && t('허가 만료일', 'Auth expiry'),
    ].filter(Boolean) as string[]
    setD((p) => ({
      ...p,
      firstName: p.firstName || x.firstName || '', lastName: p.lastName || x.lastName || '', middleInitial: p.middleInitial || x.middleInitial || '', ssn: p.ssn || x.ssn || '', dob: x.dob ?? p.dob, email: x.email ?? p.email, phone: x.phone ?? p.phone,
      street: p.street || x.street || '', city: x.city ?? p.city, state: x.state ?? p.state, zip: x.zip ?? p.zip,
      citizenship: x.citizenship ?? p.citizenship, uscis: x.uscis ?? p.uscis, workAuthExpires: x.workAuthExpires ?? p.workAuthExpires,
      section1Date: p.section1Date || p.hireDate,
      documents: [...p.documents.filter((doc) => doc.kind !== 'I-9'), addDoc('I-9', fileName, labels.length)],
      autoFilled: [...new Set([...p.autoFilled, ...labels.map((l) => `I-9 ${l}`)])],
    }))
  }

  const pickRole = (role: RoleId) => {
    const tpl = roleTemplate(role)
    setD((p) => ({ ...p, role, payType: tpl.payType, rate: String(tpl.rate) }))
  }
  const profile = industries[company.industry]
  const roles = rolesFor(company)
  const name = fullName({ firstName: d.firstName.trim(), lastName: d.lastName.trim(), middleInitial: d.middleInitial.trim().toUpperCase() })

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
        <h1>{d.id ? t(`${name || '직원'} 정보 수정`, `Edit ${name || 'employee'}`) : t('새 직원 등록', 'New hire')}</h1>
        <p className="lead">
          {t(`${profile.ko} 직무를 고르면 급여 형태와 시급이 자동으로 채워집니다. W-4와 I-9 핵심 항목도 함께 받아 두세요.`, `Pick a ${profile.en.toLowerCase()} role to prefill pay. Capture the key W-4 and I-9 details as you go.`)}
        </p>
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
              {!d.id && <DocUpload onW4={applyW4} onI9={applyI9} />}
              {d.autoFilled.length > 0 && (
                <div className="auto-banner">
                  <strong>{t('서류에서 자동 입력됨', 'Filled from documents')}</strong>
                  <span>{d.autoFilled.join(' · ')}</span>
                  <small className="muted">{t('각 단계에서 값을 확인하고, 틀린 곳은 고쳐 주세요.', 'Check each value in the steps ahead and fix anything wrong.')}</small>
                </div>
              )}
              <h2>{t('법적 이름', 'Legal name')}</h2>
              <p className="muted small">{t('W-4 Step 1(a)와 I-9 Section 1에 적힌 그대로 성과 이름을 따로 입력하세요. W-2와 세금 신고에 이 이름이 쓰입니다.', 'Enter the last and first name exactly as on the W-4 Step 1(a) and I-9 Section 1. This name goes on the W-2 and tax filings.')}</p>
              <div className="form-grid name-grid">
                <Field label={t('성 (Last name)', 'Last name')} error={err('lastName')}>
                  <input value={d.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Yoon" autoComplete="family-name" autoFocus />
                </Field>
                <Field label={t('이름 (First name)', 'First name')} error={err('firstName')}>
                  <input value={d.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jamie" autoComplete="given-name" />
                </Field>
                <Field label={t('미들 이니셜', 'Middle initial')} error={err('middleInitial')} hint={t('선택', 'Optional')}>
                  <input value={d.middleInitial} maxLength={2} onChange={(e) => set('middleInitial', e.target.value)} placeholder="K" />
                </Field>
              </div>
              {(d.lastName || d.firstName) && (
                <p className="muted small name-preview">
                  {t('서류 표기', 'On forms')}: <strong>{sortName({ firstName: d.firstName.trim(), lastName: d.lastName.trim(), middleInitial: d.middleInitial.trim().toUpperCase() })}</strong>
                </p>
              )}

              <h2>
                {t('직무 템플릿', 'Role template')}
                <span className="tag neutral industry-tag">{industryLabel(company.industry, t)}</span>
              </h2>
              <div className="role-grid">
                {roles.map((tpl) => (
                  <button type="button" key={tpl.id} className={`role-card${d.role === tpl.id ? ' on' : ''}`} onClick={() => pickRole(tpl.id)}>
                    <strong>{roleLabel(tpl.id, t)}</strong>
                    <span className="muted small">{tpl.id === 'other' ? t('직함 직접 입력', 'Custom title') : payLabel(tpl, t)}</span>
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <Field
                  label={d.role === 'other' ? t('직함', 'Job title') : t('직함 (선택)', 'Job title (optional)')}
                  error={err('jobTitle')}
                  hint={d.role === 'other' ? undefined : t(`비워 두면 "${roleLabel(d.role, t)}"로 표시`, `Shown as "${roleLabel(d.role, t)}" if blank`)}
                >
                  <input value={d.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder={d.role === 'other' ? t('예: Lab technician', 'e.g. Lab technician') : roleTemplate(d.role).en} />
                </Field>
                <Field label={t('급여 형태', 'Pay type')} hint={company.tipsEnabled ? undefined : t('이 회사는 팁 기능을 쓰지 않아요 (회사 정보에서 변경)', 'Tips are off for this company (change in Company)')}>
                  <Segmented<PayType>
                    value={d.payType}
                    onChange={(v) => set('payType', v)}
                    options={[
                      ...(company.tipsEnabled || d.payType === 'tipped' ? [{ value: 'tipped' as const, label: t('팁 직원', 'Tipped') }] : []),
                      { value: 'hourly', label: t('시급', 'Hourly') },
                      { value: 'salary', label: t('연봉', 'Salary') },
                    ]}
                  />
                </Field>
                <Field
                  label={d.payType === 'salary' ? t('기본 연봉', 'Default annual salary') : d.payType === 'tipped' ? t('기본 현금 시급 (팁 크레딧 적용)', 'Default cash wage (tip credit)') : t('기본 시급', 'Default hourly rate')}
                  error={err('rate') ?? rateWarning}
                  hint={
                    d.payType === 'salary'
                      ? t(`회당 ${formatCurrency(num(d.rate) / periodsPerYear[companySchedule.frequency])} (격주) · 기본값이며 급여 실행에서 회차별로 바꿀 수 있어요`, `${formatCurrency(num(d.rate) / periodsPerYear[companySchedule.frequency])} per biweekly check · default only, adjustable each run`)
                      : d.payType === 'tipped'
                        ? t('최저 $2.13, 팁 포함 $7.25 미달 시 자동 보전 · 급여 실행에서 회차별로 바꿀 수 있어요', '$2.13 minimum, topped up to $7.25/h · adjustable each run')
                        : t('기본값이며 급여 실행에서 회차별로 바꿀 수 있어요', 'Default only — adjustable each run')
                  }
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
                <Field label={t('이메일', 'Email')} error={err('email')}>
                  <input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
              </div>

              <h3 className="sub">{t('급여 지급 방법', 'How they get paid')}</h3>
              <div className="choice-grid three">
                {([
                  ['direct_deposit', t('직접입금', 'Direct deposit'), t('직원 은행 계좌로 입금', 'Into the employee’s bank')],
                  ['firm_check', t('회계법인 인쇄 수표', 'CPA-printed check'), t('회계법인이 수표를 인쇄해 준비', 'We print the check for pickup')],
                  ['client_check', t('대표님 수표', 'Your own check'), t('명세서를 보고 직접 발행', 'You write it from the stub')],
                ] as [PayMethod, string, string][]).map(([m, label, sub]) => (
                  <button type="button" key={m} className={`choice stacked${d.payMethod === m ? ' on' : ''}`} onClick={() => set('payMethod', m)}>
                    <strong>{label}</strong>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
              {d.payMethod === 'direct_deposit' && (
                <div className="form-grid three">
                  <Field label={t('라우팅 번호', 'Routing number')} error={err('routing')} hint={d.bankExisting ? t(`저장됨: ****${d.bankExisting.split('|')[0]} — 바꿀 때만 입력`, `On file: ****${d.bankExisting.split('|')[0]}`) : t('뒤 4자리만 저장', 'Last 4 stored')}>
                    <input inputMode="numeric" autoComplete="off" value={d.routing} onChange={(e) => set('routing', e.target.value)} placeholder="111000025" />
                  </Field>
                  <Field label={t('계좌번호', 'Account number')} error={err('account')} hint={d.bankExisting ? t(`저장됨: ****${d.bankExisting.split('|')[1]}`, `On file: ****${d.bankExisting.split('|')[1]}`) : t('뒤 4자리만 저장', 'Last 4 stored')}>
                    <input inputMode="numeric" autoComplete="off" value={d.account} onChange={(e) => set('account', e.target.value)} />
                  </Field>
                  <Field label={t('계좌 종류', 'Account type')}>
                    <Segmented<'checking' | 'savings'> value={d.bankType} onChange={(v) => set('bankType', v)} options={[{ value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' }]} />
                  </Field>
                </div>
              )}
              <label className="toggle">
                <input type="checkbox" checked={d.eConsent} onChange={(e) => set('eConsent', e.target.checked)} />
                <span>
                  {t('급여명세서·W-2 전자 수령에 동의함 (직원 서명 받음)', 'Employee consented to electronic pay stubs and W-2')}
                  <small className="muted block">{t('동의하면 매 회차 명세서를 이메일로 받고 W-2를 직원 포털에서 봅니다. 동의가 없으면 W-2는 종이로 발송해야 해요.', 'With consent, stubs are emailed and the W-2 is in the employee portal. Without it, the W-2 must be mailed on paper.')}</small>
                </span>
              </label>
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
                <div><dt>{t('성 / 이름', 'Last / First')}</dt><dd>{d.lastName} / {d.firstName}{d.middleInitial ? ` ${d.middleInitial.replace(/\.$/, '').toUpperCase()}.` : ''}</dd></div>
                <div><dt>{t('직무', 'Role')}</dt><dd>{jobLabel(d, t)} · {payLabel({ payType: d.payType, rate: num(d.rate) }, t)}</dd></div>
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
                  <dt>{t('지급', 'Pay by')}</dt>
                  <dd>
                    {{ direct_deposit: t('직접입금', 'Direct deposit'), firm_check: t('회계법인 인쇄 수표', 'CPA-printed check'), client_check: t('대표님 수표', 'Your own check') }[d.payMethod]}
                    {' · '}{d.eConsent ? t('전자 수령 동의', 'E-delivery consent') : t('종이 수령', 'Paper')}
                  </dd>
                </div>
                {d.documents.length > 0 && (
                  <div>
                    <dt>{t('첨부 서류', 'Documents')}</dt>
                    <dd>{d.documents.map((doc) => `${doc.kind}: ${doc.fileName}`).join(' · ')}</dd>
                  </div>
                )}
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
                      `${jobLabel(d, t)} 평균 2주 (${preview.hours}h${preview.cashTips + preview.cardTips ? `, 팁 ${formatCurrencyWhole(preview.cashTips + preview.cardTips)}` : ''}) 기준 입금액`,
                      `Typical 2 weeks as ${jobLabel(d, t)} (${preview.hours}h${preview.cashTips + preview.cardTips ? `, ${formatCurrencyWhole(preview.cashTips + preview.cardTips)} tips` : ''})`,
                    )}
              </p>
              <BreakdownBar segments={segmentsOf(preview)} legend={false} />
              <dl className="preview-list">
                <div><dt>{t('총급여', 'Gross')}</dt><dd>{formatCurrency(preview.grossPay)}</dd></div>
                {preview.hours > 0 && <div><dt>{preview.cashTips + preview.cardTips > 0 ? t('팁 포함 시간당', 'Effective /h') : t('시간당 총급여', 'Gross /h')}</dt><dd>{formatCurrency(preview.grossPay / preview.hours)}</dd></div>}
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
