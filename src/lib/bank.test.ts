import { describe, expect, it } from 'vitest'
import { isValidAccount, isValidRouting } from './bank'

describe('bank numbers', () => {
  it('checks ABA routing checksum', () => {
    expect(isValidRouting('111000025')).toBe(true)
    expect(isValidRouting('021000021')).toBe(true)
    expect(isValidRouting('111000026')).toBe(false)
    expect(isValidRouting('0025')).toBe(false)
  })
  it('requires a full 4–17 digit account number', () => {
    expect(isValidAccount('123456789012')).toBe(true)
    expect(isValidAccount('123')).toBe(false)
    expect(isValidAccount('12ab5678')).toBe(false)
  })
})
