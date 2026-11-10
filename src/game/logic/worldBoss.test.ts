import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { GOLDEN_MAGNIFIER_ID, getItem, getRareSet } from '../data/items.ts'
import { getMonster } from '../data/monsters.ts'
import { WORLD_BOSSES } from '../data/worldBosses.ts'
import { ZONES } from '../data/zones.ts'
import { nameTone } from '../../ui/gear/format.ts'
import { createCharacterData } from './character.ts'
import { stowDrops } from './loot.ts'
import { applyIdentify, isRare, isUnidentified } from './rare.ts'
import { rewardKills } from './rewards.ts'
import { createRng } from './rng.ts'
import { createDefaultSave, loadSave } from './save.ts'
import {
  chargeWorldBoss,
  sanitizeWorldBossProgress,
  summonWorldBoss,
  worldBossDrops,
} from './worldBoss.ts'

const hero = () =>
  createCharacterData({ name: 'BossTester', classId: 'knight' }, 'boss-test', 1_000)
const guaranteed = [
  { itemId: 45, count: 10 },
  { itemId: 47, count: 5 },
  { itemId: 169, count: 1 },
  { itemId: 485, count: 10 },
  { itemId: 673, count: 1 },
  { itemId: 723, count: 5 },
  { itemId: 759, count: 1 },
  { itemId: 786, count: 5 },
  { itemId: 972, count: 5 },
]

describe('World Boss source data and drops', () => {
  it('uses the four source bosses and the owner’s thresholds, outside normal hunting spots', () => {
    expect(WORLD_BOSSES.map((b) => [b.zoneId, b.monsterId, b.killsRequired])).toEqual([
      ['lc-zone-0', 'lc-308', 2000],
      ['lc-zone-4', 'lc-307', 1800],
      ['lc-zone-7', 'lc-309', 1600],
      ['lc-zone-15', 'lc-331', 1500],
    ])
    for (const boss of WORLD_BOSSES) {
      expect(ZONES[boss.zoneId]!.monsterIds).not.toContain(boss.monsterId)
      expect(ZONES[boss.zoneId]!.bossIds).toContain(boss.monsterId)
      expect(getMonster(boss.monsterId).modelId).not.toBe('rust-golem')
      expect(boss.raidDrops).toHaveLength(19)
      expect(
        boss.raidDrops
          .filter((d) => d.probability === 10000)
          .map((d) => ({ itemId: d.item, count: d.count })),
      ).toEqual(guaranteed)
      const rare = boss.raidDrops.filter((d) => d.probability < 10000)
      expect(rare.map((d) => d.item)).toEqual(Array.from({ length: 10 }, (_, i) => 1828 + i))
      expect(rare.every((d) => d.count === 1 && d.flag === 0)).toBe(true)
      expect(new Set(rare.map((d) => d.probability))).toEqual(
        new Set([{ 'lc-308': 100, 'lc-307': 180, 'lc-309': 140, 'lc-331': 200 }[boss.monsterId]]),
      )
    }
  })

  it('always pays the nine guaranteed source stacks, without global IdleLC extras', () => {
    for (const boss of WORLD_BOSSES)
      expect(worldBossDrops(getMonster(boss.monsterId), () => 0.999999)).toEqual(guaranteed)
  })

  it('rolls every rare accessory independently with exact inclusive source thresholds', () => {
    for (const boss of WORLD_BOSSES) {
      const threshold = boss.raidDrops.find((d) => d.item === 1828)!.probability
      const rareOnly = (value: number) =>
        worldBossDrops(getMonster(boss.monsterId), () => value).filter(
          (d) => d.itemId >= 1828 && d.itemId <= 1837,
        )
      expect(rareOnly((threshold - 1) / 10000)).toHaveLength(10)
      expect(rareOnly(threshold / 10000)).toEqual([])
      let draws = 0
      const drops = worldBossDrops(getMonster(boss.monsterId), () =>
        ++draws === 11 ? 0 : 0.999999,
      )
      expect(drops.filter((d) => d.itemId >= 1828 && d.itemId <= 1837)).toEqual([
        { itemId: 1829, count: 1 },
      ])
    }
  })

  it('gives identical item rolls at blue/red levels and with extreme drop multipliers', () => {
    for (const boss of WORLD_BOSSES) {
      const monster = getMonster(boss.monsterId)
      const drops = (level: number, multiplier: number) =>
        rewardKills(
          { ...hero(), level },
          monster,
          1,
          createRng(34),
          1000,
          { exp: multiplier, sp: multiplier, gold: multiplier, drop: multiplier },
          worldBossDrops,
        ).drops
      expect(drops(1, 1)).toEqual(drops(165, 100))
      expect(drops(165, 100)).toEqual(worldBossDrops(monster, createRng(34)))
      expect(drops(165, 100)).toEqual(expect.arrayContaining(guaranteed))
    }
  })

  it('keeps the raw Balrog equipment slots, including classes outside IdleLC', () => {
    let draws = 0
    const drops = worldBossDrops(getMonster('lc-308'), () =>
      ++draws <= 19 ? 0.999999 : (draws - 20) % 2 === 0 ? 12 / 20 : 0,
    )
    expect(drops).toContainEqual({ itemId: 394, count: 4 })
  })

  it('stows raid ACC unidentified, then identifies the original options and grade colours', () => {
    const drops = Array.from({ length: 10 }, (_, i) => ({ itemId: 1828 + i, count: 1 }))
    const bag = stowDrops(hero(), drops, createRng(4))
    expect(bag.gear).toHaveLength(10)
    for (const piece of bag.gear) {
      expect(isUnidentified(piece)).toBe(true)
      expect(piece.options).toBeUndefined()
      expect(nameTone(piece)).toBe(' name--unidentified')
      expect(getItem(piece.itemId).rare).toEqual([{ set: piece.itemId - 1818, weight: 10000 }])
    }
    const identified = applyIdentify(
      { ...hero(), ...bag, inventory: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 10 }] },
      GOLDEN_MAGNIFIER_ID,
      bag.gear.map((p) => ({ uid: p.uid })),
      createRng(7),
    )
    expect(identified.used).toBe(10)
    for (const piece of identified.character.gear) {
      const set = getRareSet(piece.itemId - 1818)!
      expect(piece.rare).toBe(set.id)
      expect(piece.options).toEqual(set.options.map(({ type, level }) => ({ type, level })))
      expect(nameTone(piece)).toBe(piece.itemId === 1828 ? ' name--grade-B' : ' name--grade-A')
    }
    expect(isRare(10953)).toBe(false) // Seraphim is not unidentified equipment.
    expect(
      stowDrops(hero(), [{ itemId: 169, count: 1 }], createRng(3)).gear[0]!.options!.length,
    ).toBeGreaterThan(0)
  })
})

describe('World Boss charge and save compatibility', () => {
  it('caps each map separately and preserves it across an older v16 save', () => {
    let c = chargeWorldBoss(hero(), 3000)
    expect(c.worldBoss!.kills).toEqual({ 'lc-zone-0': 2000 })
    c = chargeWorldBoss(
      { ...c, location: { zoneId: 'lc-zone-4', monsterId: ZONES['lc-zone-4']!.monsterIds[0]! } },
      100,
    )
    expect(c.worldBoss!.kills).toEqual({ 'lc-zone-0': 2000, 'lc-zone-4': 100 })
    const original = createDefaultSave(1000)
    original.characters = [c, { ...hero(), id: 'other', worldBoss: undefined }]
    const loaded = loadSave(JSON.stringify(original), 1000)
    expect(loaded.save.saveVersion).toBe(16)
    expect(loaded.save.characters[0]!.worldBoss).toEqual(c.worldBoss)
    expect(loaded.save.characters[1]!.worldBoss).toEqual({ kills: {}, defeated: {}, active: null })
    expect(
      sanitizeWorldBossProgress({
        kills: { 'lc-zone-0': Infinity, 'lc-zone-4': 99999, bad: 20 },
        active: { id: 'bad' },
      }),
    ).toEqual({ kills: { 'lc-zone-4': 1800 }, defeated: {}, active: null })
  })

  it('consumes one full charge without changing the saved ordinary spot', () => {
    const c = chargeWorldBoss(hero(), 2000)
    const fight = summonWorldBoss(c, 'encounter', 2000)
    expect(fight.location).toEqual(c.location)
    expect(fight.worldBoss!.kills['lc-zone-0']).toBe(0)
    expect(fight.worldBoss!.active!.arenaMonsterId).not.toBe(c.location.monsterId)
    expect(chargeWorldBoss(fight, 2000)).toBe(fight)
    expect(() => summonWorldBoss(fight, 'twice', 2001)).toThrow('world-boss-active')
    expect(() => summonWorldBoss(hero(), 'early', 2000)).toThrow('world-boss-not-ready')
  })
})
