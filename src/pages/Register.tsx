import { ArrowLeft, Languages, MailCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import SetupNeeded from './SetupNeeded'

const redirectTo = (firm: boolean) => `${window.location.origin}${import.meta.env.BASE_URL}${firm ? 'firm/login' : 'login'}`

/**
 * 계정 만들기 (이메일·비밀번호 → 인증 메일)
 * - client: 고객사 대표·담당자. 로그인·인증 앱 등록 후 회사 포털 만들기(/setup)로 이어짐
 * - employee: 급여명세서를 보는 직원. 회사가 직원 정보에 넣은 이메일(전자 수령 동의)로 자동 연결
 * - firm: 회계법인 직원. 관리자가 등록한 뒤 로그인 가능
 */
export default function Register({ variant = 'employee' }: { variant?: 'client' | 'employee' | 'firm' }) {
  const firm = variant === 'firm'
  const client = variant === 'client'
  const { t, lang, toggleLang } = usePrefs()
  const { status } = usePortal()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (status === 'unconfigured') return <SetupNeeded />
  if (status !== 'signed_out' && status !== 'loading') return <Navigate to={firm ? '/firm/login' : '/login'} replace />

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!/\S+@\S+\.\S+/.test(email)) return setError(t('이메일 형식을 확인하세요', 'Check the email'))
    if (password.length < 10) return setError(t('비밀번호는 10자 이상', 'Password must be at least 10 characters'))
    if (password !== confirm) return setError(t('비밀번호가 일치하지 않아요', 'Passwords don’t match'))
    setBusy(true)
    setError('')
    const { error: e } = await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo(firm), data: { intent: variant } } })
    setBusy(false)
    if (e) return setError(e.message)
    setSent(true)
  }

  return (
    <div className="setup-page narrow">
      <div className="setup-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <button className="btn sm" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
      </div>
      <section className="card form-card">
        <Link to={firm ? '/firm/login' : '/login'} className="back-link"><ArrowLeft size={16} aria-hidden /> {t('로그인', 'Sign in')}</Link>
        {sent ? (
          <>
            <h1><MailCheck size={22} aria-hidden /> {t('인증 메일을 보냈어요', 'Check your email')}</h1>
            <p className="lead">
              {client
                ? t(`${email}로 보낸 링크를 눌러 이메일을 인증한 뒤 로그인하세요. 처음 로그인할 때 인증 앱을 등록하면 바로 회사 포털 만들기(업종·회사 정보 입력)로 이어집니다.`, `Click the link we sent to ${email}, then sign in. After you set up an authenticator app on first sign-in, you’ll continue to setting up your company portal.`)
                : t(`${email}로 보낸 링크를 눌러 이메일을 인증한 뒤 로그인하세요. 처음 로그인할 때 인증 앱을 등록합니다.`, `Click the link we sent to ${email}, then sign in. You’ll set up an authenticator app on first sign-in.`)}
            </p>
            <Link to={firm ? '/firm/login' : '/login'} className="btn primary lg">{t('로그인으로', 'Go to sign in')}</Link>
          </>
        ) : (
          <>
            <h1><UserPlus size={22} aria-hidden /> {client ? t('계정 만들기', 'Create an account') : firm ? t('회계법인 직원 계정 만들기', 'Create a firm staff account') : t('직원 계정 만들기', 'Create an employee account')}</h1>
            {client && (
              <ol className="steps compact-steps" aria-label={t('진행 순서', 'Steps')}>
                <li className="current"><span><span className="step-dot">1</span>{t('계정 만들기', 'Account')}</span></li>
                <li><span><span className="step-dot">2</span>{t('이메일 인증', 'Confirm email')}</span></li>
                <li><span><span className="step-dot">3</span>{t('로그인·인증 앱', 'Sign in · app')}</span></li>
                <li><span><span className="step-dot">4</span>{t('회사 포털 만들기', 'Company portal')}</span></li>
              </ol>
            )}
            <p className="lead">
              {client
                ? t('회사 이메일과 비밀번호로 계정을 만드세요. 이메일 인증과 인증 앱 등록을 마치면 업종과 회사 정보를 입력해 회사 급여 포털을 만듭니다.', 'Create your account with your work email and a password. After you confirm the email and set up an authenticator app, you’ll enter your industry and company details to set up your payroll portal.')
                : firm
                ? t('회사 이메일로 가입하세요. 이메일 인증을 마친 뒤 관리자가 회계법인 직원으로 등록하면 로그인할 수 있어요.', 'Sign up with your work email. After you confirm it, an administrator registers you as firm staff and you can sign in.')
                : t('급여명세서와 W-2를 보려는 직원용이에요. 회사가 직원 정보에 넣은 이메일로 가입하세요(전자 수령 동의 필요). 로그인하면 본인 기록에 자동으로 연결돼요. 회사 포털을 처음 만드는 경우는 로그인 화면의 "계정 만들기"를 이용하세요.', 'For employees who want to see pay stubs and W-2s. Sign up with the email your employer has on file (with e-delivery consent); it links to your record when you sign in. To set up a company portal, use “Create an account” on the sign-in page.')}
            </p>
            <form className="login-form" onSubmit={(e) => void submit(e)}>
              <label className="field"><span>{t('이메일', 'Email')}</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
              <label className="field"><span>{t('비밀번호 (10자 이상)', 'Password (10+ characters)')}</span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label className="field"><span>{t('비밀번호 확인', 'Confirm password')}</span><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
              {error && <p className="error-text">{error}</p>}
              <button className="btn primary lg" type="submit" disabled={busy}>{busy ? t('만드는 중…', 'Creating…') : t('계정 만들기', 'Create account')}</button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
