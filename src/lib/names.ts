import type { Employee } from '../types'

type Named = Pick<Employee, 'firstName' | 'lastName' | 'middleInitial'>

const mi = (e: Named) => (e.middleInitial ? `${e.middleInitial.replace(/\.$/, '')}.` : '')

/** 화면 표시용: "Maria L. Lopez" */
export const fullName = (e: Named): string => [e.firstName, mi(e), e.lastName].filter(Boolean).join(' ')

/** 목록 정렬·서류용: "Lopez, Maria L." */
export const sortName = (e: Named): string => {
  const first = [e.firstName, mi(e)].filter(Boolean).join(' ')
  return e.lastName ? (first ? `${e.lastName}, ${first}` : e.lastName) : first
}

/** 성 → 이름 순 비교 */
export const compareByName = (a: Named, b: Named): number =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)

/**
 * 한 칸에 적힌 이름을 성·이름으로 나눔 (엑셀·옛 데이터용).
 * "Lopez, Maria" → 쉼표 앞이 성, "Maria L. Lopez" → 마지막 단어가 성.
 */
export function splitName(raw: string): Named {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return { firstName: '', lastName: '' }
  if (s.includes(',')) {
    const [last, rest = ''] = s.split(',').map((x) => x.trim())
    return { lastName: last, ...splitFirst(rest) }
  }
  const parts = s.split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  // "Jr.", "III" 같은 접미사는 성에 붙임
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts.at(-1)!) && parts.length > 2 ? parts.pop()! : ''
  const last = parts.pop()!
  return { ...splitFirst(parts.join(' ')), lastName: suffix ? `${last} ${suffix}` : last }
}

/** "Maria L." → 이름 Maria, 미들 이니셜 L */
export function splitFirst(raw: string): Pick<Named, 'firstName' | 'middleInitial'> {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  const tail = parts.at(-1)
  if (parts.length > 1 && tail && /^[A-Za-z]\.?$/.test(tail)) {
    parts.pop()
    return { firstName: parts.join(' '), middleInitial: tail[0].toUpperCase() }
  }
  return { firstName: parts.join(' ') }
}
