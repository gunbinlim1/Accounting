import { CheckCircle2, Languages, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import SetupNeeded from './SetupNeeded'

/**
 * 메일 속 링크의 도착 화면 (이메일 인증·비밀번호 재설정)
 * 회사 메일 보안 검사(링크 미리 열기)가 인증을 대신 처리하지 않도록, 사람이 버튼을 눌러야 인증됩니다.
 * Supabase 메일 템플릿 링크:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 */
export default function AuthConfirm() {
  const { t, lang, toggleLang } = usePrefs()
  const { status, refreshAuth } = usePortal()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const tokenHash = params.get('token_hash') ?? ''
  const type = params.get('type') === 'recovery' ? 'recovery' : 'email'
  // 같은 사이트 안의 회계법인/고객 로그인 화면으로만 보냄
  const nextPath = (() => {
    try {
      const u = new URL(params.get('next') ?? '', window.location.origin)
      return u.origin === window.location.origin && u.pathname.endsWith('/firm/login') ? '/firm/login' : '/login'
    } catch {
      return '/login'
    }
  })()

  if (status === 'unconfigured') return <SetupNeeded />

  const confirm = async () => {
    if (!supabase || !tokenHash) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    setBusy(false)
    if (e) {
      return setError(
        /expired|invalid/i.test(e.message)
          ? t('링크가 만료되었거나 이미 사용됐어요. 로그인 화면에서 다시 시도해 주세요.', 'This link has expired or was already used. Please try again from the sign-in page.')
          : /fetch|network/i.test(e.message)
            ? t('서버에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', 'Can’t reach the server. Check your connection and try again.')
            : e.message,
      )
    }
    setDone(true)
    await refreshAuth()
    navigate(nextPath, { replace: true })
  }

  return (
    <div className="setup-page narrow">
      <div className="setup-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <button className="btn sm" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
      </div>
      <section className="card form-card">
        <h1>
          {done ? <CheckCircle2 size={22} aria-hidden /> : <MailCheck size={22} aria-hidden />}{' '}
          {type === 'recovery' ? t('비밀번호 재설정', 'Reset your password') : t('이메일 인증', 'Confirm your email')}
        </h1>
        {!tokenHash ? (
          <>
            <p className="lead">{t('인증 정보가 없는 링크예요. 메일에 있는 링크를 다시 눌러 주세요.', 'This link is missing its code. Open the link from your email again.')}</p>
            <Link to="/login" className="btn primary lg">{t('로그인으로', 'Go to sign in')}</Link>
          </>
        ) : (
          <>
            <p className="lead">
              {type === 'recovery'
                ? t('아래 버튼을 누르면 새 비밀번호를 정하는 화면으로 이동해요.', 'Press the button to continue to setting a new password.')
                : t('아래 버튼을 눌러 이메일 인증을 마치세요. 그다음 로그인하고 인증 앱을 등록합니다.', 'Press the button to finish confirming your email. Then sign in and set up your authenticator app.')}
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="btn primary lg" onClick={() => void confirm()} disabled={busy || done}>
              {busy ? t('확인 중…', 'Checking…') : type === 'recovery' ? t('계속', 'Continue') : t('이메일 인증하기', 'Confirm email')}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
