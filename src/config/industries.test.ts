import { describe, expect, it } from 'vitest'
import { defaultTimeFor, industries, industryOrder, receivesTips, roleTemplates, rolesFor } from './industries'

describe('industry profiles', () => {
  it('every listed role has a template', () => {
    for (const id of industryOrder) for (const r of industries[id].roles) expect(roleTemplates[r], `${id}:${r}`).toBeDefined()
  })

  it('manufacturing and retail never offer tipped roles', () => {
    for (const id of ['manufacturing', 'retail'] as const) {
      expect(industries[id].tipsAllowed).toBe(false)
      expect(rolesFor({ industry: id, tipsEnabled: false }).some((r) => r.payType === 'tipped' || r.tips)).toBe(false)
    }
  })

  it('restaurant defaults to tips; turning tips off hides tipped roles and zeroes tip defaults', () => {
    expect(industries.restaurant.tipsDefault).toBe(true)
    expect(rolesFor({ industry: 'restaurant', tipsEnabled: false }).map((r) => r.id)).not.toContain('server')
    expect(receivesTips('host', false)).toBe(false)
    expect(defaultTimeFor('server', false)).toMatchObject({ cashTips: 0, cardTips: 0 })
    expect(defaultTimeFor('server', true).cardTips).toBeGreaterThan(0)
  })
})
