import { describe, expect, it } from 'vitest'
import { ITEMS, OPTIONS, getItem, getOption } from '../data/items.ts'
import { createCharacterData, type CharacterData } from './character.ts'
import { applyGear, checkWear } from './equipment.ts'
import { createRng } from './rng.ts'
import {
  MAX_OPTIONS,
  OPTION_PLAY_SECONDS,
  applyPlayTime,
  levelReduction,
  optionEffects,
  optionHelps,
  optionsFor,
  optionValue,
  rollOptions,
} from './options.ts'

// placeholder options: Strength (0, stones/earrings), Physical Defense (11, stones/earrings),
// Attack (20, cords/eyes/rings), Hit Rate (21, cords/eyes/rings)
describe('item options', () => {
  it('appear on the subtypes their t_option masks allow', () => {
    expect(optionsFor(getItem(166).gear!).map((o) => o.type)).toEqual([20, 21]) // ring
    expect(optionsFor(getItem(172).gear!).map((o) => o.type)).toEqual([0, 11]) // stone
  })

  it('roll 1–5 different options at levels their weights allow', () => {
    for (let seed = 1; seed < 40; seed++) {
      const options = rollOptions(166, createRng(seed))
      expect(options.length).toBeGreaterThanOrEqual(1)
      expect(new Set(options.map((o) => o.type)).size).toBe(options.length)
      // level 1 has weight 0 in t_option: never rolls
      for (const o of options) expect(o.level).toBeGreaterThanOrEqual(2)
    }
  })

  it('give their value to the classes they help', () => {
    expect(optionValue({ type: 0, level: 2 })).toBe(6)
    expect(optionHelps({ type: 0 }, 'knight')).toBe(true)
    expect(optionHelps({ type: 0 }, 'mage')).toBe(true)
    const options = [
      { type: 0, level: 3 },
      { type: 11, level: 2 },
      { type: 21, level: 2 },
    ]
    expect(optionEffects(options, 'knight')).toEqual([
      { kind: 'stat', stat: 'strength', value: 8, percent: false },
      { kind: 'stat', stat: 'maxHp', value: 32, percent: false },
      { kind: 'stat', stat: 'attack', value: 8, percent: false },
      { kind: 'stat', stat: 'defense', value: 2, percent: false },
      { kind: 'stat', stat: 'hit', value: 37, percent: false },
    ])
    expect(optionEffects(options, 'mage').map((e) => e.stat)).toEqual([
      'strength',
      'maxHp',
      'defense',
      'hit',
    ])
  })
})

describe('options from play time', () => {
  const knight = (over: Partial<CharacterData> = {}): CharacterData => ({
    ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
    ...over,
  })

  it('one option per 10 minutes of play on a random worn piece, never twice the same type', () => {
    const start = knight()
    const nine = applyPlayTime(start, OPTION_PLAY_SECONDS - 1, createRng(1))
    expect(nine.gained).toEqual([])
    expect(nine.character.optionProgress).toBe(OPTION_PLAY_SECONDS - 1)

    const r = applyPlayTime(nine.character, 1 + 2 * OPTION_PLAY_SECONDS, createRng(1))
    expect(r.gained).toHaveLength(3)
    expect(r.character.optionProgress).toBe(0)
    for (const { slot, option } of r.gained) {
      const piece = r.character.equipment[slot]!
      expect(piece.options).toContainEqual(option)
      expect(new Set(piece.options!.map((o) => o.type)).size).toBe(piece.options!.length)
    }
  })

  it('stops at MAX_OPTIONS (or the options a piece can get) and keeps the time waiting', () => {
    // each starter piece gets every option it can roll (sword: Attack and Hit Rate, tunic: Physical
    // Defense and Attack…), at most MAX_OPTIONS
    const r = applyPlayTime(knight(), 100 * OPTION_PLAY_SECONDS, createRng(2))
    const possible = Object.values(knight().equipment).reduce(
      (n, piece) => n + Math.min(MAX_OPTIONS, optionsFor(getItem(piece!.itemId).gear!).length),
      0,
    )
    expect(r.gained).toHaveLength(possible)
    expect(r.character.optionProgress).toBe(OPTION_PLAY_SECONDS)
    for (const piece of Object.values(r.character.equipment)) {
      expect(piece!.options!.length).toBeLessThanOrEqual(MAX_OPTIONS)
    }
  })

  it('rare items get their options from identification only', () => {
    const rareSword = { uid: 'r', itemId: 1845, plus: 0 }
    const c = knight({ equipment: { weapon: rareSword } })
    const r = applyPlayTime(c, 5 * OPTION_PLAY_SECONDS, createRng(3))
    expect(r.gained).toEqual([])
    expect(r.character.equipment.weapon).toEqual(rareSword)
  })

  it('never grows equipped accessories or level 73+ gear, but permits ordinary level 72 armor', () => {
    const base = getItem(knight().equipment.armor!.itemId)
    ITEMS[99072] = { ...base, id: 99072, level: 72 }
    ITEMS[99073] = { ...base, id: 99073, level: 73 }
    try {
      const blocked = knight({
        equipment: {
          accessory1: { uid: 'jewel', itemId: 166, plus: 0 },
          armor: { uid: 'high', itemId: 99073, plus: 0 },
          weapon: { uid: 'rare', itemId: 1845, plus: 0, rare: 1 },
        },
      })
      const untouched = applyPlayTime(blocked, 10 * OPTION_PLAY_SECONDS, createRng(3))
      expect(untouched.gained).toEqual([])
      expect(untouched.character.equipment).toEqual(blocked.equipment)
      const ordinary = {
        ...blocked,
        equipment: { ...blocked.equipment, armor: { uid: 'low', itemId: 99072, plus: 0 } },
      }
      const grown = applyPlayTime(ordinary, OPTION_PLAY_SECONDS, createRng(3))
      expect(grown.gained).toHaveLength(1)
      expect(grown.gained[0]!.slot).toBe('armor')
      expect(grown.character.equipment.accessory1).toEqual(blocked.equipment.accessory1)
    } finally {
      delete ITEMS[99072]
      delete ITEMS[99073]
    }
  })

  it('a "Reduced Level Requirement" option lets a piece be worn earlier', () => {
    const options = [
      { type: 20, level: 2 },
      { type: 49, level: 5 },
    ]
    expect(levelReduction(options)).toBe(5)
    expect(checkWear({ classId: 'knight', level: 70 }, 1845)).toBe('level-too-low')
    expect(checkWear({ classId: 'knight', level: 68 }, 1845, options)).toBe(null)
  })

  it('special rare options only come from rare sets', () => {
    // weight 0 on every level: never rolls on accessories or from play time
    expect(optionsFor(getItem(1845).gear!).map((o) => o.type)).toEqual([20, 21])
    expect(optionEffects([{ type: 58, level: 2 }], 'mage')).toEqual([
      { kind: 'stat', stat: 'cooldownReduction', value: 30, percent: false },
    ])
  })
})

describe('source option bases', () => {
  const stats = {
    maxHp: 1000,
    maxMp: 500,
    attack: 100,
    defense: 50,
    attackInterval: 1,
    critChance: 0,
    critMultiplier: 1.5,
  }
  it('applies every attribute to all classes with source HP/MP consequences and AllStats', () => {
    const options = [{ type: 99, level: 1 }]
    const value = getOption(99)!.values[0]!
    const knight = applyGear(stats, 'knight', 20, {
      accessory1: { uid: 'x', itemId: 166, plus: 0, options },
    })
    const bare = applyGear(stats, 'knight', 20, {})
    expect(knight.maxHp - bare.maxHp).toBe(value * 15)
    expect(knight.maxMp! - bare.maxMp!).toBe(value * 8)
    expect(knight.strength).toBe(value)
    const mage = optionEffects([{ type: 0, level: 2 }], 'mage')
    expect(mage).toContainEqual({ kind: 'stat', stat: 'maxHp', value: 18, percent: false })
  })

  it('uses source base attributes for rates rather than previous flat options', () => {
    const options = [
      { type: 0, level: 2 },
      { type: 67, level: 1 },
    ]
    const expected = 6 + Math.trunc((76 * getOption(67)!.values[0]!) / 100)
    const values = optionEffects(options, 'knight', 20).filter(
      (effect) => effect.stat === 'strength',
    )
    expect(values.reduce((sum, effect) => sum + effect.value, 0)).toBe(expected)
    expect(
      optionEffects([...options].reverse(), 'knight', 20)
        .filter((effect) => effect.stat === 'strength')
        .reduce((sum, effect) => sum + effect.value, 0),
    ).toBe(expected)
  })

  it('maps block independently of evasion and composes move speed multiplicatively', () => {
    expect(optionEffects([{ type: 63, level: 1 }], 'knight')[0]?.stat).toBe('blockChance')
    const speed = [
      { type: 64, level: 1 },
      { type: 64, level: 2 },
    ]
    const result = applyGear(stats, 'knight', 1, {
      accessory1: { uid: 'x', itemId: 166, plus: 0, options: speed },
    })
    expect(result.moveSpeed).toBeCloseTo(32)
  })

  it('keeps Stone, Stun and Silence resistance independent and caps their sums at 80%', () => {
    // These DB records are absent from the small placeholder catalog. Powers match t_option.
    for (const type of [60, 61, 62]) {
      OPTIONS[type] = {
        type,
        name: 'Resistance fixture',
        values: [10, 20, 30],
        weights: [0, 0, 0],
        weaponMask: 0,
        armorMask: 0,
        accessoryMask: 0,
      }
    }
    try {
      const result = applyGear(stats, 'knight', 1, {
        accessory1: {
          uid: 'resist',
          itemId: 166,
          plus: 0,
          options: [
            { type: 60, level: 1 },
            { type: 61, level: 2 },
            { type: 62, level: 3 },
          ],
        },
      })
      expect(result.stoneResistance).toBe(Math.min(80, getOption(60)!.values[0]!))
      expect(result.stunResistance).toBe(Math.min(80, getOption(61)!.values[1]!))
      expect(result.silenceResistance).toBe(Math.min(80, getOption(62)!.values[2]!))
      const capped = applyGear(stats, 'knight', 1, {
        accessory1: {
          uid: 'resist',
          itemId: 166,
          plus: 0,
          options: Array.from({ length: 20 }, () => ({ type: 61, level: 3 })),
        },
      })
      expect(capped.stunResistance).toBe(80)
    } finally {
      for (const type of [60, 61, 62]) delete OPTIONS[type]
    }
  })
})
