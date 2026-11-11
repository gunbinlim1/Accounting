import { ArrowLeft, ArrowRight, Building2, KeyRound, Languages, Lock, Plus, ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { firmAccount } from '../data/demoPortal'
import { industryLabel } from '../lib/labels'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import type { Session } from '../types'
import { fullName } from '../lib/names'

/**
 * 데모 로그인: 이메일·비밀번호 → 인증 코드(MFA) → 포털.
 * 실제 서비스에서는 서버 인증으로 교체합니다.
 */
export default function Login() {
  const { t, lang, toggleLang } = usePrefs()
  const { companies, session, login } = usePortal()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Session | null>(null)
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  if (session) return <Navigate to={(session.role === 'firm' ? '/firm' : session.role === 'employee' ? '/me' : '/')} replace />

  const resolve = (addr: string): Session | null => {
    const e = addr.trim().toLowerCase()
    if (e === firmAccount.email) return { role: 'firm', name: firmAccount.name, email: e }
    const c = companies.find((x) => x.company.ownerEmail.toLowerCase() === e)
    if (c) return { role: 'client', companyId: c.company.id, name: c.company.ownerName, email: e }
    for (const co of companies) {
      const emp = co.employees.find((x) => x.email?.toLowerCase() === e && x.active)
      if (emp) return { role: 'employee', companyId: co.company.id, employeeId: emp.id, name: fullName(emp), email: e }
    }
    return null
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    const s = resolve(email)
    if (!s) return setError(t('등록되지 않은 이메일입니다. 아래 데모 계정을 눌러 보세요.', 'Email not found. Try one of the demo accounts below.'))
    if (password.length < 4) return setError(t('비밀번호를 입력하세요 (데모: 아무 4자 이상).', 'Enter a password (demo: any 4+ characters).'))
    setError('')
    setPending(s)
    setTimeout(() => codeRefs.current[0]?.focus(), 50)
  }

  const quick = (addr: string) => {
    setEmail(addr)
    setPassword('demo-password')
    setError('')
    const s = resolve(addr)
    if (s) {
      setPending(s)
      setTimeout(() => codeRefs.current[0]?.focus(), 50)
    }
  }

  const verify = (digits = code) => {
    if (digits.join('').length !== 6 || !pending) return
    login(pending)
    navigate(pending.role === 'firm' ? '/firm' : pending.role === 'employee' ? '/me' : '/', { replace: true })
  }

  const setDigit = (i: number, v: string) => {
    const only = v.replace(/\D/g, '')
    if (only.length > 1) {
      const next = [...code]
      only.slice(0, 6 - i).split('').forEach((d, j) => (next[i + j] = d))
      setCode(next)
      codeRefs.current[Math.min(5, i + only.length)]?.focus()
      if (next.join('').length === 6) verify(next)
      return
    }
    const next = [...code]
    next[i] = only
    setCode(next)
    if (only && i < 5) codeRefs.current[i + 1]?.focus()
    if (next.join('').length === 6) verify(next)
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>Payday</span>
        </div>
        <div className="login-pitch">
          <h1>{t('급여 자료, 이제 포털로 보내 주세요', 'Send payroll to your CPA in minutes')}</h1>
          <p>{t('근무시간(팁이 있으면 팁까지)만 입력하면 세금 계산부터 확인까지 끝. 회계법인이 검토해서 처리해 드립니다.', 'Enter hours (and tips, if you have them); we calculate, check, and your CPA reviews and processes it.')}</p>
          <ul>
            <li><ShieldCheck size={18} aria-hidden /> {t('2단계 인증과 암호화로 직원 정보 보호', 'Two-step sign-in and encryption protect employee data')}</li>
            <li><Building2 size={18} aria-hidden /> {t('레스토랑·서비스업·도소매업·제조업 — 업종에 맞춘 텍사스 급여', 'Texas payroll fitted to your industry: restaurants, services, retail, manufacturing')}</li>
            <li><KeyRound size={18} aria-hidden /> {t('제출하면 잠기고 모든 변경이 기록됨', 'Submissions lock and every change is logged')}</li>
          </ul>
        </div>
        <p className="login-foot">{t(`${firmAccount.firmName} 고객 전용 포털 · 데모`, `${firmAccount.firmName} client portal · demo`)}</p>
      </section>

      <section className="login-panel">
        <button className="lang-switch" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
        <div className="login-box">
          {!pending ? (
            <>
              <h2>{t('로그인', 'Sign in')}</h2>
              <p className="muted">{t('회계법인에서 받은 이메일로 로그인하세요.', 'Use the email your CPA firm invited.')}</p>
              <form onSubmit={submit} className="login-form">
                <label className="field">
                  <span>{t('이메일', 'Email')}</span>
                  <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
                </label>
                <label className="field">
                  <span>{t('비밀번호', 'Password')}</span>
                  <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                {error && <p className="error-text">{error}</p>}
                <button className="btn primary lg" type="submit">{t('계속', 'Continue')} <ArrowRight size={18} aria-hidden /></button>
              </form>
              <Link to="/signup" className="btn lg signup-link"><Plus size={18} aria-hidden /> {t('새 회사 급여 포털 만들기', 'Set up a new company portal')}</Link>

              <div className="demo-accounts">
                <span className="side-label">{t('데모 계정으로 둘러보기', 'Explore with a demo account')}</span>
                {companies.map((c) => (
                  <button key={c.company.id} className="demo-acct" onClick={() => quick(c.company.ownerEmail)}>
                    <span className="identity-logo sm">{c.company.dba.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                    <span>
                      <strong>{c.company.dba}</strong>
                      <small>{c.company.ownerName} · {t('고객 대표', 'Client owner')} · {industryLabel(c.company.industry, t)}</small>
                    </span>
                    <ArrowRight size={16} aria-hidden />
                  </button>
                ))}
                <button className="demo-acct emp" onClick={() => quick('maria.lopez@mail.example')}>
                  <span className="identity-logo sm">ML</span>
                  <span>
                    <strong>Maria Lopez</strong>
                    <small>{t('직원 포털 (Seoul Garden BBQ 서버)', 'Employee portal (Seoul Garden server)')}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </button>
                <button className="demo-acct firm" onClick={() => quick(firmAccount.email)}>
                  <span className="identity-logo sm">CPA</span>
                  <span>
                    <strong>{firmAccount.firmName}</strong>
                    <small>{firmAccount.name} · {t('회계법인 급여 담당', 'CPA payroll staff')}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="back-link" onClick={() => { setPending(null); setCode(['', '', '', '', '', '']) }}>
                <ArrowLeft size={16} aria-hidden /> {t('다른 계정', 'Use another account')}
              </button>
              <div className="mfa-icon"><Lock size={22} aria-hidden /></div>
              <h2>{t('2단계 인증', 'Two-step verification')}</h2>
              <p className="muted">
                {t(`${pending.email}로 보낸 6자리 코드를 입력하세요.`, `Enter the 6-digit code we sent to ${pending.email}.`)}
                <br />
                <small>{t('데모: 아무 숫자 6자리나 입력하면 됩니다.', 'Demo: any 6 digits work.')}</small>
              </p>
              <div className="code-inputs" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData('text')) }}>
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeRefs.current[i] = el }}
                    inputMode="numeric"
                    maxLength={6}
                    value={d}
                    aria-label={t(`코드 ${i + 1}번째 자리`, `Digit ${i + 1}`)}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus() }}
                  />
                ))}
              </div>
              <button className="btn primary lg" disabled={code.join('').length !== 6} onClick={() => verify()}>
                {t('확인', 'Verify')}
              </button>
              <button className="link-btn" onClick={() => setDigit(0, '123456')}>{t('데모 코드 자동 입력', 'Fill demo code')}</button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
