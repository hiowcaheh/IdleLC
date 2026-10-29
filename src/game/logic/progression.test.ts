import { describe, expect, it } from 'vitest'
import { EXP_TABLE, MAX_LEVEL } from '../data/progression.ts'
import { expToNextLevel, gainExp } from './progression.ts'

describe('progression', () => {
  it('has a growing exp requirement for every level below the maximum', () => {
    expect(EXP_TABLE).toHaveLength(MAX_LEVEL)
    for (let level = 1; level < MAX_LEVEL; level++) {
      expect(expToNextLevel(level)).toBeGreaterThan(0)
      if (level > 1) expect(expToNextLevel(level)).toBeGreaterThanOrEqual(expToNextLevel(level - 1))
    }
    expect(expToNextLevel(MAX_LEVEL)).toBe(0)
  })

  it('keeps leftover exp and gains several levels at once', () => {
    expect(gainExp(1, 0, expToNextLevel(1) - 1)).toEqual({
      level: 1,
      exp: expToNextLevel(1) - 1,
      levelsGained: 0,
    })
    const big = expToNextLevel(1) + expToNextLevel(2) + 5
    expect(gainExp(1, 0, big)).toEqual({ level: 3, exp: 5, levelsGained: 2 })
  })

  it('stops at the maximum level', () => {
    expect(gainExp(MAX_LEVEL - 1, 0, Number.MAX_SAFE_INTEGER)).toEqual({
      level: MAX_LEVEL,
      exp: 0,
      levelsGained: 1,
    })
    expect(gainExp(MAX_LEVEL, 0, 1000).levelsGained).toBe(0)
  })
})
