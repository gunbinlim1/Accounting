import type { PayrollResult } from '../types'

export type SegmentKey = 'net' | 'pretax' | 'federal' | 'state' | 'ss' | 'medicare'

/** 색은 항목(key)에 고정 — 순위나 개수가 바뀌어도 색이 바뀌지 않음 */
export const segmentColor: Record<SegmentKey, string> = {
  net: 'var(--s1)',
  pretax: 'var(--s2)',
  federal: 'var(--s3)',
  state: 'var(--s4)',
  ss: 'var(--s5)',
  medicare: 'var(--s6)',
}

export const segmentLabel = (key: SegmentKey, t: (ko: string, en: string) => string): string =>
  ({
    net: t('실수령액', 'Take-home'),
    pretax: t('401(k) 저축', '401(k) savings'),
    federal: t('연방 소득세', 'Federal tax'),
    state: t('주 소득세', 'State tax'),
    ss: 'Social Security',
    medicare: 'Medicare',
  })[key]

export function segmentsOf(r: Pick<PayrollResult, 'netPay' | 'pretaxDeductions' | 'federalWithholding' | 'stateWithholding' | 'socialSecurity' | 'medicare'>) {
  return [
    { key: 'net' as const, value: r.netPay },
    { key: 'pretax' as const, value: r.pretaxDeductions },
    { key: 'federal' as const, value: r.federalWithholding },
    { key: 'state' as const, value: r.stateWithholding },
    { key: 'ss' as const, value: r.socialSecurity },
    { key: 'medicare' as const, value: r.medicare },
  ]
}
