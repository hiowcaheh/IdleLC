import { describe, expect, it } from 'vitest'
import { levelTone } from './levelColor.ts'

describe('original client monster name bands', () => {
  it.each([
    [-7, 'trivial'],
    [-6, 'trivial'],
    [-5, 'easy'],
    [-3, 'easy'],
    [-2, 'even'],
    [0, 'even'],
    [2, 'even'],
    [3, 'hard'],
    [5, 'hard'],
    [6, 'deadly'],
    [20, 'deadly'],
  ])('uses the source band at target minus player = %i', (diff, tone) => {
    expect(levelTone(50, 50 + diff)).toBe(tone)
  })
})
