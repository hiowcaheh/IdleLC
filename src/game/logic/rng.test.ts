import { describe, expect, it } from 'vitest'
import { chance, createRng, rollInt } from './rng.ts'

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })

  it('returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('rollInt', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    const rng = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 2_000; i++) {
      const v = rollInt(rng, 5, 8)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(8)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([5, 6, 7, 8])
  })
})

describe('chance', () => {
  it('handles edge probabilities', () => {
    const rng = createRng(9)
    for (let i = 0; i < 100; i++) {
      expect(chance(rng, 0)).toBe(false)
      expect(chance(rng, 1)).toBe(true)
    }
  })

  it('roughly matches the probability', () => {
    const rng = createRng(11)
    let hits = 0
    for (let i = 0; i < 20_000; i++) if (chance(rng, 0.25)) hits++
    expect(hits / 20_000).toBeCloseTo(0.25, 1)
  })
})
