import { describe, expect, it } from 'vitest'
import { getItem } from '../data/items.ts'
import { createRng } from './rng.ts'
import { optionEffects, optionHelps, optionsFor, optionValue, rollOptions } from './options.ts'

// placeholder options: Strength (0, stones/earrings), Physical Defense (11, stones/earrings),
// Attack (20, cords/eyes/rings), Hit Rate (21, cords/eyes/rings)
describe('item options', () => {
  it('appear on the subtypes their t_option masks allow', () => {
    expect(optionsFor(getItem(166).gear!).map((o) => o.type)).toEqual([20, 21]) // ring
    expect(optionsFor(getItem(172).gear!).map((o) => o.type)).toEqual([0, 11]) // stone
  })

  it('roll 1–5 different options at levels their weights allow', () => {
    for (let seed = 1; seed < 40; seed++) {
      const options = rollOptions(166, createRng(seed))
      expect(options.length).toBeGreaterThanOrEqual(1)
      expect(new Set(options.map((o) => o.type)).size).toBe(options.length)
      // level 1 has weight 0 in t_option: never rolls
      for (const o of options) expect(o.level).toBeGreaterThanOrEqual(2)
    }
  })

  it('give their value to the classes they help', () => {
    expect(optionValue({ type: 0, level: 2 })).toBe(6)
    expect(optionHelps({ type: 0 }, 'knight')).toBe(true)
    expect(optionHelps({ type: 0 }, 'mage')).toBe(false)
    const options = [
      { type: 0, level: 3 },
      { type: 11, level: 2 },
      { type: 21, level: 2 },
    ]
    expect(optionEffects(options, 'knight')).toEqual([
      { kind: 'stat', stat: 'attack', value: 8, percent: false },
      { kind: 'stat', stat: 'defense', value: 2, percent: false },
      { kind: 'stat', stat: 'hit', value: 37, percent: false },
    ])
    expect(optionEffects(options, 'mage').map((e) => e.stat)).toEqual(['defense', 'hit'])
  })
})
