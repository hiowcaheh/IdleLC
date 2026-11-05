import { describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes.ts'
import type { CombatStats } from '../data/types.ts'
import {
  npcDamage,
  MAX_LEVEL,
  baseDamage,
  hitChance,
  regenPerSecond,
  rollAttack,
  statsForLevel,
} from './balance.ts'
import { createRng } from './rng.ts'

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

describe('statsForLevel', () => {
  it('returns base stats at level 1', () => {
    expect(statsForLevel(CLASSES.knight, 1)).toEqual({ ...CLASSES.knight.base, maxMp: 45 })
  })

  it('adds per-level growth and rounds', () => {
    const s = statsForLevel(CLASSES.knight, 11)
    expect(s.maxHp).toBe(160 + 16 * 10)
    expect(s.attack).toBe(Math.round(11 + 1.7 * 10))
    expect(s.defense).toBe(9 + 13)
    expect(s.attackInterval).toBe(CLASSES.knight.base.attackInterval)
  })

  it('clamps level to [1, MAX_LEVEL]', () => {
    expect(statsForLevel(CLASSES.mage, 0)).toEqual(statsForLevel(CLASSES.mage, 1))
    expect(statsForLevel(CLASSES.mage, 500)).toEqual(statsForLevel(CLASSES.mage, MAX_LEVEL))
  })
})

describe('baseDamage', () => {
  it('uses atk^2 / (atk + def)', () => {
    expect(baseDamage(10, 10)).toBeCloseTo(5)
    expect(baseDamage(10, 0)).toBeCloseTo(10)
  })

  it('decreases with defense but never below 1', () => {
    expect(baseDamage(10, 20)).toBeLessThan(baseDamage(10, 5))
    expect(baseDamage(1, 1000)).toBe(1)
    expect(baseDamage(0, 0)).toBe(1)
  })
})

describe('hitChance', () => {
  it('uses raw ratings and the defender-specific level avoidance coefficient', () => {
    expect(hitChance(20, 20, 168, 66, 10)).toBeCloseTo(1 - 66001 / 336000)
    expect(hitChance(20, 22, 168, 66, 10)).toBeCloseTo(1 - 86001 / 332000)
    expect(hitChance(20, 22, 168, 66, 1)).toBeCloseTo(1 - 68001 / 332000)
    expect(hitChance(20, 20, 243, 66, 10)).toBeGreaterThan(hitChance(20, 20, 168, 66, 10))
  })

  it('handles exhausted ranges deterministically without the old probability clamp', () => {
    expect(hitChance(1, 99, 50, 50)).toBe(0)
    expect(hitChance(99, 1)).toBe(1)
    expect(hitChance(5, 5, 1, 1000)).toBeLessThan(0.5)
    expect(hitChance(5, 5, 1000, 1)).toBeGreaterThan(0.98)
  })
})

describe('rollAttack', () => {
  it('compares two independent integer rolls and treats an equal roll as a miss', () => {
    const attacker = { level: 1, stats: stats({ hit: 1 }) }
    const defender = { level: 1, stats: stats({ dodge: 1 }) }
    expect(rollAttack(attacker, defender, () => 0.5).kind).toBe('miss')
    const rolls = [0.9, 0.1, 0.5, 0.9]
    expect(rollAttack(attacker, defender, () => rolls.shift()!).kind).toBe('hit')
  })

  it('halves integer normal damage on block but lets skill damage pass', () => {
    const attacker = { level: 1, stats: stats() }
    const defender = { level: 1, stats: stats({ blockChance: 100 }) }
    const normal = rollAttack(attacker, defender, () => 0.5)
    const skill = rollAttack(attacker, defender, () => 0.5, 1, true)
    expect(skill.damage).toBe(7)
    expect(normal.damage).toBe(3)
  })
  it('never crits with 0% crit and always crits with 100% (when it lands)', () => {
    const rng = createRng(1)
    for (let i = 0; i < 200; i++) {
      const r = rollAttack({ level: 50, stats: stats() }, { level: 1, stats: stats() }, rng)
      expect(r.kind).not.toBe('crit')
    }
    for (let i = 0; i < 200; i++) {
      const r = rollAttack(
        { level: 50, stats: stats({ critChance: 1 }) },
        { level: 1, stats: stats() },
        rng,
      )
      expect(r.kind).not.toBe('hit')
    }
  })

  it('keeps damage within ±10% variance of base (crit multiplied)', () => {
    const rng = createRng(2)
    const base = baseDamage(10, 5)
    for (let i = 0; i < 500; i++) {
      const r = rollAttack({ level: 50, stats: stats() }, { level: 1, stats: stats() }, rng)
      if (r.kind === 'miss') continue
      expect(r.damage).toBeGreaterThanOrEqual(Math.floor(base * 0.9))
      expect(r.damage).toBeLessThanOrEqual(Math.ceil(base * 1.1))
    }
    for (let i = 0; i < 500; i++) {
      const r = rollAttack(
        { level: 50, stats: stats({ critChance: 1 }) },
        { level: 1, stats: stats() },
        rng,
      )
      if (r.kind === 'miss') continue
      expect(r.damage).toBeGreaterThanOrEqual(Math.floor(base * 0.9 * 1.5))
      expect(r.damage).toBeLessThanOrEqual(Math.ceil(base * 1.1 * 1.5))
    }
  })

  it('misses roughly at 1 - hitChance and deals 0 damage on miss', () => {
    const rng = createRng(3)
    let misses = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const r = rollAttack({ level: 1, stats: stats() }, { level: 1, stats: stats() }, rng)
      if (r.kind === 'miss') {
        misses++
        expect(r.damage).toBe(0)
      }
    }
    expect(misses / n).toBeCloseTo(0.08, 1)
  })
})

describe('regenPerSecond', () => {
  it('is 3% of max HP per second', () => {
    expect(regenPerSecond(200)).toBeCloseTo(6)
  })
})

describe('npcDamage (GetDamage, NPC attacker against a hero)', () => {
  const npc = (over: Partial<CombatStats> = {}): CombatStats => ({
    maxHp: 9500,
    attack: 375,
    physicalAttack: 375,
    magicAttack: 120,
    defense: 1700,
    attackInterval: 1.8,
    critChance: 0,
    critMultiplier: 1,
    strength: 158,
    dexterity: 200,
    intelligence: 148,
    attackType: 'melee',
    gearLevels: { attack: 51, defense: 51 },
    ...over,
  })
  const hero = (over: Partial<CombatStats> = {}): CombatStats => ({
    maxHp: 1650,
    attack: 268,
    defense: 897,
    attackInterval: 1,
    critChance: 0,
    critMultiplier: 2,
    defenseChannels: { melee: 744, range: 700, magic: 40 },
    gearLevels: { attack: 49, defense: 51 },
    ...over,
  })
  const at = (stats: CombatStats, level = 51) => ({ level, stats })

  it('melee: STR × 10 / 15 + attack × hit share − (defense + 3 × level) / 3.5', () => {
    // 105 + 375 − (744 + 153) / 3.5 = 223.7
    expect(npcDamage(at(npc()), at(hero()))).toBe(223)
    // hard: 375 × 15 / 10 = 562
    expect(npcDamage(at(npc()), at(hero()), undefined, 'hard')).toBe(410)
  })

  it('range uses DEX and the ranged defense, magic INT and the whole resist + level / 2', () => {
    // 133 + 375 − (700 + 153) / 3.5 = 264.3
    expect(npcDamage(at(npc({ attackType: 'ranged' })), at(hero()))).toBe(264)
    // 98 + (120 − (40 + 25))
    expect(npcDamage(at(npc({ attackType: 'magic' })), at(hero()))).toBe(153)
  })

  it('weakens attack and defense of gear far above its wearer, adds the ADDITION power', () => {
    // attack 5–8 levels above: halved
    expect(npcDamage(at(npc({ gearLevels: { attack: 57, defense: 51 } })), at(hero()))).toBe(
      Math.trunc(105 + 187 - 897 / 3.5),
    )
    // no armor: defense level 2 × 51, 51 levels above: a tenth of the defense
    expect(npcDamage(at(npc()), at(hero({ gearLevels: { attack: 49, defense: 102 } })))).toBe(
      Math.trunc(105 + 375 - (74 + 15) / 3.5),
    )
    // MDT_ADDITION: attack × (100 + level) / 100 + power
    expect(npcDamage(at(npc()), at(hero()), { power: 100, type: 1 })).toBe(
      Math.trunc(105 + Math.trunc((375 * 151) / 100 + 100) - 897 / 3.5),
    )
  })

  it('needs the NPC attributes and the hero channels, and never deals under 1', () => {
    expect(npcDamage(at(npc({ strength: undefined })), at(hero()))).toBeNull()
    expect(npcDamage(at(npc()), at(hero({ defenseChannels: undefined })))).toBeNull()
    expect(npcDamage(at(npc({ physicalAttack: 1, strength: 1 })), at(hero()))).toBe(1)
  })
})
