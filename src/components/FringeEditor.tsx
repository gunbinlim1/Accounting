import { Gift, Plus, X } from 'lucide-react'
import { fringeById, fringeItems } from '../config/fringeBenefits'
import { formatCurrency } from '../lib/format'
import { usePrefs } from '../prefs'
import type { FringeEntry } from '../types'

/** 회차별 Fringe Benefit 입력. 항목을 고르면 과세 여부가 규칙표에서 자동 적용 */
export default function FringeEditor({ entries = [], onChange }: { entries?: FringeEntry[]; onChange: (next: FringeEntry[]) => void }) {
  const { t } = usePrefs()
  const update = (id: string, patch: Partial<FringeEntry>) => onChange(entries.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const add = () => onChange([...entries, { id: `fr-${Date.now()}`, itemId: 'meals', amount: 0 }])

  return (
    <div className="fringe-editor">
      <div className="fringe-head">
        <Gift size={16} aria-hidden />
        <strong>{t('Fringe Benefit', 'Fringe benefits')}</strong>
        <span className="muted small">{t('현금이 아닌 혜택의 가치 — 항목별 과세는 IRS Pub. 15-B 규칙표대로 자동 적용', 'Value of non-cash benefits — taxed automatically per the Pub. 15-B rules table')}</span>
      </div>
      {entries.length > 0 && (
        <ul className="fringe-rows">
          {entries.map((f) => {
            const item = fringeById(f.itemId)
            const tags = item
              ? item.fit === 'exempt' && !item.fica && !item.futa
                ? [t('전부 면제', 'All exempt')]
                : [
                    item.fit === 'withhold' ? t('소득세', 'Income tax') : item.fit === 'wages_only' ? t('Box 1만', 'Box 1 only') : null,
                    item.fica ? 'FICA' : null,
                    item.futa ? 'FUTA' : null,
                  ].filter(Boolean)
              : []
            return (
              <li key={f.id}>
                <select value={f.itemId} onChange={(e) => update(f.id, { itemId: e.target.value })} aria-label={t('항목', 'Item')}>
                  {fringeItems.map((i) => <option key={i.id} value={i.id}>{t(i.ko, i.en)}</option>)}
                </select>
                <span className="cell-input money">
                  <span aria-hidden>$</span>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={f.amount || ''} placeholder="0" aria-label={t('금액', 'Amount')}
                    onChange={(e) => update(f.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                </span>
                <span className="fringe-tags">
                  {item?.annualLimit && <span className="tag info">{t(`연 ${formatCurrency(item.annualLimit)}까지 면제`, `Exempt to ${formatCurrency(item.annualLimit)}/yr`)}</span>}
                  {tags.map((x) => <span key={x as string} className="tag neutral">{x}</span>)}
                  {item?.box12 && <span className="tag neutral">W-2 12{item.box12}</span>}
                  {item?.box10 && <span className="tag neutral">W-2 Box 10</span>}
                </span>
                <button type="button" className="icon-only" onClick={() => onChange(entries.filter((x) => x.id !== f.id))} aria-label={t('삭제', 'Remove')}>
                  <X size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className="chip" onClick={add}><Plus size={13} aria-hidden /> {t('항목 추가', 'Add benefit')}</button>
    </div>
  )
}
