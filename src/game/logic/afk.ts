/**
 * AFK expeditions: the time a character spends on an expedition (up to 8 h) becomes kills at the
 * same auto-combat as watched play. Finite supplies, level-ups and expiring titles take effect
 * at their actual simulation times. Pure; the server will run it too.
 */
import { deathLoss } from './death.ts'
import { boostEffects, boostsOf, liveBoosts } from './boosts.ts'
import { getMonster } from '../data/monsters.ts'
import type { CharacterData } from './character.ts'
import {
  combatTick,
  createCombat,
  takePotionsUsed,
  updatePlayer,
  type ActiveEffect,
  type FighterInit,
} from './combat.ts'
import { monsterFighter, playerFighter, type Hero } from './fighters.ts'
import { stowDrops, takeFromInventory, type ItemStack } from './loot.ts'
import { killReward, rewardKills } from './rewards.ts'
import { activeTitleId, applyLevelTitles, pruneTitles } from './titles.ts'
import { recordKills } from './spots.ts'
import { createRng, type Rng } from './rng.ts'

export const AFK_MAX_SECONDS = 8 * 3600
/** Every full second of an expedition counts. */
export const AFK_MIN_SECONDS = 1
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
  effects: readonly ActiveEffect[] = [],
): HuntRate {
  const potions = player.potions?.map((p) => ({ ...p, count: SAMPLE_POTIONS }))
  let state = createCombat({ ...player, potions }, 'sample', monster)
  // boosts working for the whole sample
  if (effects.length > 0)
    state = {
      ...state,
      player: {
        ...state.player,
        effects: effects.map((e) => ({ ...e, remaining: sampleSeconds + 1 })),
      },
    }
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
  /** EXP and SP (1/10 000) the deaths took (death.ts). */
  lost: { exp: number; sp: number }
  /** Seconds of the expedition each boost potion worked, by item. */
  boosts: { itemId: number; seconds: number }[]
  character: CharacterData
}

export interface HourlyEstimate extends HuntRate {
  expPerHour: number
  goldPerHour: number
  spPerHour: number
  /** Boost potions working now and how many seconds of the first hour each still covers. */
  boosts: { itemId: number; name: string; seconds: number }[]
}

/**
 * What the first hour of hunting `monsterId` is worth to the hero (level, skills, gear) with the
 * boost potions working now: each stretch of the hour is measured with the boosts still running
 * in it, as the expedition will play it (simulateAfk counts them down the same way).
 */
export function estimateHourly(
  hero: Hero,
  monsterId: string,
  rng: Rng,
  now = Date.now(),
): HourlyEstimate {
  const current = { ...hero, activeTitle: activeTitleId(hero, now) }
  const player = playerFighter(current, now)
  const monster = monsterFighter(monsterId)
  const boosts = boostEffects(hero.boosts, now)
  const hour = 3600
  const ends = [...new Set(boosts.map((b) => Math.min(hour, b.remaining)))].sort((a, b) => a - b)
  if (ends[ends.length - 1] !== hour) ends.push(hour)
  const rate: HuntRate = { killsPerHour: 0, deathsPerHour: 0, potionsPerHour: {} }
  let from = 0
  for (const to of ends) {
    const share = (to - from) / hour
    const working = boosts.filter((b) => b.remaining >= to - 1e-6)
    const part = measureHuntRate(player, monster, rng, HUNT_SAMPLE_SECONDS, working)
    rate.killsPerHour += part.killsPerHour * share
    rate.deathsPerHour += part.deathsPerHour * share
    for (const [id, count] of Object.entries(part.potionsPerHour))
      rate.potionsPerHour[Number(id)] = (rate.potionsPerHour[Number(id)] ?? 0) + count * share
    from = to
  }
  const reward = killReward(getMonster(monsterId), current, now)
  const kills = rate.killsPerHour * AFK_EFFICIENCY
  return {
    ...rate,
    expPerHour: kills * reward.exp,
    goldPerHour: kills * reward.gold,
    spPerHour: kills * reward.sp,
    boosts: boosts.map((b) => ({
      itemId: b.itemId!,
      name: b.name,
      seconds: Math.min(hour, b.remaining),
    })),
  }
}

/**
 * Pays `awaySeconds` of AFK hunting (capped at 8 h) of the expedition's monster — or the current
 * one — and returns the character with the rewards added and the potions it drank taken away.
 */
export function simulateAfk(
  character: CharacterData,
  awaySeconds: number,
  rng: Rng,
  now = Date.now(),
): AfkResult {
  const seconds = Math.min(Math.max(0, Math.floor(awaySeconds)), AFK_MAX_SECONDS)
  const startedAt = character.expedition?.startedAt ?? now - seconds * 1000
  const monster = getMonster(character.expedition?.monsterId ?? character.location.monsterId)
  let current = pruneTitles(character, startedAt)
  let totalExp = 0,
    gold = 0,
    sp = 0
  const lost = { exp: 0, sp: 0 }
  const items = new Map<number, number>()
  const used = new Map<number, number>()
  // Rewards have their own stream, as they do in LocalGameService during watched combat.
  const battleRng = createRng(Math.floor(rng() * 0x1_0000_0000))
  let state = createCombat(
    playerFighter(current, startedAt),
    monster.id,
    monsterFighter(monster.id),
  )
  // the boost potions working when the hero set off go on counting down on the expedition
  const boosts = boostEffects(current.boosts, startedAt)
  if (boosts.length > 0)
    state = { ...state, player: { ...state.player, effects: [...state.player.effects, ...boosts] } }
  const collectPotions = () => {
    const taken = takePotionsUsed(state)
    state = taken.state
    current = { ...current, inventory: takeFromInventory(current.inventory, taken.used).inventory }
    for (const { itemId, count } of taken.used) used.set(itemId, (used.get(itemId) ?? 0) + count)
  }
  const boostTime = new Map<number, number>()
  let done = 0
  while (done < seconds - 1e-9) {
    const time = startedAt + done * 1000
    const live = pruneTitles(current, time)
    if (live !== current) {
      current = live
      state = updatePlayer(state, playerFighter(current, time))
    }
    // Stop exactly at a title boundary; never give its bonus to a later kill.
    const expiry = current.titles.find((t) => t.id === current.activeTitle)?.expiresAt
    const untilExpiry = expiry == null ? Infinity : (expiry - time) / 1000
    const step = Math.min(0.05, seconds - done, Math.max(0.000001, untilExpiry))
    for (const e of state.player.effects)
      if (e.potion === 'boost' && e.itemId !== undefined)
        boostTime.set(e.itemId, (boostTime.get(e.itemId) ?? 0) + step)
    const tick = combatTick(state, step, battleRng)
    state = tick.state
    done += step
    // a death costs EXP and SP as on the server, at the moment it happens
    for (const e of tick.events) {
      if (e.type !== 'death' || e.who !== 'player') continue
      const loss = deathLoss(current.level, current.exp, character.sp + sp - lost.sp)
      current = { ...current, exp: current.exp - loss.exp }
      lost.exp += loss.exp
      lost.sp += loss.sp
    }
    const killCount = tick.events.filter((e) => e.type === 'death' && e.who === 'monster').length
    if (killCount === 0) continue
    collectPotions()
    const at = startedAt + done * 1000
    const reward = rewardKills(current, monster, killCount, rng, at)
    totalExp += reward.exp
    gold += reward.gold
    sp += reward.sp
    for (const item of reward.drops)
      items.set(item.itemId, (items.get(item.itemId) ?? 0) + item.count)
    const before = current
    current = applyLevelTitles(
      {
        ...current,
        level: reward.level,
        exp: reward.remainingExp,
        ...stowDrops(current, reward.drops, rng),
      },
      at,
    )
    // Keep continuous HP/MP, effects and cooldowns; do not restart the fight at a slice boundary.
    if (
      current.level !== before.level ||
      current.activeTitle !== before.activeTitle ||
      reward.drops.some(
        (d) =>
          current.potionSlots &&
          Object.values(current.potionSlots).some((p) => p.itemId === d.itemId),
      )
    ) {
      state = updatePlayer(state, playerFighter(current, at))
    }
  }
  collectPotions()
  const drops = [...items]
    .map(([itemId, count]) => ({ itemId, count }))
    .sort((a, b) => a.itemId - b.itemId)
  return {
    awaySeconds,
    seconds,
    monsterId: monster.id,
    kills: state.kills,
    deaths: state.deaths,
    exp: totalExp,
    gold,
    sp,
    levelBefore: character.level,
    levelsGained: current.level - character.level,
    drops,
    lost,
    boosts: [...boostTime]
      .map(([itemId, worked]) => ({ itemId, seconds: Math.round(worked) }))
      .filter((b) => b.seconds > 0),
    potionsUsed: [...used]
      .map(([itemId, count]) => ({ itemId, count }))
      .sort((a, b) => a.itemId - b.itemId),
    character: pruneTitles(
      {
        ...current,
        ...(current.boosts
          ? {
              boosts: liveBoosts(boostsOf(state.player.effects, startedAt + seconds * 1000), now),
            }
          : {}),
        gold: character.gold + gold,
        sp: character.sp + sp - lost.sp,
        ...recordKills(
          character,
          character.expedition ?? character.location,
          state.kills,
          state.deaths,
        ),
      },
      now,
    ),
  }
}
