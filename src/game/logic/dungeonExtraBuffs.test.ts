import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import {
  DUNGEON_BUFFS,
  dungeonBuffDefinition,
  dungeonBuffRank,
  emptyDungeonProgress,
  upgradeDungeonBuff,
} from './dungeons.ts'
import { createCharacterData } from './character.ts'

const stat = (id: number) =>
  dungeonBuffRank(id, 1).effects.map((e) =>
    e.kind === 'stat' ? [e.stat, e.value, e.percent] : [e.kind],
  )

describe('extra dungeon blessings (owner, 2026-11-07)', () => {
  it('join the pool at their fixed level, as the database gives it', () => {
    for (const id of [1062, 257, 259, 270, 276]) {
      expect(DUNGEON_BUFFS).toContain(id)
      expect(dungeonBuffRank(id, 1).kind).toBe('buff')
    }
    expect(dungeonBuffDefinition(1062)!.sourceLevel).toBe(2)
    expect(stat(1062)).toEqual([
      ['attack', 200, true],
      ['magicAttack', 200, true],
    ])
    expect(dungeonBuffDefinition(257)!.sourceLevel).toBe(30)
    expect(stat(257)).toEqual([['attack', 60, false]])
    expect(stat(259)).toEqual([['defense', 250, false]])
    expect(stat(270)).toEqual([
      ['maxHp', 500, false],
      ['maxMp', 500, false],
    ])
    expect(stat(276)).toEqual([['magicAttack', 30, false]])
  })

  it('cannot be upgraded', () => {
    const hero = {
      ...createCharacterData({ name: 'Rider', classId: 'titan' }, 'r', 0),
      dungeons: { ...emptyDungeonProgress(), points: 100000, totalPoints: 100000 },
    }
    expect(() => upgradeDungeonBuff(hero, 257)).toThrow(/maximum/)
  })
})
