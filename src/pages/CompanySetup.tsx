import { ArrowLeft, ArrowRight, Building2, Check, Languages } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import CompanyDocUpload from '../components/CompanyDocUpload'
import { FeatureList, IndustryPicker } from '../components/IndustryPicker'
import { industries, rolesFor } from '../config/industries'
import type { EinExtract, TwcExtract } from '../lib/companyDocs'
import { industryLabel, payLabel, roleLabel } from '../lib/labels'
import { createOwnCompany, updateCompanyDocuments, uploadDoc } from '../lib/db/api'
import { companyToRow } from '../lib/db/mappers'
import { firmName } from '../lib/supabase'
import { usePortal } from '../portal'
import SetupNeeded from './SetupNeeded'
import { usePrefs } from '../prefs'
import type { Company, CompanyDoc, DepositSchedule, Industry } from '../types'

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

interface Draft {
  industry: Industry | null
  tipsEnabled: boolean
  legalName: string
  dba: string
  ein: string
  phone: string
  street: string
  city: string
  state: string
  zip: string
  twcAccount: string
  sutaRate: string
  depositSchedule: DepositSchedule
  ownerName: string
  ownerEmail: string
  documents: CompanyDoc[]
}

const blank: Draft = {
  industry: null, tipsEnabled: false, legalName: '', dba: '', ein: '', phone: '', street: '', city: 'Houston', state: 'TX', zip: '',
  twcAccount: '', sutaRate: '2.7', depositSchedule: 'semiweekly', ownerName: '', ownerEmail: '', documents: [],
}


/**
 * 새 고객사 포털 만들기: 업종 → 급여 구성 → 회사 정보 → 확인.
 * 업종에 따라 직무 템플릿·급여 형태·팁 기능이 정해집니다.
 * - client: 대표가 직접 시작 (/signup) → 만든 뒤 바로 로그인해 홈으로
 * - firm: 회계법인이 고객사를 추가 (/firm/new)
 */
export default function CompanySetup({ mode }: { mode: 'client' | 'firm' }) {
  const { t, lang, toggleLang } = usePrefs()
  const { companies, createCompany, status, email: signedInEmail, refreshAuth, logout } = usePortal()
  const navigate = useNavigate()
  // 이미 로그인한 계정이면 그 이메일이 대표 이메일
  const [d, setD] = useState<Draft>(() => ({ ...blank, ownerEmail: mode === 'client' ? signedInEmail : '' }))
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  /** 회계법인이 고객사를 만들 때 함께 올릴 서류 파일 */
  const [files, setFiles] = useState<Partial<Record<CompanyDoc['kind'], File>>>({})
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  const pickIndustry = (i: Industry) => setD((p) => ({ ...p, industry: i, tipsEnabled: industries[i].tipsDefault }))

  const steps = [t('업종', 'Industry'), t('급여 구성', 'Pay setup'), t('회사 정보', 'Company'), t('확인', 'Confirm')]

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (step === 0 && !d.industry) e.industry = t('업종을 선택하세요', 'Pick an industry')
    if (step === 2) {
      if (!d.legalName.trim()) e.legalName = t('법인명을 입력하세요', 'Enter the legal name')
      if (!/^\d{2}-\d{7}$/.test(d.ein.trim())) e.ein = t('XX-XXXXXXX 형식', 'Format XX-XXXXXXX')
      const r = Number(d.sutaRate)
      if (!(r >= 0 && r <= 10)) e.sutaRate = t('0~10% 사이', 'Between 0 and 10%')
      if (d.zip && !/^\d{5}(-\d{4})?$/.test(d.zip.trim())) e.zip = t('ZIP 5자리', '5-digit ZIP')
      if (!d.ownerName.trim()) e.ownerName = t('대표자 이름을 입력하세요', 'Enter the owner’s name')
      const email = d.ownerEmail.trim().toLowerCase()
      if (!/\S+@\S+\.\S+/.test(email)) e.ownerEmail = t('이메일 형식을 확인하세요', 'Check the email')
      else if (mode === 'firm' && companies.some((c) => c.company.ownerEmail.toLowerCase() === email))
        e.ownerEmail = t('이미 다른 고객사의 대표 이메일이에요', 'Another client already uses this owner email')
    }
    return e
  }, [d, step, t, companies, mode, status])
  const err = (k: string) => (showErrors ? errors[k] : undefined)

  const next = () => {
    if (Object.keys(errors).length) return setShowErrors(true)
    setShowErrors(false)
    setStep((s) => Math.min(s + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toCompany = (): Company | null => {
    if (!d.industry) return null
    return {
      id: '',
      legalName: d.legalName.trim(),
      dba: d.dba.trim() || d.legalName.trim(),
      industry: d.industry,
      tipsEnabled: industries[d.industry].tipsAllowed && d.tipsEnabled,
      ein: d.ein.trim(),
      twcAccount: d.twcAccount.trim(),
      sutaRate: Number(d.sutaRate) / 100,
      depositSchedule: d.depositSchedule,
      address: { street: d.street.trim(), city: d.city.trim(), state: d.state.trim().toUpperCase(), zip: d.zip.trim() },
      ownerName: d.ownerName.trim(),
      ownerEmail: d.ownerEmail.trim().toLowerCase(),
      phone: d.phone.trim(),
      cutoffBusinessDays: 2,
      authorizations: { form8655: 'pending', twcAgent: 'pending', bankDebit: 'pending' },
      documents: d.documents,
    }
  }

  const create = async () => {
    const company = toCompany()
    if (!company) return
    setBusy(true)
    setFailure('')
    try {
      if (mode === 'firm') {
        const id = await createCompany(company, files)
        navigate(`/firm/c/${id}`)
        return
      }
      // 로그인한 계정(이메일 인증·인증 앱 완료)으로 회사 포털을 만들고 대표로 연결 → 회계법인에 새 고객사 알림
      const row = { ...companyToRow(company), documents: [] }
      const id = await createOwnCompany(row)
      // 회사 정보 화면에서 볼 수 있게 올린 SS-4·TWC 파일 보관
      const docs: CompanyDoc[] = []
      for (const doc of company.documents ?? []) {
        const file = files[doc.kind]
        docs.push(file ? { ...doc, path: await uploadDoc(id, 'company', file).catch(() => undefined) } : doc)
      }
      if (docs.length) await updateCompanyDocuments(id, docs)
      await refreshAuth()
      navigate('/')
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const docRecord = (kind: CompanyDoc['kind'], fileName: string, filled: string[]): CompanyDoc => ({ kind, fileName, uploadedAt: new Date().toISOString(), filled })
  const applyEin = (x: EinExtract, file: File) => {
    const fileName = file.name
    setFiles((f) => ({ ...f, EIN: file }))
    setD((p) => ({
      ...p,
      ein: x.ein ?? p.ein, legalName: x.legalName ?? p.legalName, dba: x.dba ?? p.dba,
      street: x.street ?? p.street, city: x.city ?? p.city, state: x.state ?? p.state, zip: x.zip ?? p.zip,
      documents: [...p.documents.filter((doc) => doc.kind !== 'EIN'), docRecord('EIN', fileName, Object.keys(x))],
    }))
  }
  const applyTwc = (x: TwcExtract, file: File) => {
    const fileName = file.name
    setFiles((f) => ({ ...f, TWC: file }))
    setD((p) => ({
      ...p,
      twcAccount: x.twcAccount ?? p.twcAccount, sutaRate: x.sutaRate ?? p.sutaRate, legalName: p.legalName || x.legalName || '',
      documents: [...p.documents.filter((doc) => doc.kind !== 'TWC'), docRecord('TWC', fileName, Object.keys(x))],
    }))
  }

  const profile = d.industry ? industries[d.industry] : null
  const tipsOn = !!profile?.tipsAllowed && d.tipsEnabled
  const roles = d.industry ? rolesFor({ industry: d.industry, tipsEnabled: tipsOn }) : []

  const body = (
    <>
      <header className="page-head">
        {mode === 'firm' ? (
          <Link to="/firm" className="back-link"><ArrowLeft size={16} aria-hidden /> {t('제출 대기열', 'Payroll queue')}</Link>
        ) : (
          <button type="button" className="back-link" onClick={() => void logout()}><ArrowLeft size={16} aria-hidden /> {t('로그아웃', 'Sign out')}</button>
        )}
        <h1>{mode === 'firm' ? t('새 고객사 추가', 'Add a client') : t('회사 급여 포털 만들기', 'Set up your company payroll portal')}</h1>
        <p className="lead">
          {t('먼저 어떤 종류의 회사인지 알려 주세요. 업종에 맞춰 직무, 급여 형태(시급·연봉·팁)와 급여 입력 화면이 준비됩니다.',
            'Start with what kind of business this is. Roles, pay types (hourly, salary, tips) and the payroll screen are set up to match.')}
        </p>
      </header>

      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="step-dot">{i < step ? <Check size={14} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="card form-card">
        {step === 0 && (
          <>
            <h2>{t('어떤 종류의 회사인가요?', 'What kind of business is it?')}</h2>
            <IndustryPicker value={d.industry} onChange={pickIndustry} />
            {err('industry') && <p className="error-text">{err('industry')}</p>}
          </>
        )}

        {step === 1 && profile && d.industry && (
          <>
            <h2>{t(`${profile.ko} 급여 구성`, `${profile.en} pay setup`)}</h2>
            {profile.tipsAllowed ? (
              <label className="toggle">
                <input type="checkbox" checked={d.tipsEnabled} onChange={(e) => set('tipsEnabled', e.target.checked)} />
                <span>
                  {t('팁을 받는 직원이 있어요', 'Some staff receive tips')}
                  <small className="muted block">
                    {t('켜면 팁 직원(현금 시급 $2.13 + 팁 크레딧)과 급여 입력표의 팁 칸이 생겨요. 나중에 회사 정보에서 바꿀 수 있어요.',
                      'Adds tipped pay ($2.13 cash wage + tip credit) and tip columns on the payroll screen. You can change this later in Company.')}
                  </small>
                </span>
              </label>
            ) : (
              <p className="muted small">
                {t(`${profile.ko}은 팁·팁 직원 최저 시급이 해당하지 않아 팁 기능 없이 시급·연봉 중심으로 준비합니다.`,
                  `${profile.en} doesn’t use tips or the tipped minimum wage, so the portal is set up for hourly and salaried pay only.`)}
              </p>
            )}
            <h3 className="sub">{t('사용할 급여 기능', 'Pay features')}</h3>
            <FeatureList tipsEnabled={tipsOn} />
            <h3 className="sub">{t('직무 템플릿', 'Role templates')}</h3>
            <p className="muted small">{t('직원을 등록할 때 직무를 고르면 급여 형태와 기본 시급·연봉이 채워져요. 기본값은 언제든 바꿀 수 있어요.', 'Picking a role when adding someone fills in the pay type and a starting rate. Every default can be changed.')}</p>
            <ul className="role-preview">
              {roles.map((r) => (
                <li key={r.id}>{roleLabel(r.id, t)}{r.id !== 'other' && <small>{payLabel(r, t)}</small>}</li>
              ))}
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <CompanyDocUpload onEin={applyEin} onTwc={applyTwc} />
            <h2>{t('사업자 정보', 'Business')}</h2>
            <div className="form-grid">
              <Field label={t('법인명 (Legal name)', 'Legal name')} error={err('legalName')}>
                <input value={d.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Example Holdings LLC" autoFocus />
              </Field>
              <Field label={t('상호 (DBA)', 'DBA')} hint={t('비우면 법인명 사용', 'Defaults to the legal name')}>
                <input value={d.dba} onChange={(e) => set('dba', e.target.value)} />
              </Field>
              <Field label={t('연방 고용주 번호 (EIN)', 'Federal EIN')} error={err('ein')}>
                <input value={d.ein} onChange={(e) => set('ein', e.target.value)} placeholder="12-3456789" />
              </Field>
              <Field label={t('전화', 'Phone')}>
                <input type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(713) 555-0100" />
              </Field>
              <Field label={t('주소', 'Street address')} wide>
                <input value={d.street} onChange={(e) => set('street', e.target.value)} />
              </Field>
              <Field label={t('도시', 'City')}>
                <input value={d.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <div className="field-row">
                <Field label={t('주', 'State')}><input value={d.state} maxLength={2} onChange={(e) => set('state', e.target.value)} /></Field>
                <Field label="ZIP" error={err('zip')}><input inputMode="numeric" value={d.zip} onChange={(e) => set('zip', e.target.value)} /></Field>
              </div>
            </div>
            <h3 className="sub">{t('텍사스·연방 급여세', 'Texas & federal payroll tax')}</h3>
            <div className="form-grid">
              <Field label={t('TWC 계정번호', 'TWC account number')} hint={t('아직 없으면 비워 두세요', 'Leave blank if not issued yet')}>
                <input value={d.twcAccount} onChange={(e) => set('twcAccount', e.target.value)} />
              </Field>
              <Field label={t('TWC 실업세율', 'TWC tax rate')} error={err('sutaRate')} hint={t('신규 고용주는 보통 2.7%', 'New employers usually 2.7%')}>
                <div className="input-affix"><input inputMode="decimal" value={d.sutaRate} onChange={(e) => set('sutaRate', e.target.value)} /><span>%</span></div>
              </Field>
              <Field label={t('IRS 예치 주기', 'IRS deposit schedule')} hint={t('기본값: 반주별 — 더 자주 예치해도 기한 위반이 아니에요', 'Default: semiweekly — depositing more often is never late')}>
                <div className="segmented">
                  {(['monthly', 'semiweekly'] as DepositSchedule[]).map((s) => (
                    <button type="button" key={s} className={d.depositSchedule === s ? 'on' : ''} onClick={() => set('depositSchedule', s)}>
                      {s === 'monthly' ? t('월별', 'Monthly') : t('반주별', 'Semiweekly')}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <h3 className="sub">{t('대표·담당자', 'Owner · contact')}</h3>
            <div className="form-grid">
              <Field label={t('대표자 이름', 'Owner name')} error={err('ownerName')}>
                <input value={d.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
              </Field>
              <Field
                label={mode === 'firm' ? t('대표 이메일 (초대)', 'Owner email (invite)') : t('로그인 이메일 (가입한 계정)', 'Sign-in email (your account)')}
                error={err('ownerEmail')}
                hint={mode === 'firm' ? t('대표가 이 이메일로 가입하면 이 회사에 자동 연결돼요', 'The owner is linked automatically on sign-up with this email') : undefined}
              >
                <input type="email" value={d.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} disabled={mode === 'client'} />
              </Field>
            </div>
          </>
        )}

        {step === 3 && d.industry && (
          <>
            <h2>{t('확인', 'Confirm')}</h2>
            <dl className="review-list">
              <div><dt>{t('업종', 'Industry')}</dt><dd>{industryLabel(d.industry, t)} · {tipsOn ? t('팁 기능 사용', 'Tips on') : t('팁 기능 없음', 'No tips')}</dd></div>
              <div><dt>{t('회사', 'Company')}</dt><dd>{d.dba.trim() || d.legalName} ({d.legalName})</dd></div>
              <div><dt>EIN</dt><dd>{d.ein}</dd></div>
              <div><dt>{t('주소', 'Address')}</dt><dd>{[d.street, d.city, d.state, d.zip].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt>TWC</dt><dd>{d.twcAccount || t('미발급', 'Not issued yet')} · {d.sutaRate}%</dd></div>
              <div><dt>{t('대표', 'Owner')}</dt><dd>{d.ownerName} · {d.ownerEmail}</dd></div>
              <div><dt>{t('급여 주기', 'Pay schedule')}</dt><dd>{t('격주 금요일 · 지급일 2영업일 전 오후 3시 마감', 'Biweekly Friday · cutoff 3 PM two business days before')}</dd></div>
            </dl>
            <p className="muted small">
              {mode === 'firm'
                ? t('만든 뒤 대표에게 이 이메일로 "초대받은 계정 만들기"에서 가입하도록 알려 주세요. 가입하면 이 회사에 자동 연결되고, 회사 정보 화면에서 IRS 8655·TWC·계좌 인출 위임에 서명할 수 있어요. (초대 메일 자동 발송은 다음 단계)', 'After creating it, ask the owner to sign up with this email via “Create an invited account”. They’re linked automatically and can sign the 8655, TWC and bank-debit authorizations on the Company page. (Automatic invite emails come later.)')
                : t('만들면 회사 포털이 열리고 홈 화면으로 이동해요. 회계법인에 새 고객사 알림이 갑니다. 다음으로 직원을 등록하고 회사 정보 화면에서 IRS 8655·TWC·계좌 인출 위임에 서명해 주세요.', 'Your portal opens and you land on the home page; your CPA firm is notified. Next, add employees and sign the 8655, TWC and bank-debit authorizations on the Company page.')}
            </p>
          </>
        )}

        {failure && <p className="error-text">{failure}</p>}
        <div className="actions between form-actions">
          <button type="button" className="btn" onClick={() => (step === 0 ? navigate(mode === 'firm' ? '/firm' : '/login') : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden /> {step === 0 ? t('취소', 'Cancel') : t('이전', 'Back')}
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn primary" onClick={next}>{t('다음', 'Next')} <ArrowRight size={18} aria-hidden /></button>
          ) : (
            <button type="button" className="btn primary" onClick={() => void create()} disabled={busy} data-testid="create-portal">
              <Check size={18} aria-hidden /> {mode === 'firm' ? t('고객사 만들기', 'Create client') : t('회사 포털 만들기', 'Create portal')}
            </button>
          )}
        </div>
      </section>
    </>
  )

  if (mode === 'firm') return <div className="page">{body}</div>
  if (status === 'unconfigured') return <SetupNeeded />
  // 회사 포털은 로그인(이메일 인증·인증 앱)까지 마친 계정만 만들 수 있음
  if (status === 'signed_out') return <Navigate to="/signup" replace />
  if (status !== 'no_role' && status !== 'loading') return <Navigate to="/login" replace />
  return (
    <div className="setup-page">
      <div className="setup-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <button className="btn sm" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
      </div>
      <div className="page">{body}</div>
      <p className="muted small"><Building2 size={14} aria-hidden /> {t(`${firmName} 고객 전용 포털`, `${firmName} client portal`)}</p>
    </div>
  )
}
