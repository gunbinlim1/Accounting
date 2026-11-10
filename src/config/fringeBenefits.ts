/**
 * Fringe Benefit 과세 규칙표 (IRS Publication 15-B 요약).
 * 회계법인이 연도별로 관리하는 데이터 — 계산과 W-2는 이 표만 따른다.
 * ⚠️ 한도는 2026년 Pub. 15-B와 대조 후 사용하세요.
 */

/** 연방 소득세 처리: 원천징수 대상 / Box 1에만 포함(원천징수 선택) / 면제 */
export type FitTreatment = 'withhold' | 'wages_only' | 'exempt'

export interface FringeItem {
  id: string
  ko: string
  en: string
  fit: FitTreatment
  fica: boolean
  futa: boolean
  /** 연간 면제 한도 — 초과분은 연방 소득세·FICA·FUTA 모두 과세 */
  annualLimit?: number
  /** W-2 Box 12 코드 (보고용) */
  box12?: string
  /** W-2 Box 10 (부양가족 돌봄) */
  box10?: boolean
  /** W-2 Box 14 표시 */
  box14?: string
  noteKo: string
  noteEn: string
}

export const fringeItems: FringeItem[] = [
  { id: 'health', ko: '회사 부담 건강보험', en: 'Employer health coverage', fit: 'exempt', fica: false, futa: false, box12: 'DD', noteKo: '면제 · W-2 Box 12 DD로 보고만', noteEn: 'Exempt · reported in Box 12 DD' },
  { id: 'scorp_health', ko: '2% S-corp 주주 건강보험', en: '2% S-corp shareholder health', fit: 'withhold', fica: false, futa: false, box14: 'S-corp health', noteKo: '연방 소득세만 과세 (Box 1, 3·5 제외)', noteEn: 'Income tax only (Box 1, not 3/5)' },
  { id: 'gtl', ko: '단체 생명보험 $50k 초과분', en: 'Group-term life over $50k', fit: 'wages_only', fica: true, futa: false, box12: 'C', noteKo: 'Box 1 포함(원천징수 선택) · FICA 과세 · Box 12 C', noteEn: 'In Box 1 (withholding optional) · FICA · Box 12 C' },
  { id: 'meals', ko: '매장 내 직원 식사 (회사 편의)', en: 'On-premises meals (employer convenience)', fit: 'exempt', fica: false, futa: false, noteKo: '근무 중 매장에서 제공하는 식사 — 면제', noteEn: 'Meals on premises during shifts — exempt' },
  { id: 'de_minimis', ko: '소액 혜택 (de minimis)', en: 'De minimis benefit', fit: 'exempt', fica: false, futa: false, noteKo: '간식, 가끔 주는 비현금 선물 — 면제', noteEn: 'Snacks, occasional non-cash gifts — exempt' },
  { id: 'gift_card', ko: '현금·기프트카드', en: 'Cash or gift card', fit: 'withhold', fica: true, futa: true, noteKo: '금액 무관 항상 과세', noteEn: 'Always taxable, any amount' },
  { id: 'dependent_care', ko: '부양가족 돌봄 지원', en: 'Dependent care assistance', fit: 'withhold', fica: true, futa: true, annualLimit: 7_500, box10: true, noteKo: '연 $7,500까지 면제 (2026) · Box 10', noteEn: 'Exempt up to $7,500/yr (2026) · Box 10' },
  { id: 'education', ko: '학비 지원 (Sec. 127)', en: 'Educational assistance', fit: 'withhold', fica: true, futa: true, annualLimit: 5_250, noteKo: '연 $5,250까지 면제', noteEn: 'Exempt up to $5,250/yr' },
  { id: 'vehicle', ko: '회사 차량 개인 사용', en: 'Personal use of company vehicle', fit: 'withhold', fica: true, futa: true, box14: 'Vehicle', noteKo: '과세 · 평가액을 임금에 포함', noteEn: 'Taxable · include the value in wages' },
  { id: 'award', ko: '근속·안전 상품 (물품)', en: 'Achievement award (property)', fit: 'withhold', fica: true, futa: true, annualLimit: 400, noteKo: '연 $400까지 면제 (현금은 과세)', noteEn: 'Exempt up to $400/yr (cash is taxable)' },
  { id: 'moving', ko: '이사 비용 지원', en: 'Moving expense reimbursement', fit: 'withhold', fica: true, futa: true, noteKo: '과세 (군인 제외)', noteEn: 'Taxable (except military)' },
  { id: 'hsa', ko: 'HSA 회사 납입 (카페테리아)', en: 'Employer HSA contribution', fit: 'exempt', fica: false, futa: false, box12: 'W', noteKo: '한도 내 면제 · Box 12 W', noteEn: 'Exempt within limits · Box 12 W' },
]

/** 한도가 있는 항목은 '한도 내 면제'로 표시하고, 위 플래그는 초과분에 적용 */
export const fringeById = (id: string): FringeItem | undefined => fringeItems.find((f) => f.id === id)
