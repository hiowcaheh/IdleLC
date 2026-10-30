/**
 * AFK expeditions: the time a character spends on an expedition (up to 8 h) becomes kills at the
 * rate the hero really achieves against the monster — measured by running the same auto-combat for
 * a sample period — and is then paid out like real fights. Pure; the server will run it too.
 */
import { getMonster } from '../data/monsters.ts'
import type { CharacterData } from './character.ts'
import { combatTick, createCombat, type FighterInit } from './combat.ts'
import { monsterFighter, playerFighter, type Hero } from './fighters.ts'
import { lootTable, rollDrops, stowDrops, takeFromInventory, type ItemStack } from './loot.ts'
import { gainExp } from './progression.ts'
import { killReward } from './rewards.ts'
import type { Rng } from './rng.ts'

export const AFK_MAX_SECONDS = 8 * 3600
/** Expeditions shorter than this pay nothing. */
export const AFK_MIN_SECONDS = 60
/** Stats are recomputed after every slice, so level ups while away make the hero stronger. */
export const AFK_SLICE_SECONDS = 600
/** Share of the watched hunting rate earned while away (own value: 1 = the same). */
export const AFK_EFFICIENCY = 1
/** Length of the fight sample used to measure the hunting rate, in game seconds. */
export const HUNT_SAMPLE_SECONDS = 1200

/** Potions the hero is given when its hunting rate is measured (as many as it wants). */
const SAMPLE_POTIONS = 1e9

export interface HuntRate {
  killsPerHour: number
  deathsPerHour: number
  /** Potions drunk per hour, by item id. */
  potionsPerHour: Record<number, number>
}

/**
 * Kills, deaths and potions per hour of `player` hunting `monster`, measured on the real auto-combat
 * (the hero has as many of its potions as it wants).
 */
export function measureHuntRate(
  player: FighterInit,
  monster: FighterInit,
  rng: Rng,
  sampleSeconds = HUNT_SAMPLE_SECONDS,
): HuntRate {
  const potions = player.potions?.map((p) => ({ ...p, count: SAMPLE_POTIONS }))
  let state = createCombat({ ...player, potions }, 'sample', monster)
  const step = 0.1
  for (let t = 0; t < sampleSeconds; t += step) state = combatTick(state, step, rng).state
  const perHour = 3600 / sampleSeconds
  const potionsPerHour: Record<number, number> = {}
  for (const [id, count] of Object.entries(state.player.potionsUsed)) {
    potionsPerHour[Number(id)] = count * perHour
  }
  return {
    killsPerHour: state.kills * perHour,
    deathsPerHour: state.deaths * perHour,
    potionsPerHour,
  }
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
  /** Skill points, in 1/10 000 SP. */
  sp: number
  levelBefore: number
  levelsGained: number
  drops: ItemStack[]
  /** Potions drunk (taken from the inventory). */
  potionsUsed: ItemStack[]
  character: CharacterData
}

export interface HourlyEstimate extends HuntRate {
  expPerHour: number
  goldPerHour: number
  spPerHour: number
}

/** What an hour of hunting `monsterId` is worth to the hero (level and skills) right now. */
export function estimateHourly(hero: Hero, monsterId: string, rng: Rng): HourlyEstimate {
  const rate = measureHuntRate(playerFighter(hero), monsterFighter(monsterId), rng)
  const reward = killReward(getMonster(monsterId))
  const kills = rate.killsPerHour * AFK_EFFICIENCY
  return {
    ...rate,
    expPerHour: kills * reward.exp,
    goldPerHour: kills * reward.gold,
    spPerHour: kills * reward.sp,
  }
}

/**
 * Pays `awaySeconds` of AFK hunting (capped at 8 h) of the expedition's monster — or the current
 * one — and returns the character with the rewards added and the potions it drank taken away.
 */
export function simulateAfk(character: CharacterData, awaySeconds: number, rng: Rng): AfkResult {
  const seconds = Math.min(Math.max(0, Math.floor(awaySeconds)), AFK_MAX_SECONDS)
  const monster = getMonster(character.expedition?.monsterId ?? character.location.monsterId)
  const reward = killReward(monster)
  let { level, exp } = character
  let kills = 0
  let deaths = 0
  // potions left in the bag; the hunting rate changes when a kind runs out
  const stock = new Map(character.inventory.map((s) => [s.itemId, s.count]))
  const used = new Map<number, number>()
  const rates = new Map<string, HuntRate>()
  const rateAt = (lvl: number) => {
    const inventory = [...stock].map(([itemId, count]) => ({ itemId, count }))
    const player = playerFighter({ ...character, level: lvl, inventory })
    const key = `${lvl}/${player.potions?.map((p) => p.itemId).join(',') ?? ''}`
    let rate = rates.get(key)
    if (!rate) {
      rate = measureHuntRate(player, monsterFighter(monster.id), rng)
      rates.set(key, rate)
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
    for (const [id, perHour] of Object.entries(rate.potionsPerHour)) {
      const itemId = Number(id)
      const left = stock.get(itemId) ?? 0
      const drunk = Math.min(left, roundRandom((perHour * slice) / 3600, rng))
      if (drunk <= 0) continue
      stock.set(itemId, left - drunk)
      used.set(itemId, (used.get(itemId) ?? 0) + drunk)
    }
  }

  const potions = takeFromInventory(
    character.inventory,
    [...used].map(([itemId, count]) => ({ itemId, count })),
  )
  const drops = rollDrops(lootTable(monster), kills, rng)
  const gold = kills * reward.gold
  const sp = kills * reward.sp
  return {
    awaySeconds,
    seconds,
    monsterId: monster.id,
    kills,
    deaths,
    exp: kills * reward.exp,
    gold,
    sp,
    levelBefore: character.level,
    levelsGained: level - character.level,
    drops,
    potionsUsed: potions.taken,
    character: {
      ...character,
      level,
      exp,
      gold: character.gold + gold,
      sp: character.sp + sp,
      stats: { kills: character.stats.kills + kills, deaths: character.stats.deaths + deaths },
      ...stowDrops({ inventory: potions.inventory, gear: character.gear }, drops, rng),
    },
  }
}
