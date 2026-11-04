import { describe, expect, it } from 'vitest'
import { getMonster } from '../data/monsters.ts'
import { TITLES } from '../data/titles.ts'
import { createCharacterData } from './character.ts'
import { createRng } from './rng.ts'
import { expToNextLevel } from './progression.ts'
import {
  KILL_BURST,
  MAX_REPORT_WINDOW,
  MIN_KILL_CYCLE,
  applyCombatReport,
  maxKills,
  rewardBonuses,
  killReward,
  rollKillReward,
  rewardKills,
} from './rewards.ts'

describe('rewards', () => {
  it('limits kills by elapsed time and game speed', () => {
    expect(maxKills(0)).toBe(KILL_BURST)
    expect(maxKills(MIN_KILL_CYCLE * 10)).toBe(10 + KILL_BURST)
    expect(maxKills(MIN_KILL_CYCLE * 10, 5)).toBe(50 + KILL_BURST)
    expect(maxKills(-5)).toBe(KILL_BURST)
  })

  it('never counts more than one report window, however old the last report is', () => {
    expect(maxKills(8 * 3600)).toBe(maxKills(MAX_REPORT_WINDOW))
  })

  it('rolls rewards only for accepted kills and records their totals', () => {
    const monster = getMonster('rust-golem')
    const hero = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)
    const r = applyCombatReport(
      hero,
      monster,
      { monsterId: monster.id, kills: 5, deaths: 2 },
      3,
      createRng(1),
    )
    expect(r.kills).toBe(3)
    expect(r.exp).toBeGreaterThan(0)
    expect(r.exp).toBeLessThanOrEqual(3 * monster.exp * 1.1)
    expect(r.gold).toBeGreaterThanOrEqual(0)
    expect(r.gold).toBeLessThanOrEqual(3 * monster.gold * 1.5)
    expect(r.sp).toBeGreaterThan(0)
    expect(r.character.sp).toBe(r.sp)
    expect(r.character.stats).toMatchObject({ kills: 3, deaths: 2 })
    expect(r.character.stats.monsterKills).toEqual({ [monster.id]: 3 })
    expect(r.character.gold).toBe(r.gold)
    expect(r.character.inventory).toEqual(r.drops)
  })

  it('adds worn EXP/SP options and title options once, with integer rewards per kill', () => {
    const hero = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)
    const title = {
      ...TITLES[1]!,
      id: 999,
      options: [
        { type: 82, level: 2 },
        { type: 83, level: 3 },
      ],
    }
    TITLES[999] = title
    try {
      const boosted = {
        ...hero,
        level: 50,
        equipment: {
          ...hero.equipment,
          accessory1: { uid: 'r', itemId: 166, plus: 0, options: [{ type: 82, level: 1 }] },
        },
        gear: [{ uid: 'bag', itemId: 166, plus: 0, options: [{ type: 83, level: 5 }] }],
        titles: [{ id: 999, expiresAt: 2000 }],
        activeTitle: 999,
      }
      expect(rewardBonuses(boosted, 1000)).toEqual({ exp: 30, sp: 30, gold: 0, drop: 0 })
      const monster = { ...getMonster('rust-golem'), level: 50, exp: 1000, sp: 1000, gold: 100 }
      expect(killReward(monster, boosted, 1000)).toEqual({ exp: 1300, sp: 1300, gold: 80 })
      const report = applyCombatReport(
        boosted,
        monster,
        { monsterId: monster.id, kills: 3, deaths: 0 },
        3,
        () => 0.5,
        0,
        1000,
      )
      expect(report).toMatchObject({ exp: 3900, sp: 3900, gold: 300 })
      expect(rewardBonuses(boosted, 2000)).toEqual({ exp: 10, sp: 0, gold: 0, drop: 0 })
      const expired = applyCombatReport(
        boosted,
        monster,
        { monsterId: monster.id, kills: 1, deaths: 0 },
        1,
        () => 0.5,
        0,
        2000,
      )
      expect(expired).toMatchObject({
        exp: 1100,
        sp: 1000,
        character: { activeTitle: null, titles: [] },
      })
    } finally {
      delete TITLES[999]
    }
  })

  it('uses independent integer ±10% rolls, C++ truncation and the 50% gold amount', () => {
    const hero = { classId: 'knight' as const, level: 31 }
    const monster = { ...getMonster('rust-golem'), level: 30, exp: 199, sp: 999, gold: 101 }
    const values = [0, 0.999, 0, 0]
    expect(rollKillReward(monster, hero, () => values.shift()!, 0)).toEqual({
      exp: 171, // trunc(199 * .95) = 189; 189 + trunc(-18.9)
      sp: 988, // trunc(999 * .90) = 899; 899 + trunc(89.9)
      gold: 50,
    })
  })

  it('keeps the source minimum of one internal SP unit when the level penalty reaches zero', () => {
    const monster = { ...getMonster('rust-golem'), level: 30, exp: 1000, sp: 1000 }
    expect(rollKillReward(monster, { classId: 'knight', level: 40 }, () => 0.5, 0)).toMatchObject({
      exp: 100,
      sp: 1,
    })
  })

  it('varies each resource independently and converges on the expected neutral rewards', () => {
    const monster = { ...getMonster('rust-golem'), level: 30, exp: 1000, sp: 1000, gold: 100 }
    const hero = { classId: 'knight' as const, level: 30 }
    const rng = createRng(842)
    const rewards = Array.from({ length: 10000 }, () => rollKillReward(monster, hero, rng, 0))
    for (const key of ['exp', 'sp', 'gold'] as const) {
      const values = rewards.map((r) => r[key])
      expect(new Set(values).size).toBeGreaterThan(10)
      const expected = killReward(monster, hero, 0)[key]
      expect(Math.abs(values.reduce((a, b) => a + b, 0) / values.length - expected)).toBeLessThan(3)
    }
    expect(rewards.filter((r) => r.gold === 0).length).toBeGreaterThan(1800)
    expect(rewards.filter((r) => r.gold === 0).length).toBeLessThan(2200)
    const top = [0.5, 0.5, 0, 0.999]
    expect(rollKillReward(monster, hero, () => top.shift()!, 0).gold).toBe(150)
    expect(rollKillReward(monster, hero, () => 0.8, 0).gold).toBe(0)
  })

  it('blocks every item drop at +6 and applies a level-up between kills in the same report', () => {
    const hero = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0),
      level: 6,
      exp: expToNextLevel(6) - 1,
    }
    const monster = {
      ...getMonster('rust-golem'),
      exp: 1,
      sp: 0,
      drops: [{ itemId: 1, chance: 1 }],
    }
    const result = rewardKills(hero, monster, 2, () => 0.5, 0)
    expect(result).toMatchObject({
      level: 7,
      remainingExp: 1,
      exp: 2,
      sp: 2,
      drops: [{ itemId: 1, count: 1 }],
    })
    expect(rewardKills({ ...hero, level: 7 }, monster, 50, () => 0, 0).drops).toEqual([])
  })

  it('takes the potions drunk out of the inventory, never more than there are', () => {
    const monster = getMonster('rust-golem')
    const hero = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0),
      inventory: [
        { itemId: 43, count: 3 },
        { itemId: 484, count: 1 },
        { itemId: 4, count: 1 },
      ],
    }
    const r = applyCombatReport(
      hero,
      monster,
      {
        monsterId: monster.id,
        kills: 0,
        deaths: 0,
        potions: [
          { itemId: 43, count: 2 },
          { itemId: 484, count: 5 },
          { itemId: 4, count: 1 }, // not a potion
          { itemId: 44, count: 1 }, // not owned
        ],
      },
      0,
      createRng(1),
    )
    expect(r.potionsUsed).toEqual([
      { itemId: 43, count: 2 },
      { itemId: 484, count: 1 },
    ])
    expect(r.character.inventory).toEqual([
      { itemId: 43, count: 1 },
      { itemId: 4, count: 1 },
    ])
  })
})
