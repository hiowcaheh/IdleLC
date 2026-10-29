import { describe, expect, it } from 'vitest'
import { getMonster } from '../data/monsters.ts'
import { AFK_MAX_SECONDS, measureHuntRate, simulateAfk } from './afk.ts'
import { createCharacterData } from './character.ts'
import { combatTick, createCombat, type FighterInit } from './combat.ts'
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
    expect(one.exp).toBe(one.kills * monster.exp)
    expect(one.gold).toBe(one.kills * monster.gold)
    expect(one.character.gold).toBe(one.gold)
    expect(one.character.stats.kills).toBe(one.kills)
    expect(one.drops.length).toBeGreaterThan(0)
    expect(one.character.inventory).toEqual(one.drops)
    expect(one.levelsGained).toBeGreaterThan(0)
    expect(one.character.level).toBe(1 + one.levelsGained)
    expect(one.character.exp).toBeLessThan(expToNextLevel(one.character.level))

    const long = simulateAfk(hero, 30 * 3600, createRng(1))
    expect(long.seconds).toBe(AFK_MAX_SECONDS)
    expect(long.awaySeconds).toBe(30 * 3600)
    expect(long.kills).toBeGreaterThan(one.kills * 6)
  })

  it('pays nothing for no time', () => {
    const none = simulateAfk(hero, 0, createRng(1))
    expect(none).toMatchObject({ kills: 0, exp: 0, gold: 0, drops: [], levelsGained: 0 })
  })
})
