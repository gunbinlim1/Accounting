import { Database, Languages } from 'lucide-react'
import { usePrefs } from '../prefs'

/** Supabase 연결 설정(환경 변수)이 없을 때 */
export default function SetupNeeded() {
  const { t, lang, toggleLang } = usePrefs()
  return (
    <div className="setup-page">
      <div className="setup-top">
        <div className="brand"><span className="brand-mark">P</span><span>Payday</span></div>
        <button className="btn sm" onClick={toggleLang}><Languages size={16} aria-hidden /> {lang === 'ko' ? 'English' : '한국어'}</button>
      </div>
      <section className="card form-card">
        <h1><Database size={22} aria-hidden /> {t('데이터베이스 연결이 필요해요', 'Database connection needed')}</h1>
        <p className="lead">
          {t('이 포털은 Supabase 데이터베이스를 사용합니다. 아직 연결 정보가 설정되지 않았어요.', 'This portal runs on a Supabase database, and its connection settings are missing.')}
        </p>
        <ol className="setup-steps">
          <li>{t('Supabase 프로젝트를 만들고 supabase/migrations의 SQL을 적용합니다.', 'Create a Supabase project and apply the SQL in supabase/migrations.')}</li>
          <li>{t('VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY(공개 키)를 빌드 환경 변수로 넣습니다. GitHub Pages는 저장소 Variables에 SUPABASE_URL·SUPABASE_ANON_KEY로 넣으면 됩니다.', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the public key) at build time. For GitHub Pages, add SUPABASE_URL and SUPABASE_ANON_KEY as repository variables.')}</li>
          <li>{t('자세한 순서는 저장소의 docs/SUPABASE.md를 보세요.', 'See docs/SUPABASE.md in the repository for the full steps.')}</li>
        </ol>
      </section>
    </div>
  )
}
