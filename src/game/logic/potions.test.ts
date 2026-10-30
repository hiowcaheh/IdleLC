import { describe, expect, it } from 'vitest'
import { createCharacterData } from './character.ts'
import { applyPotionSlot, fitsSlot, fullestPotion, potionGroup } from './potions.ts'

// placeholder data: 43 Small Healing Potion, 484 Small Mana Potion, 490 Small HP Recovery Potion
const hero = {
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id', 0),
  inventory: [
    { itemId: 43, count: 3 },
    { itemId: 484, count: 2 },
    { itemId: 490, count: 5 },
  ],
}

describe('potion quick slots', () => {
  it('sorts potions into the HP and MP slots', () => {
    expect(potionGroup('hpRegen')).toBe('hp')
    expect(potionGroup('mp')).toBe('mp')
    expect(fitsSlot(490, 'hp')).toBe(true)
    expect(fitsSlot(484, 'hp')).toBe(false)
    expect(fitsSlot(4, 'hp')).toBe(false) // a sword
  })

  it('finds the potion of a slot the bag holds most of', () => {
    expect(fullestPotion(hero.inventory, 1, 'hp')).toBe(490)
    expect(fullestPotion(hero.inventory, 1, 'mp')).toBe(484)
    expect(fullestPotion([], 1, 'hp')).toBeNull()
  })

  it('puts an owned potion of the right kind in a slot, or empties it', () => {
    const set = applyPotionSlot(hero, 'hp', { itemId: 490, auto: false })
    expect(set.potionSlots.hp).toEqual({ itemId: 490, auto: false })
    expect(set.potionSlots.mp).toEqual(hero.potionSlots.mp)
    expect(applyPotionSlot(set, 'hp', { itemId: null, auto: true }).potionSlots.hp).toEqual({
      itemId: null,
      auto: true,
    })
    expect(() => applyPotionSlot(hero, 'hp', { itemId: 484, auto: true })).toThrowError(
      /wrong-potion/,
    )
    expect(() => applyPotionSlot(hero, 'mp', { itemId: 44, auto: true })).toThrowError(
      /wrong-potion|not-owned/,
    )
    const noMana = { ...hero, inventory: hero.inventory.filter((s) => s.itemId !== 484) }
    expect(() => applyPotionSlot(noMana, 'mp', { itemId: 484, auto: true })).toThrowError(
      /not-owned/,
    )
  })
})
