import { Link } from 'react-router-dom'
import { usePrefs } from '../prefs'

export default function NotFound() {
  const { t } = usePrefs()
  return (
    <div className="page">
      <section className="card empty">
        <h1>{t('페이지를 찾을 수 없습니다', 'Page not found')}</h1>
        <Link to="/" className="btn primary">
          {t('홈으로', 'Back home')}
        </Link>
      </section>
    </div>
  )
}
