import { describe, expect, it } from 'vitest'
import { levelRewardRates } from './pveLevels.ts'

describe('source solo level penalties', () => {
  it.each([
    [-20, 100, 100, true, 0.8],
    [0, 100, 100, true, 0.8],
    [1, 95, 90, true, 0.75],
    [2, 90, 80, true, 0.7],
    [3, 75, 70, true, 0.65],
    [4, 60, 60, true, 0.6],
    [5, 45, 50, true, 0.55],
    [6, 10, 40, false, 0.5],
    [9, 10, 10, false, 0.35],
    [10, 10, 0, false, 0.3],
    [16, 10, 0, false, 0],
    [50, 10, 0, false, 0],
  ])(
    'matches source thresholds when the player is %i levels above the mob',
    (diff, exp, sp, drops, goldChance) => {
      expect(levelRewardRates(30 + diff, 30)).toEqual({ exp, sp, drops, goldChance })
    },
  )
})
