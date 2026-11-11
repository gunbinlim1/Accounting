import { ArrowLeft, ArrowRight, Building2, Check, Languages } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CompanyDocUpload from '../components/CompanyDocUpload'
import { FeatureList, IndustryPicker } from '../components/IndustryPicker'
import { industries, rolesFor } from '../config/industries'
import type { EinExtract, TwcExtract } from '../lib/companyDocs'
import { firmAccount } from '../data/demoPortal'
import { industryLabel, payLabel, roleLabel } from '../lib/labels'
import { newCompanyData, usePortal } from '../portal'
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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'company'

/**
 * 새 고객사 포털 만들기: 업종 → 급여 구성 → 회사 정보 → 확인.
 * 업종에 따라 직무 템플릿·급여 형태·팁 기능이 정해집니다.
 * - client: 대표가 직접 시작 (/signup) → 만든 뒤 바로 로그인해 홈으로
 * - firm: 회계법인이 고객사를 추가 (/firm/new)
 */
export default function CompanySetup({ mode }: { mode: 'client' | 'firm' }) {
  const { t, lang, toggleLang } = usePrefs()
  const { companies, addCompany, login, session } = usePortal()
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(blank)
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
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
      else if (email === firmAccount.email || companies.some((c) => c.company.ownerEmail.toLowerCase() === email))
        e.ownerEmail = t('이미 등록된 이메일입니다', 'This email is already in use')
    }
    return e
  }, [d, step, t, companies])
  const err = (k: string) => (showErrors ? errors[k] : undefined)

  const next = () => {
    if (Object.keys(errors).length) return setShowErrors(true)
    setShowErrors(false)
    setStep((s) => Math.min(s + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const create = () => {
    if (!d.industry) return
    let id = slug(d.dba || d.legalName)
    while (companies.some((c) => c.company.id === id)) id = `${id}-${Math.floor(Math.random() * 900 + 100)}`
    const company: Company = {
      id,
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
    if (mode === 'firm') {
      addCompany(newCompanyData(company, session?.name ?? firmAccount.name, 'firm'))
      navigate(`/firm/c/${id}`)
    } else {
      addCompany(newCompanyData(company, company.ownerName, 'client'))
      login({ role: 'client', companyId: id, name: company.ownerName, email: company.ownerEmail })
      navigate('/')
    }
  }


  const docRecord = (kind: CompanyDoc['kind'], fileName: string, filled: string[]): CompanyDoc => ({ kind, fileName, uploadedAt: new Date().toISOString(), filled })
  const applyEin = (x: EinExtract, fileName: string) =>
    setD((p) => ({
      ...p,
      ein: x.ein ?? p.ein, legalName: x.legalName ?? p.legalName, dba: x.dba ?? p.dba,
      street: x.street ?? p.street, city: x.city ?? p.city, state: x.state ?? p.state, zip: x.zip ?? p.zip,
      documents: [...p.documents.filter((doc) => doc.kind !== 'EIN'), docRecord('EIN', fileName, Object.keys(x))],
    }))
  const applyTwc = (x: TwcExtract, fileName: string) =>
    setD((p) => ({
      ...p,
      twcAccount: x.twcAccount ?? p.twcAccount, sutaRate: x.sutaRate ?? p.sutaRate, legalName: p.legalName || x.legalName || '',
      documents: [...p.documents.filter((doc) => doc.kind !== 'TWC'), docRecord('TWC', fileName, Object.keys(x))],
    }))

  const profile = d.industry ? industries[d.industry] : null
  const tipsOn = !!profile?.tipsAllowed && d.tipsEnabled
  const roles = d.industry ? rolesFor({ industry: d.industry, tipsEnabled: tipsOn }) : []

  const body = (
    <>
      <header className="page-head">
        {mode === 'firm' ? (
          <Link to="/firm" className="back-link"><ArrowLeft size={16} aria-hidden /> {t('제출 대기열', 'Payroll queue')}</Link>
        ) : (
          <Link to="/login" className="back-link"><ArrowLeft size={16} aria-hidden /> {t('로그인', 'Sign in')}</Link>
        )}
        <h1>{mode === 'firm' ? t('새 고객사 추가', 'Add a client') : t('회사 급여 포털 만들기', 'Set up your payroll portal')}</h1>
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
            <h3 className="sub">{t('대표 · 포털 로그인', 'Owner · portal sign-in')}</h3>
            <div className="form-grid">
              <Field label={t('대표자 이름', 'Owner name')} error={err('ownerName')}>
                <input value={d.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
              </Field>
              <Field label={t('로그인 이메일', 'Sign-in email')} error={err('ownerEmail')}>
                <input type="email" value={d.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
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
                ? t('만들면 대표에게 보낼 초대 이메일과 IRS 8655·TWC·계좌 인출 위임 서명 요청이 준비됩니다 (데모: 이메일 발송 없음).', 'Creating it prepares the owner invite and the 8655, TWC and bank-debit signature requests (demo: no email is sent).')
                : t('만든 뒤 홈 화면으로 이동해요. 직원을 등록하고, 회사 정보 화면에서 IRS 8655·TWC·계좌 인출 위임에 서명해 주세요.', 'You’ll land on your home page. Add employees and sign the 8655, TWC and bank-debit authorizations from the Company page.')}
            </p>
          </>
        )}

        <div className="actions between form-actions">
          <button type="button" className="btn" onClick={() => (step === 0 ? navigate(mode === 'firm' ? '/firm' : '/login') : setStep(step - 1))}>
            <ArrowLeft size={18} aria-hidden /> {step === 0 ? t('취소', 'Cancel') : t('이전', 'Back')}
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn primary" onClick={next}>{t('다음', 'Next')} <ArrowRight size={18} aria-hidden /></button>
          ) : (
            <button type="button" className="btn primary" onClick={create}>
              <Check size={18} aria-hidden /> {mode === 'firm' ? t('고객사 만들기', 'Create client') : t('포털 만들기', 'Create portal')}
            </button>
          )}
        </div>
      </section>
    </>
  )

  if (mode === 'firm') return <div className="page">{body}</div>
  return (
    <div className="setup-page">
      <div className="setup-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <button className="btn sm" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
      </div>
      <div className="page">{body}</div>
      <p className="muted small"><Building2 size={14} aria-hidden /> {t(`${firmAccount.firmName} 고객 전용 포털 · 데모 (브라우저에만 저장)`, `${firmAccount.firmName} client portal · demo (stored in this browser only)`)}</p>
    </div>
  )
}
