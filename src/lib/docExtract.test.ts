import { describe, expect, it } from 'vitest'
import { mapI9, mapW4, type PdfField } from './docExtract'

const txt = (name: string, value: string): PdfField => ({ name, value, kind: 'text' })

describe('form name extraction', () => {
  it('W-4 Step 1(a): first name + middle initial, last name separate', () => {
    const x = mapW4([txt('Step1a.FirstName', 'Jamie K'), txt('Step1a.LastName', 'Yoon')])
    expect(x).toMatchObject({ firstName: 'Jamie', middleInitial: 'K', lastName: 'Yoon' })
  })

  it('I-9 Section 1: last, first, middle initial fields', () => {
    const x = mapI9([txt('Last Name', 'Yoon'), txt('First Name', 'Jamie'), txt('Middle Initial', 'k')])
    expect(x).toMatchObject({ firstName: 'Jamie', middleInitial: 'K', lastName: 'Yoon' })
  })
})
