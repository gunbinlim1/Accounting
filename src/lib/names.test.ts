import { describe, expect, it } from 'vitest'
import { compareByName, fullName, sortName, splitName } from './names'

describe('employee names', () => {
  it('formats full and sort names', () => {
    const e = { firstName: 'Maria', middleInitial: 'L', lastName: 'Lopez' }
    expect(fullName(e)).toBe('Maria L. Lopez')
    expect(sortName(e)).toBe('Lopez, Maria L.')
    expect(fullName({ firstName: 'Tony', lastName: 'Vo' })).toBe('Tony Vo')
  })

  it('splits a single-cell name into last and first', () => {
    expect(splitName('Maria Lopez')).toEqual({ firstName: 'Maria', lastName: 'Lopez' })
    expect(splitName('Lopez, Maria L.')).toEqual({ firstName: 'Maria', middleInitial: 'L', lastName: 'Lopez' })
    expect(splitName('Luis Hernández Jr.')).toEqual({ firstName: 'Luis', lastName: 'Hernández Jr.' })
    expect(splitName('Mary Ann Smith')).toEqual({ firstName: 'Mary Ann', lastName: 'Smith' })
  })

  it('sorts by last name first', () => {
    const list = [{ firstName: 'Zoe', lastName: 'Adams' }, { firstName: 'Amy', lastName: 'Brown' }, { firstName: 'Ann', lastName: 'Adams' }]
    expect([...list].sort(compareByName).map(fullName)).toEqual(['Ann Adams', 'Zoe Adams', 'Amy Brown'])
  })
})
