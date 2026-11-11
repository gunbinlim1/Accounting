/** 숫자만 남김 */
export const digits = (s: string): string => s.replace(/\D/g, '')

/**
 * ABA 라우팅 번호 검증: 9자리 + 체크섬
 * 3·7·1 가중치 합이 10의 배수여야 함
 */
export function isValidRouting(raw: string): boolean {
  const d = digits(raw)
  if (d.length !== 9 || raw.replace(/[\s-]/g, '').length !== 9) return false
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  return [...d].reduce((sum, c, i) => sum + Number(c) * w[i], 0) % 10 === 0
}

/** 미국 은행 계좌번호: 숫자 4~17자리 */
export const isValidAccount = (raw: string): boolean => /^\d{4,17}$/.test(raw.replace(/[\s-]/g, ''))

/** 화면 표시: ****6789 */
export const maskAccount = (n: string): string => (n ? `****${n.slice(-4)}` : '—')
