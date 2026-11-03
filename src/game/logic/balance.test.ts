import { describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes.ts'
import type { CombatStats } from '../data/types.ts'
import {
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
