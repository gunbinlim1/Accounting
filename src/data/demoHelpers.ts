import type { BankAccount, I9Document } from '../types'

/** 데모용 가상 계좌 (체크섬이 맞는 공개 예시 라우팅 번호 + 가상 계좌번호) */
const routings = ['111000025', '021000021', '113000023', '111900659', '114000093']
export function demoBank(n: number): BankAccount {
  const routingNumber = routings[n % routings.length]
  const accountNumber = String(4_000_000_000 + ((n * 7_919_123) % 900_000_000))
  return { routingNumber, accountNumber, routingLast4: routingNumber.slice(-4), accountLast4: accountNumber.slice(-4), type: 'checking' }
}

/** 데모용 I-9 서류 사본 기록 */
export function withCopies(docs: I9Document[], who: string, date: string): I9Document[] {
  const slug = who.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')
  return docs.map((d) => ({
    ...d,
    copy: { fileName: `${slug}-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`, uploadedAt: `${date}T15:00:00.000Z` },
  }))
}
