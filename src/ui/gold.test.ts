import { describe, expect, it } from 'vitest'
import { goldColor } from './gold.ts'

describe('source gold colours', () => {
  it.each([
    [0, '#ffffff'],
    [999, '#ffffff'],
    [1_000, '#00ffff'],
    [999_999, '#00ffff'],
    [1_000_000, '#00ff00'],
    [999_999_999, '#00ff00'],
    [1_000_000_000, '#ffff00'],
    [999_999_999_999, '#ffff00'],
    [1_000_000_000_000, '#ffcc00'],
  ])('uses the client colour at %i gold', (amount, colour) => {
    expect(goldColor(amount)).toBe(colour)
  })
})
