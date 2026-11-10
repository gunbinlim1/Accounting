import { Check, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ActivityList } from '../components/RunStatus'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Company, DepositSchedule } from '../types'

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

export default function CompanySettings() {
  const { t } = usePrefs()
  const { session } = usePortal()
  const { company, updateCompanyInfo, activity } = useStore()
  const [d, setD] = useState<Company>(company)
  const [rate, setRate] = useState(String(Math.round(company.sutaRate * 10000) / 100))
  const [saved, setSaved] = useState(false)
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof Company>(k: K, v: Company[K]) => { setD((p) => ({ ...p, [k]: v })); setSaved(false) }
  const setAddr = (k: keyof Company['address'], v: string) => { setD((p) => ({ ...p, address: { ...p.address, [k]: v } })); setSaved(false) }

  const errors = {
    legalName: d.legalName.trim() ? '' : t('법인명을 입력하세요', 'Enter the legal name'),
    ein: /^\d{2}-\d{7}$/.test(d.ein) ? '' : t('XX-XXXXXXX 형식', 'Format XX-XXXXXXX'),
    rate: Number(rate) >= 0 && Number(rate) <= 10 ? '' : t('0~10% 사이', 'Between 0 and 10%'),
    ownerEmail: /\S+@\S+\.\S+/.test(d.ownerEmail) ? '' : t('이메일 형식을 확인하세요', 'Check the email'),
  }
  const valid = Object.values(errors).every((x) => !x)
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '')

  const save = () => {
    setTouched(true)
    if (!valid) return
    updateCompanyInfo({ ...d, sutaRate: Number(rate) / 100, ein: d.ein.trim() }, session?.name ?? company.ownerName)
    setSaved(true)
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{company.dba}</p>
        <h1>{t('회사 정보', 'Company')}</h1>
        <p className="lead">{t('회계법인이 급여를 처리하고 신고할 때 쓰는 정보예요. 바뀌면 바로 알려 주세요.', 'Your CPA uses this to process and file payroll. Keep it current.')}</p>
      </header>

      <div className="form-layout">
        <section className="card form-card">
          <h2>{t('사업자 정보', 'Business')}</h2>
          <div className="form-grid">
            <Field label={t('법인명 (Legal name)', 'Legal name')} error={err('legalName')}>
              <input value={d.legalName} onChange={(e) => set('legalName', e.target.value)} />
            </Field>
            <Field label={t('상호 (DBA)', 'DBA')}>
              <input value={d.dba} onChange={(e) => set('dba', e.target.value)} />
            </Field>
            <Field label={t('연방 고용주 번호 (EIN)', 'Federal EIN')} error={err('ein')}>
              <input value={d.ein} onChange={(e) => set('ein', e.target.value)} placeholder="12-3456789" />
            </Field>
            <Field label={t('전화', 'Phone')}>
              <input type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label={t('주소', 'Street address')} wide>
              <input value={d.address.street} onChange={(e) => setAddr('street', e.target.value)} />
            </Field>
            <Field label={t('도시', 'City')}>
              <input value={d.address.city} onChange={(e) => setAddr('city', e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label={t('주', 'State')}><input value={d.address.state} maxLength={2} onChange={(e) => setAddr('state', e.target.value)} /></Field>
              <Field label="ZIP"><input value={d.address.zip} onChange={(e) => setAddr('zip', e.target.value)} /></Field>
            </div>
          </div>

          <h3 className="sub">{t('텍사스·연방 급여세', 'Texas & federal payroll tax')}</h3>
          <div className="form-grid">
            <Field label={t('TWC 계정번호', 'TWC account number')}>
              <input value={d.twcAccount} onChange={(e) => set('twcAccount', e.target.value)} />
            </Field>
            <Field label={t('TWC 실업세율 (올해 통지서)', 'TWC tax rate (this year’s notice)')} error={err('rate')} hint={t('신규 고용주는 보통 2.7%', 'New employers usually 2.7%')}>
              <div className="input-affix"><input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setSaved(false) }} /><span>%</span></div>
            </Field>
            <Field label={t('IRS 예치 주기', 'IRS deposit schedule')} hint={t('직전 기준기간 고용세 $50,000 이하면 보통 월별', 'Usually monthly if lookback-period taxes were $50,000 or less')}>
              <div className="segmented">
                {(['monthly', 'semiweekly'] as DepositSchedule[]).map((s) => (
                  <button type="button" key={s} className={d.depositSchedule === s ? 'on' : ''} onClick={() => set('depositSchedule', s)}>
                    {s === 'monthly' ? t('월별', 'Monthly') : t('반주별', 'Semiweekly')}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('급여 주기 · 제출 마감', 'Pay schedule · cutoff')} hint={t('변경은 회계법인에 요청하세요', 'Ask your CPA to change')}>
              <div className="readonly-field"><Lock size={14} aria-hidden /> {t(`격주 금요일 · 지급일 ${d.cutoffBusinessDays}영업일 전 오후 3시`, `Biweekly Friday · ${d.cutoffBusinessDays} business days before, 3 PM`)}</div>
            </Field>
          </div>

          <h3 className="sub">{t('담당자', 'Contact')}</h3>
          <div className="form-grid">
            <Field label={t('대표자 이름', 'Owner name')}>
              <input value={d.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
            </Field>
            <Field label={t('로그인 이메일', 'Sign-in email')} error={err('ownerEmail')} hint={t('바꾸면 다음 로그인부터 새 이메일을 씁니다', 'Used for your next sign-in')}>
              <input type="email" value={d.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
            </Field>
          </div>

          <div className="actions form-actions">
            {saved && <span className="saved-msg"><Check size={16} aria-hidden /> {t('저장되었고 회계법인에 기록되었습니다', 'Saved and logged for your CPA')}</span>}
            <button className="btn primary" onClick={save}>{t('저장', 'Save')}</button>
          </div>
        </section>

        <aside className="card">
          <h2>{t('최근 활동', 'Recent activity')}</h2>
          <ActivityList items={activity} limit={8} />
        </aside>
      </div>
    </div>
  )
}
