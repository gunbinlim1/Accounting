import { CircleCheck, CircleMinus, Factory, Scissors, Store, UtensilsCrossed } from 'lucide-react'
import type { ReactNode } from 'react'
import { industries, industryOrder } from '../config/industries'
import { payrollConfig as cfg } from '../config/payrollConfig'
import { formatCurrency } from '../lib/format'
import { industryLabel } from '../lib/labels'
import { usePrefs } from '../prefs'
import type { Industry } from '../types'

const industryIcon: Record<Industry, ReactNode> = {
  restaurant: <UtensilsCrossed size={20} aria-hidden />,
  service: <Scissors size={20} aria-hidden />,
  retail: <Store size={20} aria-hidden />,
  manufacturing: <Factory size={20} aria-hidden />,
}

/** 업종 카드 목록 — 포털 만들기와 회사 정보 화면에서 같이 씀 */
export function IndustryPicker({ value, onChange }: { value: Industry | null; onChange: (i: Industry) => void }) {
  const { t, lang } = usePrefs()
  return (
    <div className="industry-grid" role="radiogroup" aria-label={t('업종', 'Industry')}>
      {industryOrder.map((id) => {
        const p = industries[id]
        return (
          <button type="button" role="radio" aria-checked={value === id} key={id} className={`industry-card${value === id ? ' on' : ''}`} onClick={() => onChange(id)}>
            <span className="industry-icon">{industryIcon[id]}</span>
            <strong>{industryLabel(id, t)}</strong>
            <span className="muted small">{t(p.descKo, p.descEn)}</span>
            <ul>{(lang === 'ko' ? p.featuresKo : p.featuresEn).map((f) => <li key={f}>{f}</li>)}</ul>
          </button>
        )
      })}
    </div>
  )
}

/** 업종·팁 설정에 따라 켜지고 꺼지는 급여 기능 */
export function FeatureList({ tipsEnabled }: { tipsEnabled: boolean }) {
  const { t } = usePrefs()
  const items: [boolean, string][] = [
    [true, t(`시급 직원 (텍사스 최저임금 ${formatCurrency(cfg.minimumWage)}, 주 40시간 초과 1.5배 OT)`, `Hourly staff (Texas minimum ${formatCurrency(cfg.minimumWage)}, 1.5× OT over 40 h/week)`)],
    [true, t('연봉 직원 (회당 = 연봉 ÷ 26)', 'Salaried staff (per check = salary ÷ 26)')],
    [tipsEnabled, t(`팁 직원 현금 시급 ${formatCurrency(cfg.tippedCashWage)} · 팁 크레딧 · $7.25 미달 자동 보전`, `Tipped cash wage ${formatCurrency(cfg.tippedCashWage)} · tip credit · $7.25 make-up`)],
    [tipsEnabled, t('급여 입력표의 현금·카드 팁 칸, 45B 팁 크레딧 추정', 'Cash & card tip columns, 45B tip credit estimate')],
    [true, t('Fringe Benefit · 401(k) · W-4·I-9', 'Fringe benefits · 401(k) · W-4 & I-9')],
  ]
  return (
    <ul className="feature-list">
      {items.map(([on, label]) => (
        <li key={label} className={on ? 'on' : 'off'}>
          {on ? <CircleCheck size={17} aria-hidden /> : <CircleMinus size={17} aria-hidden />}
          <span>{label}{!on && ` — ${t('사용 안 함', 'off')}`}</span>
        </li>
      ))}
    </ul>
  )
}
