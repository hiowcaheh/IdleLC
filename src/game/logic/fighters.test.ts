import { describe, expect, it, vi } from 'vitest'
import { GOLDEN_MAGNIFIER_ID } from '../data/items.ts'
import { CombatSession } from '../session/combatSession.ts'
import { classAttributes, classResources } from './attributes.ts'
import { classRatings, ratingHitChance, rollRatings } from './ratings.ts'
import { createCharacterData } from './character.ts'
import { heroKey, playerFighter, potionSupply } from './fighters.ts'
import { OPTION_PLAY_SECONDS, applyPlayTime } from './options.ts'
import { applyIdentify } from './rare.ts'

const slots = (hp: number | null, mp: number | null, auto = { hp: true, mp: true }) => ({
  hp: { itemId: hp, auto: auto.hp },
  mp: { itemId: mp, auto: auto.mp },
})
const knight = { classId: 'knight' as const, level: 1, potionSlots: slots(43, 484) }
const bag = [
  { itemId: 43, count: 3 }, // Small Healing Potion
  { itemId: 484, count: 2 }, // Small Mana Potion
  { itemId: 490, count: 1 }, // Small HP Recovery Potion
  { itemId: 4, count: 1 }, // a sword
]

describe('potionSupply', () => {
  it('carries the potions of the quick slots into fights, not the rest of the bag', () => {
    expect(potionSupply({ ...knight, inventory: bag }).map((p) => [p.itemId, p.count])).toEqual([
      [43, 3],
      [484, 2],
    ])
    expect(playerFighter({ ...knight, inventory: bag }).potions).toHaveLength(2)
    const regen = { ...knight, potionSlots: slots(490, null), inventory: bag }
    expect(potionSupply(regen).map((p) => p.itemId)).toEqual([490])
  })

  it('leaves out slots whose automatic use is off, empty or used up', () => {
    const hpOff = {
      ...knight,
      inventory: bag,
      potionSlots: slots(43, 484, { hp: false, mp: true }),
    }
    expect(potionSupply(hpOff).map((p) => p.itemId)).toEqual([484])
    const none = { ...knight, inventory: bag.slice(1), potionSlots: slots(43, null) }
    expect(potionSupply(none)).toEqual([])
    expect(potionSupply({ ...knight, inventory: bag, potionSlots: undefined })).toEqual([])
  })

  it('changes the hero key when potions are used up or bought', () => {
    const key = heroKey({ ...knight, inventory: bag })
    expect(heroKey({ ...knight, inventory: bag })).toBe(key)
    expect(heroKey({ ...knight, inventory: [{ itemId: 43, count: 2 }, ...bag.slice(1)] })).not.toBe(
      key,
    )
    const hpOff = slots(43, 484, { hp: false, mp: true })
    expect(heroKey({ ...knight, inventory: bag, potionSlots: hpOff })).not.toBe(key)
  })
})

describe('heroKey', () => {
  it('refreshes the fighter when play time adds an option to the same worn piece', () => {
    const character = createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0)
    const before = { ...character, equipment: { weapon: character.equipment.weapon! } }
    const result = applyPlayTime(before, OPTION_PLAY_SECONDS, () => 0)
    const after = result.character

    expect(result.gained).toHaveLength(1)
    expect(after.equipment.weapon).toMatchObject({
      uid: before.equipment.weapon.uid,
      plus: before.equipment.weapon.plus,
    })
    expect(playerFighter(after).stats.attack).toBeGreaterThan(playerFighter(before).stats.attack)
    expect(heroKey(after)).not.toBe(heroKey(before))
  })

  it('refreshes the fighter after identifying a worn rare item', () => {
    const before = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
      level: 80,
      equipment: { weapon: { uid: 'rare-sword', itemId: 1845, plus: 0 } },
      inventory: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 1 }],
    }
    const after = applyIdentify(
      before,
      GOLDEN_MAGNIFIER_ID,
      [{ slot: 'weapon' }],
      () => 0.95,
    ).character

    expect(after.equipment.weapon).toMatchObject({ uid: 'rare-sword', plus: 0, rare: 23 })
    expect(playerFighter(after).stats.attack).toBeGreaterThan(playerFighter(before).stats.attack)
    expect(heroKey(after)).not.toBe(heroKey(before))
  })

  it('tracks the rare set independently of options and item identity independently of uid', () => {
    const before = {
      ...knight,
      level: 80,
      equipment: { weapon: { uid: 'sword', itemId: 1845, plus: 0 } },
    }
    const rare = { ...before, equipment: { weapon: { ...before.equipment.weapon, rare: 23 } } }
    const otherItem = {
      ...before,
      equipment: { weapon: { ...before.equipment.weapon, itemId: 4 } },
    }

    for (const after of [rare, otherItem]) {
      expect(playerFighter(after).stats.attack).not.toBe(playerFighter(before).stats.attack)
      expect(heroKey(after)).not.toBe(heroKey(before))
    }
  })

  it('tracks changes to existing option levels and types', () => {
    const hero = (type: number, level: number) => ({
      ...knight,
      equipment: {
        accessory1: { uid: 'ring', itemId: 166, plus: 0, options: [{ type, level }] },
      },
    })
    const before = hero(20, 2)
    for (const after of [hero(20, 3), hero(21, 2)]) {
      expect(playerFighter(after).stats).not.toEqual(playerFighter(before).stats)
      expect(heroKey(after)).not.toBe(heroKey(before))
    }
  })

  it('keeps the fighter for changes to loot or unworn gear', () => {
    const before = createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0)
    const after = {
      ...before,
      inventory: [...before.inventory, { itemId: 4, count: 3 }],
      gear: [{ uid: 'bag-sword', itemId: 1845, plus: 15, rare: 23 }],
    }

    expect(playerFighter(after)).toEqual(playerFighter(before))
    expect(heroKey(after)).toBe(heroKey(before))
  })
})

describe('source attribute and rating integration', () => {
  it('uses the six unpromoted classes and their resource coefficients', () => {
    expect(classResources('knight', 20)).toEqual({ maxHp: 720, maxMp: 390 })
    expect(classAttributes('knight', 20)).toEqual({
      strength: 76,
      dexterity: 66,
      intelligence: 66,
      constitution: 76,
    })
    expect(
      ['titan', 'knight', 'healer', 'mage', 'rogue', 'sorcerer'].map((id) =>
        classResources(id as 'knight', 2),
      ),
    ).toEqual([
      { maxHp: 216, maxMp: 82 },
      { maxHp: 180, maxMp: 102 },
      { maxHp: 128, maxMp: 130 },
      { maxHp: 101, maxMp: 153 },
      { maxHp: 157, maxMp: 65 },
      { maxHp: 125, maxMp: 157 },
    ])
  })

  it('displays Knight20 base168 and option +75 as243 raw points', () => {
    const hero = {
      classId: 'knight' as const,
      level: 20,
      equipment: {
        accessory1: { uid: 'ring', itemId: 166, plus: 0, options: [{ type: 21, level: 4 }] },
      },
    }
    expect(classRatings('knight', 20).hit).toBe(168)
    expect(playerFighter(hero).stats.hit).toBe(243)
    const rolls = [0.4, 0.6]
    expect(rollRatings(100, 100, () => rolls.shift()!)).toBe(false)
    expect(rollRatings(100, 100, () => 0.5)).toBe(false)
    expect(ratingHitChance(100, 100)).toBeCloseTo(0.499995, 10)
  })

  it('shares fixed source percentage bases across equipment and titles without compounding', () => {
    const fresh = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 1000),
      level: 20,
      skills: {},
    }
    const noTitle = { ...fresh, activeTitle: null }
    const base = playerFighter(noTitle, 1000).stats
    const titled = playerFighter(fresh, 1000).stats
    expect(titled.maxHp - base.maxHp).toBe(72)
    expect(titled.maxMp! - base.maxMp!).toBe(39)
    const gear = {
      ...fresh.equipment,
      accessory1: {
        uid: 'ring',
        itemId: 166,
        plus: 0,
        options: [
          { type: 71, level: 6 },
          { type: 72, level: 6 },
        ],
      },
    }
    const together = playerFighter({ ...fresh, equipment: gear }, 1000).stats
    expect(together.maxHp - base.maxHp).toBe(144)
    expect(together.maxMp! - base.maxMp!).toBe(78)
  })

  it('removes an expired title from live combat without waiting for a save report', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1000)
      const fresh = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 1000)
      const hero = { ...fresh, skills: {}, titles: [{ id: 23, expiresAt: 2000 }] }
      const session = new CombatSession(() => 0.5)
      session.start(hero, 'rust-golem')
      const boosted = session.state.player.stats.maxHp
      vi.setSystemTime(2000)
      session.tick(0)
      expect(session.state.player.stats.maxHp).toBe(boosted - 15)
      expect(heroKey(hero, 1999)).not.toBe(heroKey(hero, 2000))
      expect(heroKey({ ...hero, titles: [{ id: 23, expiresAt: 3000 }] }, 1000)).not.toBe(
        heroKey(hero, 1000),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
