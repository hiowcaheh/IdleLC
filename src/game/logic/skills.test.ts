import { describe, expect, it } from 'vitest'
import type { CombatStats, SkillDef } from '../data/types.ts'
import { createCharacterData, type CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { playerFighter } from './fighters.ts'
import {
  SP_UNIT,
  applyAuto,
  applyBar,
  applyLearn,
  arrangeBar,
  applyStats,
  checkLearn,
  interpretEffect,
  isAvailable,
  learnedRanks,
  meetsNeeds,
  skillRank,
  starterSkills,
  worksWith,
} from './skills.ts'

// The tests run on the placeholder skills (src/game/data/skills.ts): knight 1 Power Strike,
// 2 Iron Skin (needs Power Strike 1), 3 Toughness (passive).
const knight = (over: Partial<CharacterData> = {}): CharacterData => ({
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id', 0),
  ...over,
})

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0.1,
  critMultiplier: 1.5,
  maxMp: 50,
  ...over,
})

describe('interpretEffect', () => {
  it('maps t_magic types to IdleLC effects', () => {
    expect(interpretEffect({ type: 3, subtype: 0, damageType: 1, power: 150 })).toEqual({
      kind: 'damage',
      percent: 150,
    })
    expect(interpretEffect({ type: 0, subtype: 1, damageType: 1, power: 40 })).toEqual({
      kind: 'stat',
      stat: 'defense',
      value: 40,
      percent: false,
    })
    expect(interpretEffect({ type: 0, subtype: 23, damageType: 2, power: 10 })).toMatchObject({
      stat: 'attackSpeed',
      percent: true,
    })
    expect(interpretEffect({ type: 2, subtype: 7, damageType: 0, power: 0 })).toEqual({
      kind: 'stun',
      chance: 1,
    })
    expect(interpretEffect({ type: 2, subtype: 5, damageType: 1, power: 20 })).toEqual({
      kind: 'stun',
      chance: 0.2,
    })
    expect(interpretEffect({ type: 2, subtype: 0, damageType: 0, power: 6 })).toEqual({
      kind: 'poison',
      perSecond: 6,
    })
    expect(interpretEffect({ type: 4, subtype: 0, damageType: 0, power: 95 })).toEqual({
      kind: 'heal',
      amount: 95,
    })
    expect(interpretEffect({ type: 4, subtype: 1, damageType: 0, power: 100 })).toEqual({
      kind: 'mana',
      amount: 100,
    })
    // the states of the healing / mana potions (Mana Recovery uses the MP one)
    expect(interpretEffect({ type: 2, subtype: 9, damageType: 1, power: 16 })).toEqual({
      kind: 'regen',
      resource: 'hp',
      perSecond: 16,
    })
    expect(interpretEffect({ type: 2, subtype: 10, damageType: 1, power: 2 })).toEqual({
      kind: 'regen',
      resource: 'mp',
      perSecond: 2,
    })
  })

  it('returns null for effects IdleLC does not have (summons, movement speed…)', () => {
    expect(interpretEffect({ type: 6, subtype: 9, damageType: 0, power: 2 })).toBeNull()
    expect(interpretEffect({ type: 0, subtype: 9, damageType: 1, power: 3 })).toBeNull()
    expect(interpretEffect({ type: 5, subtype: 0, damageType: 1, power: 0 })).toBeNull()
  })
})

describe('skillRank', () => {
  it('reads timings in 1/10 s and sorts skills into kinds', () => {
    const strike = learnedRanks('knight', { 1: { level: 2, auto: true } })[0]!
    expect(strike).toMatchObject({
      id: 1,
      level: 2,
      kind: 'attack',
      offensive: true,
      mpCost: 6,
      // readyTime 0: fires at once; fireTime 10 is the animation after it fired
      castTime: 0,
      fireTime: 1,
      cooldown: 4,
    })
    const ranks = learnedRanks('knight', {
      2: { level: 1, auto: false },
      3: { level: 1, auto: true },
    })
    expect(ranks.map((r) => [r.kind, r.auto, r.duration])).toEqual([
      ['buff', false, 60],
      ['passive', true, 0],
    ])
  })

  it('treats a targeted skill that only lowers stats as a debuff', () => {
    const curse: SkillDef = {
      id: 90,
      classId: 'mage',
      name: 'Weaken',
      description: '',
      type: 2,
      targetType: 2,
      readyTime: 0,
      fireTime: 0,
      reuseTime: 50,
      levels: [
        {
          level: 1,
          mp: 5,
          hp: 0,
          duration: 100,
          learnLevel: 1,
          learnSp: 0,
          requires: [],
          effects: [{ type: 0, subtype: 0, damageType: 1, power: -10 }],
        },
      ],
    }
    expect(skillRank(curse, 1)).toMatchObject({ kind: 'debuff', offensive: true, castTime: 0 })
    expect(isAvailable(curse)).toBe(true)
    const summon = {
      ...curse,
      levels: [
        { ...curse.levels[0]!, effects: [{ type: 6, subtype: 9, damageType: 0, power: 1 }] },
      ],
    }
    expect(isAvailable(summon)).toBe(false)
  })
})

describe('learning', () => {
  it('new characters know the free level-1 skills of their class', () => {
    expect(starterSkills('knight')).toEqual({ 1: { level: 1, auto: true } })
    expect(knight().skills).toEqual({ 1: { level: 1, auto: true } })
    expect(starterSkills('mage')).toEqual({})
  })

  it('checks level, prerequisites and SP', () => {
    expect(checkLearn(knight(), 1)).toBe('level-too-low') // rank 2 needs level 3
    expect(checkLearn(knight({ level: 3 }), 1)).toBe('not-enough-sp')
    expect(checkLearn(knight({ level: 3, sp: SP_UNIT }), 1)).toBeNull()
    expect(checkLearn(knight({ level: 2, sp: SP_UNIT, skills: {} }), 2)).toBe('missing-skill')
    expect(checkLearn(knight({ level: 2, sp: SP_UNIT }), 2)).toBeNull()
    expect(checkLearn(knight({ skills: { 3: { level: 2, auto: true } } }), 3)).toBe('max-level')
    expect(checkLearn(knight(), 999)).toBe('unknown-skill')
    const mage = createCharacterData({ name: 'Aria', classId: 'mage' }, 'm', 0)
    expect(checkLearn(mage, 1)).toBe('wrong-class')
  })

  it('learns the next rank for its SP and keeps the auto setting', () => {
    const before = knight({
      level: 5,
      sp: 3 * SP_UNIT + 5,
      skills: { 1: { level: 1, auto: false } },
    })
    const after = applyLearn(before, 1)
    expect(after.skills[1]).toEqual({ level: 2, auto: false })
    expect(after.sp).toBe(2 * SP_UNIT + 5)
    expect(before.skills[1]!.level).toBe(1)
    expect(applyLearn(after, 2).skills[2]).toEqual({ level: 1, auto: true })
  })

  it('refuses with a GameError carrying the reason', () => {
    expect(() => applyLearn(knight(), 1)).toThrowError(GameError)
    try {
      applyLearn(knight(), 1)
    } catch (error) {
      expect((error as GameError).code).toBe('level-too-low')
    }
  })

  it('toggles automatic use of learned skills only', () => {
    expect(applyAuto(knight(), 1, false).skills[1]).toEqual({ level: 1, auto: false })
    expect(() => applyAuto(knight(), 2, true)).toThrowError(/not-learned/)
  })
})

describe('gear a skill needs (t_skill)', () => {
  // Shield Strike: a sword or dual swords (a_useWeaponType 0 / 11) and a shield (a_useState 16)
  const shieldStrike = { weapons: [0, 11], weapon: false, shield: true }
  const sword = { weapon: 0, shield: false }

  it('needs the shield and a weapon of its kinds', () => {
    expect(meetsNeeds(shieldStrike, { weapon: 0, shield: true })).toBe(true)
    expect(meetsNeeds(shieldStrike, sword)).toBe(false)
    expect(
      meetsNeeds({ weapons: [0, 11], weapon: true, shield: false }, { weapon: 3, shield: false }),
    ).toBe(false)
    expect(
      meetsNeeds({ weapons: [], weapon: true, shield: false }, { weapon: null, shield: true }),
    ).toBe(false)
    expect(meetsNeeds(undefined, { weapon: null, shield: false })).toBe(true)
  })

  it('checks actives by their use needs, passives by what they need to work', () => {
    const base = { id: 9, classId: 'knight', name: 'X', description: '', targetType: 0 }
    const timings = { readyTime: 0, fireTime: 0, reuseTime: 0, levels: [] }
    const active = { ...base, ...timings, type: 0, needs: shieldStrike } as SkillDef
    const passive = { ...base, ...timings, type: 3, needs: shieldStrike } as SkillDef
    expect(worksWith(active, sword)).toBe(false)
    expect(worksWith(passive, sword)).toBe(true) // no passiveNeeds
    expect(worksWith({ ...passive, passiveNeeds: shieldStrike }, sword)).toBe(false)
  })
})

describe('applyStats', () => {
  it('adds flat values and percentages, then keeps stats in range', () => {
    const s = applyStats(stats(), [
      { kind: 'stat', stat: 'attack', value: 5, percent: false },
      { kind: 'stat', stat: 'attack', value: 50, percent: true },
      { kind: 'stat', stat: 'attackSpeed', value: 25, percent: true },
      { kind: 'stat', stat: 'critChance', value: 50, percent: false },
      { kind: 'stat', stat: 'critMultiplier', value: 20, percent: false },
      { kind: 'stat', stat: 'hit', value: 44, percent: false },
      { kind: 'stat', stat: 'defense', value: -50, percent: false },
      { kind: 'stat', stat: 'maxMp', value: 25, percent: false },
    ])
    expect(s.attack).toBe(22.5)
    expect(s.attackInterval).toBeCloseTo(0.8)
    expect(s.critChance).toBeCloseTo(0.15)
    expect(s.critMultiplier).toBeCloseTo(1.7)
    expect(s.hit).toBeCloseTo(4.4)
    expect(s.defense).toBe(0)
    expect(s.maxMp).toBe(75)
  })

  it('returns the same object when nothing changes', () => {
    const base = stats()
    expect(applyStats(base, [])).toBe(base)
  })
})

describe('playerFighter', () => {
  it('applies passive skills and hands the active ones to combat', () => {
    const plain = playerFighter({ classId: 'knight', level: 5 })
    const skilled = playerFighter({
      classId: 'knight',
      level: 5,
      skills: { 1: { level: 1, auto: true }, 3: { level: 2, auto: true } },
    })
    expect(plain.skills).toEqual([])
    expect(skilled.stats.maxHp).toBe(plain.stats.maxHp + 40)
    expect(skilled.stats.maxMp).toBe(plain.stats.maxMp)
    expect(skilled.skills!.map((r) => r.id)).toEqual([1])
  })
})

describe('skill bar', () => {
  it('starts with the free active skills and takes new active skills while there is room', () => {
    const c = knight({ level: 3, sp: 5 * SP_UNIT })
    expect(c.skillBar).toEqual([1])
    const withBuff = applyLearn(c, 2) // Iron Skin, a buff
    // buffs go to the right of the attacks
    expect(withBuff.skillBar).toEqual([1, 2])
    const withPassive = applyLearn(withBuff, 3) // Toughness, passive: not on the bar
    expect(withPassive.skillBar).toEqual([1, 2])
    const full = applyLearn({ ...c, skillBar: [11, 12, 13, 14, 15, 16, 17] }, 2)
    expect(full.skillBar).toEqual([11, 12, 13, 14, 15, 16, 17])
  })

  it('arranges attacks left and buffs right', () => {
    expect(arrangeBar('knight', [2, 1])).toEqual([1, 2])
  })

  it('takes only learned active skills, at most seven', () => {
    const c = knight({
      skills: {
        1: { level: 1, auto: true },
        2: { level: 1, auto: true },
        3: { level: 1, auto: true },
      },
    })
    expect(applyBar(c, [2, 1]).skillBar).toEqual([1, 2])
    expect(applyBar(c, []).skillBar).toEqual([])
    expect(() => applyBar(c, [3])).toThrowError(/passive-skill/)
    expect(() => applyBar(knight(), [2])).toThrowError(/not-learned/)
    expect(() => applyBar(c, [1, 2, 3, 4, 5, 6, 7, 8])).toThrowError(/bar-full/)
  })

  it('only the skills on the bar are used in fights', () => {
    const skills = { 1: { level: 1, auto: true }, 2: { level: 1, auto: true } }
    expect(
      playerFighter({ classId: 'knight', level: 5, skills, skillBar: [2] }).skills!.map(
        (r) => r.id,
      ),
    ).toEqual([2])
  })
})
