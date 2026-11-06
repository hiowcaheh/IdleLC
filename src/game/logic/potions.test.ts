import { describe, expect, it } from 'vitest'
import { createCharacterData } from './character.ts'
import {
  applyPotionSlot,
  cleanBelow,
  fitsSlot,
  fullestPotion,
  potionGroup,
  slotBelow,
} from './potions.ts'

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

  it("keeps the slider's share in 5% steps from 5% to 100%; unset is the potion's default", () => {
    expect(cleanBelow(42)).toBe(40)
    expect(cleanBelow(0)).toBe(5)
    expect(cleanBelow(250)).toBe(100)
    expect(cleanBelow('50')).toBeUndefined()
    const set = applyPotionSlot(hero, 'hp', { itemId: 43, auto: true, below: 63 })
    expect(set.potionSlots.hp).toEqual({ itemId: 43, auto: true, below: 65 })
    expect(slotBelow(set.potionSlots.hp, 'hp')).toBe(65)
    expect(slotBelow({ itemId: 43, auto: true }, 'hp')).toBe(50)
    expect(slotBelow({ itemId: 490, auto: true }, 'hp')).toBe(100) // recovery: when not full
    expect(slotBelow({ itemId: null, auto: true }, 'mp')).toBe(30)
  })
})
