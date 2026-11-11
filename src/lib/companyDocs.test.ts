import { describe, expect, it } from 'vitest'
import { parseEinText, parseTwcText } from './companyDocs'

describe('company document extraction', () => {
  it('reads EIN, legal name, DBA and address from an SS-4 / CP 575', () => {
    const text = [
      'Form SS-4 Application for Employer Identification Number',
      'EIN: 76-5550123',
      '1 Legal name of entity (or individual) for whom the EIN is being requested',
      'Gulf Breeze Hospitality LLC',
      '2 Trade name of business (if different from name on line 1)',
      'Gulf Breeze Cafe',
      '4a Mailing address (room, apt., suite no. and street, or P.O. box)',
      '2200 Westheimer Rd Ste 110',
      '4b City, state, and ZIP code (if foreign, see instructions)',
      'Houston, TX 77098',
    ].join('\n')
    expect(parseEinText(text)).toEqual({
      ein: '76-5550123', legalName: 'Gulf Breeze Hospitality LLC', dba: 'Gulf Breeze Cafe',
      street: '2200 Westheimer Rd Ste 110', city: 'Houston', state: 'TX', zip: '77098',
    })
  })

  it('reads an EIN written without a dash next to its label', () => {
    expect(parseEinText('We assigned you Employer Identification Number 765550123').ein).toBe('76-5550123')
  })

  it('reads the TWC account number and tax rate', () => {
    const x = parseTwcText('Employer name: Gulf Breeze Hospitality LLC\nAccount Number: 99-555012-3\nYour total tax rate for 2026 is 2.70%')
    expect(x).toEqual({ twcAccount: '99-555012-3', sutaRate: '2.7', legalName: 'Gulf Breeze Hospitality LLC' })
    expect(parseTwcText('TWC Acct No. 995550123').twcAccount).toBe('99-555012-3')
  })
})
