import { ArrowLeft, Languages, MailCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import SetupNeeded from './SetupNeeded'

const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}login`

/**
 * 초대받은 계정 만들기: 회사에 등록된 이메일로 가입하면 로그인 후 자동 연결
 * - 직원: 대표가 직원 정보에 넣은 이메일 + 전자 수령 동의
 * - 대표: 회계법인이 고객사를 만들 때 넣은 대표 이메일
 */
export default function Register() {
  const { t, lang, toggleLang } = usePrefs()
  const { status } = usePortal()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (status === 'unconfigured') return <SetupNeeded />
  if (status !== 'signed_out' && status !== 'loading') return <Navigate to="/login" replace />

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!/\S+@\S+\.\S+/.test(email)) return setError(t('이메일 형식을 확인하세요', 'Check the email'))
    if (password.length < 10) return setError(t('비밀번호는 10자 이상', 'Password must be at least 10 characters'))
    if (password !== confirm) return setError(t('비밀번호가 일치하지 않아요', 'Passwords don’t match'))
    setBusy(true)
    setError('')
    const { error: e } = await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo() } })
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
        <Link to="/login" className="back-link"><ArrowLeft size={16} aria-hidden /> {t('로그인', 'Sign in')}</Link>
        {sent ? (
          <>
            <h1><MailCheck size={22} aria-hidden /> {t('인증 메일을 보냈어요', 'Check your email')}</h1>
            <p className="lead">{t(`${email}로 보낸 링크를 눌러 이메일을 인증한 뒤 로그인하세요. 처음 로그인할 때 인증 앱을 등록합니다.`, `Click the link we sent to ${email}, then sign in. You’ll set up an authenticator app on first sign-in.`)}</p>
          </>
        ) : (
          <>
            <h1><UserPlus size={22} aria-hidden /> {t('초대받은 계정 만들기', 'Create an invited account')}</h1>
            <p className="lead">
              {t('회사에 등록된 이메일로 가입하세요. 직원은 대표님이 직원 정보에 넣은 이메일(전자 수령 동의 필요), 대표님은 회계법인이 고객사를 만들 때 넣은 이메일입니다. 로그인하면 자동으로 연결돼요.',
                'Sign up with the email your company has on file: employees use the email their employer entered (with e-delivery consent); owners use the email the firm entered for the company. It links automatically when you sign in.')}
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
