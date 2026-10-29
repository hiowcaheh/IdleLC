/**
 * Combat rewards. The browser only animates the fight and reports its outcome; the service
 * (later: a Supabase function) checks the report against the clock and pays out. Pure.
 */
import type { MonsterDef } from '../data/types.ts'
import { clamp } from './balance.ts'
import type { CharacterData } from './character.ts'
import { TIMINGS } from './combat.ts'
import { gainExp } from './progression.ts'

/** Shortest possible time between two kills (victory pause + respawn), in game seconds. */
export const MIN_KILL_CYCLE = TIMINGS.victory + TIMINGS.spawning

/** Extra kills tolerated in one report (timing jitter, batched reports). */
export const KILL_BURST = 2

export interface CombatReport {
  monsterId: string
  kills: number
  deaths: number
}

export interface CombatResult {
  character: CharacterData
  /** Kills that were paid out; the rest exceeded the rate limit. */
  kills: number
  exp: number
  gold: number
  levelsGained: number
}

/** Most kills a report may hold after `elapsedSeconds` of real time at a given game speed. */
export function maxKills(elapsedSeconds: number, timeScale = 1): number {
  return (
    Math.floor((Math.max(0, elapsedSeconds) * Math.max(1, timeScale)) / MIN_KILL_CYCLE) + KILL_BURST
  )
}

/**
 * Reward for one kill: t_npc.a_exp and a_prize 1:1. Level-difference rules and party bonuses
 * come with the LC server code.
 */
export function killReward(monster: MonsterDef): { exp: number; gold: number } {
  return { exp: monster.exp, gold: monster.gold }
}

/** Pays out a combat report, accepting at most `allowedKills` kills. */
export function applyCombatReport(
  character: CharacterData,
  monster: MonsterDef,
  report: CombatReport,
  allowedKills: number,
): CombatResult {
  const kills = clamp(Math.floor(report.kills), 0, Math.max(0, allowedKills))
  const deaths = Math.max(0, Math.floor(report.deaths))
  const reward = killReward(monster)
  const exp = reward.exp * kills
  const gold = reward.gold * kills
  const progress = gainExp(character.level, character.exp, exp)
  return {
    character: {
      ...character,
      level: progress.level,
      exp: progress.exp,
      gold: character.gold + gold,
      stats: { kills: character.stats.kills + kills, deaths: character.stats.deaths + deaths },
    },
    kills,
    exp,
    gold,
    levelsGained: progress.levelsGained,
  }
}
