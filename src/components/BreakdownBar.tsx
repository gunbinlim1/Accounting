import { useState } from 'react'
import { formatCurrency, formatPercent } from '../lib/format'
import { usePrefs } from '../prefs'
import { segmentColor, segmentLabel, type SegmentKey } from '../lib/segments'

interface Props {
  segments: { key: SegmentKey; value: number }[]
  /** 범례(값 포함) 표시 여부 */
  legend?: boolean
  size?: 'md' | 'lg'
}

export default function BreakdownBar({ segments, legend = true, size = 'md' }: Props) {
  const { t } = usePrefs()
  const [active, setActive] = useState<SegmentKey | null>(null)
  const total = segments.reduce((s, x) => s + x.value, 0)
  const visible = segments.filter((s) => s.value > 0)
  if (total <= 0) return null

  return (
    <div className="breakdown">
      <div className={`breakdown-bar ${size}`} role="img" aria-label={t('급여 구성 막대그래프', 'Paycheck breakdown bar')}>
        {visible.map((s) => {
          const share = s.value / total
          return (
            <div
              key={s.key}
              className={`seg${active && active !== s.key ? ' dim' : ''}`}
              style={{ flexGrow: s.value, background: segmentColor[s.key] }}
              tabIndex={0}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
            >
              {active === s.key && (
                <div className="tip" role="tooltip">
                  <span className="tip-label">{segmentLabel(s.key, t)}</span>
                  <strong>{formatCurrency(s.value)}</strong>
                  <span className="muted">{formatPercent(share)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {legend && (
        <ul className="legend">
          {visible.map((s) => (
            <li
              key={s.key}
              className={active && active !== s.key ? 'dim' : ''}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="swatch" style={{ background: segmentColor[s.key] }} />
              <span className="legend-label">{segmentLabel(s.key, t)}</span>
              <span className="legend-value">{formatCurrency(s.value)}</span>
              <span className="legend-pct">{formatPercent(s.value / total, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
