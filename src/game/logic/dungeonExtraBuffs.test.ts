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
    for (const id of [1062, 268, 269, 1108, 400]) {
      expect(DUNGEON_BUFFS).toContain(id)
      expect(dungeonBuffRank(id, 1).kind).toBe('buff')
      expect(dungeonBuffRank(id, 1).mpCost).toBe(0)
    }
    expect(dungeonBuffDefinition(1062)!.sourceLevel).toBe(2)
    expect(stat(1062)).toEqual([
      ['attack', 200, true],
      ['magicAttack', 200, true],
    ])
    // the horse mount's howlings at their top level (owner, 2026-11-07)
    expect(dungeonBuffDefinition(268)!.sourceLevel).toBe(12)
    expect(stat(268)).toEqual([
      ['attack', 100, false],
      ['magicAttack', 70, false],
    ])
    expect(stat(269)).toEqual([
      ['defense', 480, false],
      ['magicDefense', 20, false],
    ])
    // class buffs in place of the Moon Cake and Stars items (owner, 2026-11-13)
    expect(dungeonBuffDefinition(1108)!.sourceLevel).toBe(8)
    expect(dungeonBuffDefinition(1108)!.classId).toBe('knight')
    expect(stat(1108)).toEqual([['reflect'], ['dodge', 500, false]])
    expect(dungeonBuffDefinition(400)!.sourceLevel).toBe(6)
    expect(dungeonBuffDefinition(400)!.classId).toBe('titan')
    expect(dungeonBuffRank(400, 1).effects.find((e) => e.kind === 'reflect')).toMatchObject({
      chance: 0.5,
      power: 40,
      percent: true,
    })
    expect(DUNGEON_BUFFS).not.toContain(388)
    expect(DUNGEON_BUFFS).not.toContain(437)
  })

  it('cannot be upgraded', () => {
    const hero = {
      ...createCharacterData({ name: 'Rider', classId: 'titan' }, 'r', 0),
      dungeons: { ...emptyDungeonProgress(), points: 100000, totalPoints: 100000 },
    }
    expect(() => upgradeDungeonBuff(hero, 268)).toThrow(/maximum/)
  })
})
