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
    expect(statsForLevel(CLASSES.knight, 1)).toEqual(CLASSES.knight.base)
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
  it('is 92% at equal level and shifts 2% per level', () => {
    expect(hitChance(5, 5)).toBeCloseTo(0.92)
    expect(hitChance(5, 7)).toBeCloseTo(0.88)
    expect(hitChance(7, 5)).toBeCloseTo(0.96)
  })

  it('is clamped to [0.5, 0.98]', () => {
    expect(hitChance(1, 99)).toBe(0.5)
    expect(hitChance(99, 1)).toBe(0.98)
  })
})

describe('rollAttack', () => {
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
