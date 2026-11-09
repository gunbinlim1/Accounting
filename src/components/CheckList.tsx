import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Check, Severity } from '../lib/checks'
import { usePrefs } from '../prefs'

const icon: Record<Severity, ReactNode> = {
  critical: <OctagonAlert size={18} aria-hidden />,
  warning: <TriangleAlert size={18} aria-hidden />,
  info: <Info size={18} aria-hidden />,
}

export default function CheckList({ checks, limit }: { checks: Check[]; limit?: number }) {
  const { t, lang } = usePrefs()
  const label: Record<Severity, string> = {
    critical: t('확인 필요', 'Action needed'),
    warning: t('주의', 'Review'),
    info: t('참고', 'FYI'),
  }

  if (checks.length === 0) {
    return (
      <div className="check ok">
        <CircleCheck size={18} aria-hidden />
        <span className="check-tag">{t('통과', 'All clear')}</span>
        <span>{t('특이사항이 없습니다. 승인해도 좋아요!', 'Nothing unusual found. Good to approve!')}</span>
      </div>
    )
  }

  const shown = limit ? checks.slice(0, limit) : checks
  return (
    <ul className="checks">
      {shown.map((c) => (
        <li key={c.id} className={`check ${c.severity}`}>
          {icon[c.severity]}
          <span className="check-tag">{label[c.severity]}</span>
          <span>{lang === 'ko' ? c.ko : c.en}</span>
        </li>
      ))}
      {limit && checks.length > limit && (
        <li className="muted small">{t(`외 ${checks.length - limit}건`, `+${checks.length - limit} more`)}</li>
      )}
    </ul>
  )
}
