import { describe, expect, it } from 'vitest'
import { createCharacterData } from './character.ts'
import { playerFighter } from './fighters.ts'
import {
  DAY_MS,
  applyUseTitleItem,
  applyWearTitle,
  pruneTitles,
  titleOptions,
  wornTitle,
} from './titles.ts'

// placeholder data: item 900 gives title 1 "Brave Hunter" for 7 days (Strength +6, Attack +3)
const NOW = 1_000_000
const hero = (count = 2) => ({
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0),
  inventory: [{ itemId: 900, count }],
})

describe('titles', () => {
  it('a title item adds its title for its days and wears it when none is worn', () => {
    const use = applyUseTitleItem(hero(), 900, NOW)
    expect(use.title.name).toBe('Brave Hunter')
    expect(use.extended).toBe(false)
    expect(use.character.titles).toEqual([{ id: 1, expiresAt: NOW + 7 * DAY_MS }])
    expect(use.character.activeTitle).toBe(1)
    expect(use.character.inventory).toEqual([{ itemId: 900, count: 1 }])
    expect(wornTitle(use.character, NOW)?.name).toBe('Brave Hunter')
  })

  it('a second item of an owned title adds its days on top', () => {
    const first = applyUseTitleItem(hero(), 900, NOW).character
    const second = applyUseTitleItem(first, 900, NOW + DAY_MS)
    expect(second.extended).toBe(true)
    expect(second.character.titles).toEqual([{ id: 1, expiresAt: NOW + 14 * DAY_MS }])
    expect(second.character.inventory).toEqual([])
  })

  it('refuses items that give no title and missing items', () => {
    expect(() => applyUseTitleItem(hero(), 1, NOW)).toThrow('not-a-title')
    expect(() => applyUseTitleItem(hero(0), 900, NOW)).toThrow('no-item')
  })

  it('wears and takes off owned titles only', () => {
    const owned = applyUseTitleItem(hero(), 900, NOW).character
    expect(applyWearTitle(owned, null, NOW).activeTitle).toBeNull()
    expect(applyWearTitle({ ...owned, activeTitle: null }, 1, NOW).activeTitle).toBe(1)
    expect(() => applyWearTitle(hero(), 1, NOW)).toThrow('no-title')
  })

  it('a title runs out: it is removed and comes off', () => {
    const owned = applyUseTitleItem(hero(), 900, NOW).character
    const later = pruneTitles(owned, NOW + 7 * DAY_MS)
    expect(later.titles).toEqual([])
    expect(later.activeTitle).toBeNull()
    expect(wornTitle(owned, NOW + 7 * DAY_MS)).toBeUndefined()
  })

  it('the worn title adds its options to the fighter', () => {
    const owned = applyUseTitleItem(hero(), 900, NOW).character
    expect(titleOptions(owned.activeTitle)).toEqual([
      { type: 0, level: 2 },
      { type: 20, level: 3 },
    ])
    const withTitle = playerFighter(owned).stats
    const without = playerFighter({ ...owned, activeTitle: null }).stats
    expect(withTitle.attack).toBeGreaterThan(without.attack)
  })
})
