import type { PayrollResult } from '../types'

export type SegmentKey = 'net' | 'cashTips' | 'pretax' | 'federal' | 'ss' | 'medicare'

/** 색은 항목(key)에 고정 — 순위나 개수가 바뀌어도 색이 바뀌지 않음 */
export const segmentColor: Record<SegmentKey, string> = {
  net: 'var(--s1)',
  cashTips: 'var(--s2)',
  pretax: 'var(--s3)',
  federal: 'var(--s4)',
  ss: 'var(--s5)',
  medicare: 'var(--s6)',
}

export const segmentLabel = (key: SegmentKey, t: (ko: string, en: string) => string): string =>
  ({
    net: t('급여 입금액', 'Paycheck'),
    cashTips: t('현금 팁 (이미 받음)', 'Cash tips (kept)'),
    pretax: t('401(k) 저축', '401(k) savings'),
    federal: t('연방 소득세', 'Federal income tax'),
    ss: 'Social Security',
    medicare: 'Medicare',
  })[key]

type SegmentSource = Pick<PayrollResult, 'netPay' | 'cashTips' | 'pretaxDeductions' | 'federalWithholding' | 'socialSecurity' | 'medicare'>

/** 총급여(팁 포함)가 어디로 가는지 — 합계가 grossPay와 같음 */
export function segmentsOf(r: SegmentSource) {
  return [
    { key: 'net' as const, value: r.netPay },
    { key: 'cashTips' as const, value: r.cashTips },
    { key: 'pretax' as const, value: r.pretaxDeductions },
    { key: 'federal' as const, value: r.federalWithholding },
    { key: 'ss' as const, value: r.socialSecurity },
    { key: 'medicare' as const, value: r.medicare },
  ]
}
