import { describe, expect, it } from 'vitest'
import { getItem } from '../data/items.ts'
import { getMonster, MONSTERS } from '../data/monsters.ts'
import { AFK_MAX_SECONDS, estimateHourly, measureHuntRate, simulateAfk } from './afk.ts'
import { createCharacterData } from './character.ts'
import { combatTick, createCombat, type FighterInit } from './combat.ts'
import { killReward } from './rewards.ts'
import { expToNextLevel } from './progression.ts'
import { createRng } from './rng.ts'

const stats = (over: Partial<FighterInit['stats']>): FighterInit['stats'] => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

/** Kills and deaths of the real auto-combat over `seconds`. */
function simulate(player: FighterInit, monster: FighterInit, seconds: number) {
  let state = createCombat(player, 'm', monster)
  const rng = createRng(7)
  for (let t = 0; t < seconds; t += 0.05) state = combatTick(state, 0.05, rng).state
  return { kills: state.kills, deaths: state.deaths }
}

describe('measureHuntRate', () => {
  it('measures the real auto-combat, deaths included', () => {
    const player = { level: 5, stats: stats({ attack: 14, maxHp: 160, defense: 8 }) }
    const monster = { level: 6, stats: stats({ maxHp: 110, attack: 24, attackInterval: 1.4 }) }
    const rate = measureHuntRate(player, monster, createRng(3), 3600)
    const real = simulate(player, monster, 3600)
    expect(rate.killsPerHour).toBeGreaterThan(real.kills * 0.85)
    expect(rate.killsPerHour).toBeLessThan(real.kills * 1.15)
    expect(rate.deathsPerHour).toBeGreaterThan(0)
  })

  it('gives no kills when the monster always wins', () => {
    const rate = measureHuntRate(
      { level: 1, stats: stats({ attack: 2 }) },
      { level: 20, stats: stats({ maxHp: 5000, attack: 80 }) },
      createRng(1),
    )
    expect(rate.killsPerHour).toBe(0)
    expect(rate.deathsPerHour).toBeGreaterThan(0)
  })
})

describe('simulateAfk', () => {
  const hero = createCharacterData({ name: 'Brom', classId: 'knight' }, 'id', 0)

  it('pays kills, exp, gold and drops for the time away, capped at 8 hours', () => {
    const one = simulateAfk(hero, 3600, createRng(1))
    const monster = getMonster(hero.location.monsterId)
    expect(one.seconds).toBe(3600)
    expect(one.kills).toBeGreaterThan(100)
    expect(one.exp).toBeGreaterThan(0)
    expect(one.exp).toBeLessThan(one.kills * monster.exp * 1.1)
    expect(one.gold).toBeGreaterThan(0)
    expect(one.gold).toBeLessThan(one.kills * monster.gold * 1.5)
    expect(one.character.gold).toBe(one.gold)
    expect(one.character.stats.kills).toBe(one.kills)
    expect(one.drops.length).toBeGreaterThan(0)
    // accessories come as single pieces with options, everything else stacks in the bag
    const accessory = (itemId: number) => getItem(itemId).gear?.slot === 'accessory'
    expect([...one.character.inventory].sort((a, b) => a.itemId - b.itemId)).toEqual(
      one.drops.filter((d) => !accessory(d.itemId)),
    )
    expect(one.character.gear.map((p) => p.itemId).sort((a, b) => a - b)).toEqual(
      one.drops.filter((d) => accessory(d.itemId)).flatMap((d) => Array(d.count).fill(d.itemId)),
    )
    expect(one.levelsGained).toBeGreaterThan(0)
    expect(one.character.level).toBe(1 + one.levelsGained)
    expect(one.character.exp).toBeLessThan(expToNextLevel(one.character.level))

    const long = simulateAfk(hero, 30 * 3600, createRng(1))
    expect(long.seconds).toBe(AFK_MAX_SECONDS)
    expect(long.awaySeconds).toBe(30 * 3600)
    expect(long.kills).toBeGreaterThan(one.kills * 6)
  })

  it('hunts the expedition monster and estimates an hour of it', () => {
    const away = {
      ...hero,
      expedition: { zoneId: 'glade', monsterId: 'stone-sentinel', startedAt: 0 },
    }
    expect(simulateAfk(away, 3600, createRng(1)).monsterId).toBe('stone-sentinel')
    const estimate = estimateHourly({ classId: 'knight', level: 1 }, 'rust-golem', createRng(1))
    const golem = getMonster('rust-golem')
    expect(estimate.expPerHour).toBeCloseTo(estimate.killsPerHour * golem.exp)
    expect(estimate.goldPerHour).toBeCloseTo(
      estimate.killsPerHour * killReward(golem, { classId: 'knight', level: 1 }, 0).gold,
    )
  })

  it('uses EXP/SP option rewards in both AFK payouts and hourly estimates', () => {
    const boosted = {
      ...hero,
      level: 50,
      titles: [],
      activeTitle: null,
      equipment: {
        ...hero.equipment,
        accessory1: {
          uid: 'bonus',
          itemId: 166,
          plus: 0,
          options: [
            { type: 82, level: 2 },
            { type: 83, level: 3 },
          ],
        },
      },
    }
    // Equal high levels keep this test below the next level-up, isolating option rewards.
    const original = getMonster(hero.location.monsterId)
    const monster = { ...original, level: 50 }
    MONSTERS[monster.id] = monster
    try {
      const reward = killReward(monster, boosted, 1000)
      const payout = simulateAfk(boosted, 3600, createRng(7), 1000)
      const plainHero = { ...boosted, equipment: hero.equipment }
      const plainPayout = simulateAfk(plainHero, 3600, createRng(7), 1000)
      expect(payout.levelsGained).toBe(0)
      expect(payout.kills).toBe(plainPayout.kills)
      expect(payout.exp).toBeGreaterThan(plainPayout.exp)
      expect(payout.sp).toBeGreaterThan(plainPayout.sp)
      expect(payout.exp).not.toBe(payout.kills * reward.exp)
      const estimate = estimateHourly(boosted, monster.id, createRng(7), 1000)
      expect(estimate.expPerHour).toBeCloseTo(estimate.killsPerHour * reward.exp)
      expect(estimate.spPerHour).toBeCloseTo(estimate.killsPerHour * reward.sp)
      const plain = estimateHourly(plainHero, monster.id, createRng(7), 1000)
      expect(estimate.killsPerHour).toBe(plain.killsPerHour)
      expect(estimate.expPerHour).toBeGreaterThan(plain.expPerHour)
    } finally {
      MONSTERS[monster.id] = original
    }
  })

  it('uses the same level restrictions for expedition payouts and hourly estimates', () => {
    const overlevelled = { ...hero, level: 30, titles: [], activeTitle: null }
    const payout = simulateAfk(overlevelled, 3600, createRng(9), 1000)
    expect(payout.kills).toBeGreaterThan(0)
    expect(payout).toMatchObject({ exp: payout.kills, sp: payout.kills, gold: 0, drops: [] })
    expect(payout.character.stats.kills).toBe(payout.kills)
    const estimate = estimateHourly(overlevelled, hero.location.monsterId, createRng(9), 1000)
    expect(estimate.expPerHour).toBe(estimate.killsPerHour)
    expect(estimate.spPerHour).toBe(estimate.killsPerHour)
    expect(estimate.goldPerHour).toBe(0)
  })

  it('drinks the potions of its quick slots against a tough monster, never more than it has', () => {
    const sentinel = { zoneId: 'glade', monsterId: 'stone-sentinel', startedAt: 0 }
    // Asymmetric, tough target: source PC equipment now absorbs the old weak placeholder's hits.
    const original = MONSTERS['stone-sentinel']!
    MONSTERS['stone-sentinel'] = {
      ...original,
      stats: { ...original.stats, maxHp: 400, attack: 55 },
    }
    try {
      const stocked = {
        ...hero,
        expedition: sentinel,
        inventory: [
          { itemId: 43, count: 50 },
          { itemId: 490, count: 50 },
        ],
        potionSlots: { hp: { itemId: 43, auto: true }, mp: { itemId: null, auto: true } },
      }
      const plenty = simulateAfk(stocked, 3600, createRng(1))
      const drunk = (r: typeof plenty, id: number) =>
        r.potionsUsed.find((p) => p.itemId === id)?.count ?? 0
      expect(drunk(plenty, 43)).toBeGreaterThan(0)
      expect(drunk(plenty, 490)).toBe(0) // not in a slot
      const left = (id: number) =>
        plenty.character.inventory.find((s) => s.itemId === id)?.count ?? 0
      expect(left(43)).toBe(50 - drunk(plenty, 43))
      expect(left(490)).toBe(50)

      const regen = simulateAfk(
        { ...stocked, potionSlots: { ...stocked.potionSlots, hp: { itemId: 490, auto: true } } },
        3600,
        createRng(1),
      )
      expect(drunk(regen, 490)).toBeGreaterThan(0)

      const scarce = simulateAfk(
        { ...stocked, inventory: [{ itemId: 43, count: 1 }] },
        8 * 3600,
        createRng(1),
      )
      expect(scarce.potionsUsed).toEqual([{ itemId: 43, count: 1 }])
      expect(scarce.character.inventory.some((s) => s.itemId === 43)).toBe(false)

      const off = simulateAfk(
        { ...stocked, potionSlots: { ...stocked.potionSlots, hp: { itemId: 43, auto: false } } },
        3600,
        createRng(1),
      )
      expect(off.potionsUsed).toEqual([])
    } finally {
      MONSTERS['stone-sentinel'] = original
    }
  })

  it('pays nothing for no time', () => {
    const none = simulateAfk(hero, 0, createRng(1))
    expect(none).toMatchObject({ kills: 0, exp: 0, gold: 0, drops: [], levelsGained: 0 })
  })
})
