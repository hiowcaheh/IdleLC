/**
 * Combat rewards. The browser only animates the fight and reports its outcome; the service
 * (later: a Supabase function) checks the report against the clock and pays out. Pure.
 */
import { getItem } from '../data/items.ts'
import type { MonsterDef } from '../data/types.ts'
import { clamp } from './balance.ts'
import type { CharacterData } from './character.ts'
import { TIMINGS } from './combat.ts'
import { addToInventory, lootTable, rollDrops, takeFromInventory, type ItemStack } from './loot.ts'
import { gainExp } from './progression.ts'
import type { Rng } from './rng.ts'

/** Shortest possible time between two kills (victory pause + respawn), in game seconds. */
export const MIN_KILL_CYCLE = TIMINGS.victory + TIMINGS.spawning

/** Extra kills tolerated in one report (timing jitter, batched reports). */
export const KILL_BURST = 2

/**
 * Longest time one report may cover, in seconds. Fights are reported every few seconds; time away
 * from the game is paid by the AFK simulation instead, so an old report window grants nothing extra.
 */
export const MAX_REPORT_WINDOW = 600

export interface CombatReport {
  monsterId: string
  kills: number
  deaths: number
  /** Potions drunk in the fights (taken from the inventory, at most what it holds). */
  potions?: ItemStack[]
}

export interface CombatResult {
  character: CharacterData
  /** Kills that were paid out; the rest exceeded the rate limit. */
  kills: number
  exp: number
  gold: number
  /** Skill points, in 1/10 000 SP. */
  sp: number
  levelsGained: number
  /** Items that dropped (already added to the inventory). */
  drops: ItemStack[]
  /** Potions taken from the inventory. */
  potionsUsed: ItemStack[]
}

/** Most kills a report may hold after `elapsedSeconds` of real time at a given game speed. */
export function maxKills(elapsedSeconds: number, timeScale = 1): number {
  const window = Math.min(Math.max(0, elapsedSeconds), MAX_REPORT_WINDOW)
  return Math.floor((window * Math.max(1, timeScale)) / MIN_KILL_CYCLE) + KILL_BURST
}

/**
 * Reward for one kill: t_npc.a_exp, a_prize and a_skill_point 1:1. Level-difference rules and
 * party bonuses come with the LC server code.
 */
export function killReward(monster: MonsterDef): { exp: number; gold: number; sp: number } {
  return { exp: monster.exp, gold: monster.gold, sp: monster.sp ?? 0 }
}

/**
 * Pays out a combat report, accepting at most `allowedKills` kills; rolls the drops and takes the
 * potions drunk out of the inventory.
 */
export function applyCombatReport(
  character: CharacterData,
  monster: MonsterDef,
  report: CombatReport,
  allowedKills: number,
  rng: Rng,
): CombatResult {
  const kills = clamp(Math.floor(report.kills), 0, Math.max(0, allowedKills))
  const deaths = Math.max(0, Math.floor(report.deaths))
  const reward = killReward(monster)
  const exp = reward.exp * kills
  const gold = reward.gold * kills
  const sp = reward.sp * kills
  const progress = gainExp(character.level, character.exp, exp)
  const drops = rollDrops(lootTable(monster), kills, rng)
  const potions = (report.potions ?? []).filter((p) => getItem(p.itemId).potion)
  const { inventory, taken } = takeFromInventory(character.inventory, potions)
  return {
    character: {
      ...character,
      level: progress.level,
      exp: progress.exp,
      gold: character.gold + gold,
      sp: character.sp + sp,
      stats: { kills: character.stats.kills + kills, deaths: character.stats.deaths + deaths },
      inventory: addToInventory(inventory, drops),
    },
    kills,
    exp,
    gold,
    sp,
    levelsGained: progress.levelsGained,
    drops,
    potionsUsed: taken,
  }
}
