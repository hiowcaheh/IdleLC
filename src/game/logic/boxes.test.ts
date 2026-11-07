import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { DUNGEON_BOXES } from '../data/boxes.ts'
import { HEAVEN_STONE_ID, SMELTING_STONE_ID, getItem } from '../data/items.ts'
import { applyOpenBoxes, rollBoxPrize } from './boxes.ts'
import { createCharacterData } from './character.ts'
import { freshFighter } from './combat.ts'
import { DUNGEON_BOX_REACH, createDungeonRun, dungeonStep } from './dungeons.ts'
import { monsterFighter } from './fighters.ts'
import { createRng } from './rng.ts'

const NOW = Date.UTC(2026, 10, 7, 12)
const hero = () => ({
  ...createCharacterData({ name: 'BoxHero', classId: 'knight' }, 'b', NOW),
  level: 30,
})

describe('dungeon boxes (owner, 2026-11-07)', () => {
  it('are known items with a client icon', () => {
    for (const id of Object.values(DUNGEON_BOXES)) {
      expect(getItem(id).name).toMatch(/ Box$/)
      expect(getItem(id).type).toBe('scroll')
    }
  })

  it('give a Smelting Stone 80% and a Heaven Stone 20% of the time', () => {
    const rng = createRng(7)
    let heaven = 0
    for (let i = 0; i < 10000; i++) {
      const prize = rollBoxPrize(DUNGEON_BOXES.belfist, rng)
      expect(prize.count).toBe(1)
      if (prize.itemId === HEAVEN_STONE_ID) heaven++
      else expect(prize.itemId).toBe(SMELTING_STONE_ID)
    }
    expect(heaven).toBeGreaterThan(1850)
    expect(heaven).toBeLessThan(2150)
  })

  it('open from the bag into stones', () => {
    const character = { ...hero(), inventory: [{ itemId: DUNGEON_BOXES.procyon, count: 5 }] }
    const opened = applyOpenBoxes(character, DUNGEON_BOXES.procyon, 5, createRng(3))
    expect(opened.prizes.reduce((sum, p) => sum + p.count, 0)).toBe(5)
    expect(opened.character.inventory.some((s) => s.itemId === DUNGEON_BOXES.procyon)).toBe(false)
    expect(() => applyOpenBoxes(character, DUNGEON_BOXES.procyon, 6, createRng(3))).toThrow()
  })

  it('fall where a monster dies and are picked up by walking into them', () => {
    const run = createDungeonRun(hero(), 'maargadum', 'r', NOW)
    const fighter = freshFighter(monsterFighter('lc-35'))
    fighter.hp = 0
    run.enemies = [{ uid: run.nextUid++, monsterId: 'lc-35', x: 6, z: 0, fighter, deadFor: -1 }]
    // every roll under 5%: the kill leaves the box
    const dropped = dungeonStep(run, 0.05, { x: 0, z: 0 }, () => 0.01).run
    expect(dropped.boxes).toHaveLength(1)
    const box = dropped.boxes![0]!
    expect(box.itemId).toBe(DUNGEON_BOXES.maargadum)
    // it stays put while the hero is away…
    const away = dungeonStep(dropped, 0.05, { x: 0, z: 0 }, createRng(1))
    expect(away.boxes).toEqual([])
    expect(away.run.boxes).toHaveLength(1)
    // …and is picked up once the hero stands on it
    away.run.position = { x: box.x + DUNGEON_BOX_REACH * 0.5, z: box.z }
    const picked = dungeonStep(away.run, 0.05, { x: 0, z: 0 }, createRng(1))
    expect(picked.boxes).toEqual([DUNGEON_BOXES.maargadum])
    expect(picked.run.boxes).toHaveLength(0)
  })
})
