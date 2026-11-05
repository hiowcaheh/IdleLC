import { describe, expect, it } from 'vitest'
import { heroAttackRange } from './attackRange.ts'

describe('heroAttackRange', () => {
  it('takes the class range of the server', () => {
    expect(heroAttackRange('titan')).toBe(2.3)
    expect(heroAttackRange('knight')).toBe(2.3)
    expect(heroAttackRange('healer')).toBe(20)
    expect(heroAttackRange('mage')).toBe(15)
    expect(heroAttackRange('sorcerer')).toBe(3)
  })

  it('a Rogue shoots from 15 m with a crossbow and walks up with daggers', () => {
    expect(heroAttackRange('rogue', { subtype: 1, plus: 0 })).toBe(15)
    expect(heroAttackRange('rogue', { subtype: 7, plus: 0 })).toBe(2.3)
  })

  it('bows, crossbows, staves and wands reach 2 m further from +8', () => {
    expect(heroAttackRange('healer', { subtype: 6, plus: 7 })).toBe(20)
    expect(heroAttackRange('healer', { subtype: 6, plus: 8 })).toBe(22)
    expect(heroAttackRange('mage', { subtype: 2, plus: 10 })).toBe(17)
    expect(heroAttackRange('rogue', { subtype: 1, plus: 8 })).toBe(17)
    // a two-handed sword gets hit rate at +8, not range
    expect(heroAttackRange('titan', { subtype: 3, plus: 15 })).toBe(2.3)
  })
})
