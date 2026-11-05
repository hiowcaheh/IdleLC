import { describe, expect, it } from 'vitest'
import { deathLoss, deathPenaltyRate } from './death.ts'
import { expToNextLevel } from './progression.ts'

describe('death penalty (Battle_ProcDead_PC.cpp)', () => {
  it('costs nothing up to level 10, then 5% / 3% / 2%', () => {
    expect([10, 11, 20, 21, 35, 36, 100].map(deathPenaltyRate)).toEqual([0, 5, 5, 3, 3, 2, 2])
  })

  it('takes trunc(level EXP / 100) × rate and trunc(SP / 100) × rate, never more than owned', () => {
    const need = expToNextLevel(20)
    expect(deathLoss(20, need, 12_345)).toEqual({
      exp: Math.trunc(need / 100) * 5,
      sp: Math.trunc(12_345 / 100) * 5,
    })
    expect(deathLoss(20, 3, 7)).toEqual({ exp: 3, sp: 0 })
    expect(deathLoss(5, 1000, 1000)).toEqual({ exp: 0, sp: 0 })
  })
})
