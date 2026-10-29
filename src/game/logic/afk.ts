/**
 * AFK hunting: time away from the game (up to 8 h) becomes kills at the rate the hero really
 * achieves against the monster — measured by running the same auto-combat for a sample period —
 * and is then paid out like real fights. Pure; the server will run it too.
 */
import { getMonster } from '../data/monsters.ts'
import type { CharacterData } from './character.ts'
import { combatTick, createCombat, type FighterInit } from './combat.ts'
import { monsterFighter, playerFighter } from './fighters.ts'
import { addToInventory, rollDrops, type ItemStack } from './loot.ts'
import { gainExp } from './progression.ts'
import { killReward } from './rewards.ts'
import type { Rng } from './rng.ts'

export const AFK_MAX_SECONDS = 8 * 3600
/** Shorter breaks are not worth a summary. */
export const AFK_MIN_SECONDS = 60
/** Stats are recomputed after every slice, so level ups while away make the hero stronger. */
export const AFK_SLICE_SECONDS = 600
/** Share of the watched hunting rate earned while away (own value: 1 = the same). */
export const AFK_EFFICIENCY = 1
/** Length of the fight sample used to measure the hunting rate, in game seconds. */
export const HUNT_SAMPLE_SECONDS = 1200

export interface HuntRate {
  killsPerHour: number
  deathsPerHour: number
}

/** Kills and deaths per hour of `player` hunting `monster`, measured on the real auto-combat. */
export function measureHuntRate(
  player: FighterInit,
  monster: FighterInit,
  rng: Rng,
  sampleSeconds = HUNT_SAMPLE_SECONDS,
): HuntRate {
  let state = createCombat(player, 'sample', monster)
  const step = 0.1
  for (let t = 0; t < sampleSeconds; t += step) state = combatTick(state, step, rng).state
  const perHour = 3600 / sampleSeconds
  return { killsPerHour: state.kills * perHour, deathsPerHour: state.deaths * perHour }
}

/** Rounds down or up at random so that the average stays exact. */
function roundRandom(value: number, rng: Rng): number {
  const whole = Math.floor(value)
  return whole + (rng() < value - whole ? 1 : 0)
}

export interface AfkResult {
  /** Real time away, in seconds. */
  awaySeconds: number
  /** Time that was paid (at most AFK_MAX_SECONDS). */
  seconds: number
  monsterId: string
  kills: number
  deaths: number
  exp: number
  gold: number
  levelBefore: number
  levelsGained: number
  drops: ItemStack[]
  character: CharacterData
}

/** Hunts the character's current monster for the time away and pays out the result. */
export function simulateAfk(character: CharacterData, awaySeconds: number, rng: Rng): AfkResult {
  const seconds = Math.min(Math.max(0, Math.floor(awaySeconds)), AFK_MAX_SECONDS)
  const monster = getMonster(character.location.monsterId)
  const reward = killReward(monster)
  let { level, exp } = character
  let kills = 0
  let deaths = 0
  const rates = new Map<number, HuntRate>()
  const rateAt = (lvl: number) => {
    let rate = rates.get(lvl)
    if (!rate) {
      rate = measureHuntRate(playerFighter(character.classId, lvl), monsterFighter(monster.id), rng)
      rates.set(lvl, rate)
    }
    return rate
  }

  for (let done = 0; done < seconds; done += AFK_SLICE_SECONDS) {
    const slice = Math.min(AFK_SLICE_SECONDS, seconds - done)
    const rate = rateAt(level)
    const sliceKills = roundRandom((rate.killsPerHour * AFK_EFFICIENCY * slice) / 3600, rng)
    deaths += roundRandom((rate.deathsPerHour * slice) / 3600, rng)
    kills += sliceKills
    ;({ level, exp } = gainExp(level, exp, sliceKills * reward.exp))
  }

  const drops = rollDrops(monster.drops, kills, rng)
  const gold = kills * reward.gold
  return {
    awaySeconds,
    seconds,
    monsterId: monster.id,
    kills,
    deaths,
    exp: kills * reward.exp,
    gold,
    levelBefore: character.level,
    levelsGained: level - character.level,
    drops,
    character: {
      ...character,
      level,
      exp,
      gold: character.gold + gold,
      stats: { kills: character.stats.kills + kills, deaths: character.stats.deaths + deaths },
      inventory: addToInventory(character.inventory, drops),
    },
  }
}
