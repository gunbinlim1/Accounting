import { ArrowLeft, ArrowRight, Building2, KeyRound, Languages, Lock, LogOut, Plus, ShieldCheck, Smartphone, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { firmName, supabase } from '../lib/supabase'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import SetupNeeded from './SetupNeeded'

const homeFor = (role?: string) => (role === 'firm' ? '/firm' : role === 'employee' ? '/me' : '/')
const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}login`

/** 6자리 인증 코드 입력 */
function CodeInput({ onComplete, busy }: { onComplete: (code: string) => void; busy: boolean }) {
  const { t } = usePrefs()
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => refs.current[0]?.focus(), [])
  const setDigit = (i: number, v: string) => {
    const only = v.replace(/\D/g, '')
    const next = [...code]
    if (only.length > 1) only.slice(0, 6 - i).split('').forEach((d, j) => (next[i + j] = d))
    else next[i] = only
    setCode(next)
    if (only && i < 5) refs.current[Math.min(5, i + only.length)]?.focus()
    if (next.join('').length === 6) onComplete(next.join(''))
  }
  return (
    <>
      <div className="code-inputs" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData('text')) }}>
        {code.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            value={d}
            disabled={busy}
            aria-label={t(`코드 ${i + 1}번째 자리`, `Digit ${i + 1}`)}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus() }}
          />
        ))}
      </div>
      <button className="btn primary lg" disabled={busy || code.join('').length !== 6} onClick={() => onComplete(code.join(''))}>
        {busy ? t('확인 중…', 'Checking…') : t('확인', 'Verify')}
      </button>
    </>
  )
}

/** 2단계 인증: 등록된 인증 앱이 있으면 코드 입력, 없으면 QR로 등록 */
function MfaStep() {
  const { t } = usePrefs()
  const { refreshAuth, logout, email } = usePortal()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!supabase || started.current) return
    started.current = true
    void (async () => {
      const { data, error: e } = await supabase.auth.mfa.listFactors()
      if (e) return setError(e.message)
      const verified = data.totp.find((f) => f.status === 'verified')
      if (verified) return setFactorId(verified.id)
      // 지난번에 끝내지 못한 등록은 지우고 새로 시작
      for (const f of data.all.filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const res = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Payday ${new Date().toISOString().slice(0, 10)}` })
      if (res.error) return setError(res.error.message)
      setFactorId(res.data.id)
      setEnroll({ qr: res.data.totp.qr_code, secret: res.data.totp.secret })
    })()
  }, [])

  const verify = async (code: string) => {
    if (!supabase || !factorId) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (e) return setError(t('코드가 맞지 않아요. 인증 앱의 현재 코드를 입력하세요.', 'That code didn’t work. Enter the current code from your app.'))
    await refreshAuth()
  }

  return (
    <>
      <button className="back-link" onClick={() => void logout()}><ArrowLeft size={16} aria-hidden /> {t('다른 계정', 'Use another account')}</button>
      <div className="mfa-icon"><Lock size={22} aria-hidden /></div>
      <h2>{t('2단계 인증', 'Two-step verification')}</h2>
      {enroll ? (
        <>
          <p className="muted">
            {t('직원 정보를 보호하기 위해 2단계 인증이 필수예요. Google Authenticator·Microsoft Authenticator 같은 인증 앱으로 QR 코드를 찍은 뒤, 앱에 나온 6자리 코드를 입력하세요.',
              'Two-step verification is required to protect employee data. Scan this QR code with an authenticator app (Google or Microsoft Authenticator), then enter the 6-digit code.')}
          </p>
          <img className="mfa-qr" src={enroll.qr} alt={t('인증 앱 등록 QR 코드', 'Authenticator QR code')} />
          <p className="muted small">{t('QR을 찍을 수 없으면 이 키를 직접 입력', 'Can’t scan? Enter this key')}: <code className="mfa-secret">{enroll.secret}</code></p>
        </>
      ) : (
        <p className="muted">{t(`${email} 계정의 인증 앱에 나온 6자리 코드를 입력하세요.`, `Enter the 6-digit code from the authenticator app for ${email}.`)}</p>
      )}
      {factorId && <CodeInput onComplete={(c) => void verify(c)} busy={busy} />}
      {error && <p className="error-text">{error}</p>}
    </>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { t, lang, toggleLang } = usePrefs()
  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <div className="login-pitch">
          <h1>{t('급여 자료, 이제 포털로 보내 주세요', 'Send payroll to your CPA in minutes')}</h1>
          <p>{t('근무시간(팁이 있으면 팁까지)만 입력하면 세금 계산부터 확인까지 끝. 회계법인이 검토해서 처리해 드립니다.', 'Enter hours (and tips, if you have them); we calculate, check, and your CPA reviews and processes it.')}</p>
          <ul>
            <li><ShieldCheck size={18} aria-hidden /> {t('2단계 인증과 암호화로 직원 정보 보호', 'Two-step sign-in and encryption protect employee data')}</li>
            <li><Building2 size={18} aria-hidden /> {t('레스토랑·서비스업·도소매업·제조업 — 업종에 맞춘 텍사스 급여', 'Texas payroll fitted to your industry: restaurants, services, retail, manufacturing')}</li>
            <li><KeyRound size={18} aria-hidden /> {t('제출하면 잠기고 모든 변경이 기록됨', 'Submissions lock and every change is logged')}</li>
          </ul>
        </div>
        <p className="login-foot">{t(`${firmName} 고객 전용 포털`, `${firmName} client portal`)}</p>
      </section>
      <section className="login-panel">
        <button className="lang-switch" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
        <div className="login-box">{children}</div>
      </section>
    </div>
  )
}

/** 로그인 → 2단계 인증 → 역할별 첫 화면 */
export default function Login() {
  const { t } = usePrefs()
  const { status, session, refreshAuth, logout, email: myEmail, error: portalError } = usePortal()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')

  if (status === 'unconfigured') return <SetupNeeded />
  if (status === 'ready' && session) return <Navigate to={homeFor(session.role)} replace />
  if (status === 'loading') return <Shell><p className="muted">{t('불러오는 중…', 'Loading…')}</p></Shell>
  if (status === 'mfa') return <Shell><MfaStep /></Shell>
  if (status === 'error')
    return (
      <Shell>
        <h2>{t('연결에 문제가 있어요', 'Something went wrong')}</h2>
        <p className="error-text">{portalError}</p>
        <button className="btn primary lg" onClick={() => void refreshAuth()}>{t('다시 시도', 'Try again')}</button>
        <button className="link-btn" onClick={() => void logout()}>{t('로그아웃', 'Sign out')}</button>
      </Shell>
    )
  if (status === 'no_role')
    return (
      <Shell>
        <h2>{t('연결된 회사가 없어요', 'No company is linked yet')}</h2>
        <p className="muted">
          {t(`${myEmail} 계정에 연결된 고객사나 직원 기록이 없습니다. 대표님이시면 회사 포털을 만드시고, 직원이시면 회사에 등록된 이메일로 가입했는지와 전자 수령 동의 여부를 대표님께 확인해 주세요.`,
            `No client company or employee record is linked to ${myEmail}. Owners can set up a company portal; employees should check with their employer that this email is on file with electronic delivery consent.`)}
        </p>
        <Link to="/signup" className="btn primary lg"><Plus size={18} aria-hidden /> {t('회사 급여 포털 만들기', 'Set up a company portal')}</Link>
        <button className="link-btn" onClick={() => void logout()}><LogOut size={14} aria-hidden /> {t('로그아웃', 'Sign out')}</button>
      </Shell>
    )
  if (status === 'recovery')
    return (
      <Shell>
        <h2>{t('새 비밀번호', 'Set a new password')}</h2>
        <form
          className="login-form"
          onSubmit={async (ev) => {
            ev.preventDefault()
            if (password.length < 10) return setError(t('10자 이상으로 정해 주세요', 'Use at least 10 characters'))
            setBusy(true)
            const { error: e } = await supabase!.auth.updateUser({ password })
            setBusy(false)
            if (e) return setError(e.message)
            setPassword('')
            await refreshAuth()
          }}
        >
          <label className="field">
            <span>{t('새 비밀번호 (10자 이상)', 'New password (10+ characters)')}</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary lg" type="submit" disabled={busy}>{t('저장', 'Save')}</button>
        </form>
      </Shell>
    )

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!supabase) return
    setError('')
    setNotice('')
    setBusy(true)
    if (mode === 'forgot') {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
      setBusy(false)
      if (e) return setError(e.message)
      return setNotice(t('비밀번호 재설정 링크를 이메일로 보냈어요.', 'We emailed you a password reset link.'))
    }
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (e) {
      return setError(
        /confirm/i.test(e.message)
          ? t('이메일 인증이 아직 안 됐어요. 받은 메일의 링크를 눌러 주세요.', 'Please confirm your email first — check your inbox for the link.')
          : /invalid login credentials/i.test(e.message)
            ? t('이메일 또는 비밀번호가 맞지 않아요.', 'Email or password is incorrect.')
            : /fetch|network/i.test(e.message)
              ? t('서버에 연결할 수 없어요. 인터넷 연결을 확인하거나 잠시 후 다시 시도하세요.', 'Can’t reach the server. Check your connection or try again shortly.')
              : t(`로그인하지 못했어요: ${e.message}`, `Couldn’t sign in: ${e.message}`),
      )
    }
    await refreshAuth()
  }

  return (
    <Shell>
      {mode === 'forgot' && (
        <button className="back-link" onClick={() => { setMode('signin'); setNotice(''); setError('') }}><ArrowLeft size={16} aria-hidden /> {t('로그인', 'Sign in')}</button>
      )}
      <h2>{mode === 'forgot' ? t('비밀번호 재설정', 'Reset your password') : t('로그인', 'Sign in')}</h2>
      <p className="muted">
        {mode === 'forgot'
          ? t('가입한 이메일로 재설정 링크를 보내 드려요.', 'We’ll email you a reset link.')
          : t('가입한 이메일과 비밀번호로 로그인하세요. 다음 단계에서 인증 앱 코드를 확인합니다.', 'Sign in with your email and password. Next, you’ll confirm a code from your authenticator app.')}
      </p>
      <form onSubmit={(e) => void submit(e)} className="login-form">
        <label className="field">
          <span>{t('이메일', 'Email')}</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus required />
        </label>
        {mode === 'signin' && (
          <label className="field">
            <span>{t('비밀번호', 'Password')}</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="saved-msg">{notice}</p>}
        <button className="btn primary lg" type="submit" disabled={busy}>
          {busy ? t('확인 중…', 'Checking…') : mode === 'forgot' ? t('재설정 링크 보내기', 'Send reset link') : t('계속', 'Continue')} <ArrowRight size={18} aria-hidden />
        </button>
      </form>
      {mode === 'signin' && <button className="link-btn" onClick={() => { setMode('forgot'); setError('') }}>{t('비밀번호를 잊으셨나요?', 'Forgot your password?')}</button>}
      <div className="signup-links">
        <Link to="/signup" className="btn lg signup-link"><Plus size={18} aria-hidden /> {t('새 회사 급여 포털 만들기', 'Set up a new company portal')}</Link>
        <Link to="/register" className="btn lg signup-link"><UserPlus size={18} aria-hidden /> {t('초대받은 계정 만들기 (직원·대표)', 'Create an invited account (employee or owner)')}</Link>
        <p className="muted small"><Smartphone size={13} aria-hidden /> {t('로그인에는 인증 앱(Google·Microsoft Authenticator 등)이 필요해요.', 'Sign-in requires an authenticator app (Google or Microsoft Authenticator, etc.).')}</p>
      </div>
    </Shell>
  )
}
