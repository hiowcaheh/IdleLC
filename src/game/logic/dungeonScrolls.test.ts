import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { DUNGEON_SCROLLS } from '../data/dungeonScrolls.ts'
import { getItem } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import {
  applyDungeonScroll,
  dungeonEntries,
  dungeonRunsLeft,
  emptyDungeonProgress,
  sanitizeDungeonProgress,
} from './dungeons.ts'

const NOW = Date.UTC(2026, 10, 7, 12)
const hero = () => ({
  ...createCharacterData({ name: 'Scroll', classId: 'rogue' }, 's', NOW),
  level: 40,
  inventory: [{ itemId: DUNGEON_SCROLLS.belfist, count: 2 }],
  dungeons: { ...emptyDungeonProgress(), day: '2026-11-07', entries: { belfist: 2 } },
})

describe('dungeon reset scrolls (owner, 2026-11-07)', () => {
  it('are named items with a client icon', () => {
    expect(getItem(DUNGEON_SCROLLS.procyon).name).toBe('Procyon Reset Scroll')
  })

  it('give one more entry today: 2 / 2 (+1 extra), then 3 / 2', () => {
    const before = hero()
    expect(dungeonRunsLeft(before, 'belfist', NOW)).toBe(0)
    const { character } = applyDungeonScroll(before, DUNGEON_SCROLLS.belfist, NOW)
    expect(character.inventory[0]!.count).toBe(1)
    expect(dungeonRunsLeft(character, 'belfist', NOW)).toBe(1)
    expect(dungeonEntries(character, 'belfist', NOW)).toEqual({ used: 2, limit: 2, extraLeft: 1 })
    const ran = {
      ...character,
      dungeons: { ...character.dungeons!, entries: { belfist: 3 } },
    }
    expect(dungeonEntries(ran, 'belfist', NOW)).toEqual({ used: 3, limit: 2, extraLeft: 0 })
    expect(dungeonRunsLeft(ran, 'belfist', NOW)).toBe(0)
    // the save keeps 3 entries and the extra; the next day both reset
    expect(sanitizeDungeonProgress(ran.dungeons).entries.belfist).toBe(3)
    expect(dungeonRunsLeft(ran, 'belfist', NOW + 86_400_000)).toBe(2)
    // another dungeon is not touched
    expect(dungeonRunsLeft(character, 'procyon', NOW)).toBe(2)
  })
})
