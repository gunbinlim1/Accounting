import { CalendarDays, CalendarRange, Repeat, Repeat1 } from 'lucide-react'
import { frequencyInfo } from '../lib/paySchedules'
import { usePrefs } from '../prefs'
import type { PayFrequency } from '../types'

const icons = { weekly: Repeat1, biweekly: Repeat, semimonthly: CalendarRange, monthly: CalendarDays }

/** 지급 주기 표시 — 주기마다 색·아이콘이 달라 한눈에 구분 (매주 보라, 격주 파랑, 월 2회 청록, 매월 주황) */
export default function FrequencyBadge({ frequency, name, size = 'md', detail }: { frequency: PayFrequency; name?: string; size?: 'sm' | 'md' | 'lg'; detail?: boolean }) {
  const { t } = usePrefs()
  const info = frequencyInfo(frequency, t)
  const Icon = icons[frequency]
  return (
    <span className={`freq-badge freq-${frequency} ${size}`} title={info.detail}>
      <Icon size={size === 'lg' ? 16 : 13} aria-hidden />
      <strong>{info.label}</strong>
      {name && <span className="freq-name">· {name}</span>}
      {detail && <span className="freq-detail">{info.detail}</span>}
    </span>
  )
}
