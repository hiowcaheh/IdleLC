/**
 * Combat rewards. The browser only animates the fight and reports its outcome; the service
 * (later: a Supabase function) checks the report against the clock and pays out. Pure.
 */
import { boostEffects, reportedBoosts, type OwnedBoost } from './boosts.ts'
import { deathLoss } from './death.ts'
import { getItem } from '../data/items.ts'
import { TOKEN_DROP_CHANCE, TOKEN_ID } from '../data/lacaball.ts'
import type { MonsterDef } from '../data/types.ts'
import { clamp } from './balance.ts'
import type { CharacterData } from './character.ts'
import { TIMINGS, effectRewardMultipliers, type EncounterClock } from './combat.ts'
import { monsterDrops, stowDrops, takeFromInventory, type ItemStack } from './loot.ts'
import { applyPlayTime, optionValue, type OptionGain } from './options.ts'
import type { Hero } from './fighters.ts'
import { activeTitleId, pruneTitles, titleOptions } from './titles.ts'
import { gainExp } from './progression.ts'
import { rollInt, type Rng } from './rng.ts'
import { levelRewardRates } from './pveLevels.ts'
import { recordKills } from './spots.ts'

/** Shortest possible time between two kills (victory pause + respawn), in game seconds. */
export const MIN_KILL_CYCLE = TIMINGS.victory + TIMINGS.spawning

/** Extra kills tolerated in one report (timing jitter, batched reports). */
export const KILL_BURST = 2

/**
 * Longest time one report may cover, in seconds. Fights are reported every few seconds; time away
 * from the game is paid by the AFK simulation instead, so an old report window grants nothing extra.
 */
export const MAX_REPORT_WINDOW = 600

/**
 * Longest stretch between two reports counted as play time (options from play, logic/options.ts):
 * a fight ends every few seconds, so a longer gap means the game was closed or in the background.
 */
export const MAX_PLAY_GAP = 120

export interface CombatReport {
  monsterId: string
  kills: number
  deaths: number
  /** Potions drunk in the fights (taken from the inventory, at most what it holds). */
  potions?: ItemStack[]
  /** Boost potions working on the hero now, to keep (logic/boosts.ts). */
  boosts?: OwnedBoost[]
  /** A World Boss report belongs to exactly one consumed summon. */
  encounterId?: string
  worldBossTime?: EncounterClock
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
  /** Options worn pieces gained from the play time of the report. */
  optionsGained: OptionGain[]
  /** EXP and SP (1/10 000) the report's deaths took (death.ts). */
  lost: { exp: number; sp: number }
}

/** Extra rewards in % on top of the database's: EXP, skill points, gold and drop chances. */
export interface RewardBonuses {
  exp: number
  sp: number
  gold: number
  drop: number
}

/** EXP/SP options from worn equipment and the still-valid title share one sum. */
export function rewardBonuses(character: Hero, now = Date.now()): RewardBonuses {
  const options = [
    ...Object.values(character.equipment ?? {}).flatMap((piece) => piece?.options ?? []),
    ...titleOptions(activeTitleId(character, now)),
  ]
  const bonuses = { exp: 0, sp: 0, gold: 0, drop: 0 }
  for (const option of options) {
    if (option.type === 82) bonuses.exp += optionValue(option)
    if (option.type === 83) bonuses.sp += optionValue(option)
  }
  return bonuses
}

/** Most kills a report may hold after `elapsedSeconds` of real time at a given game speed. */
export function maxKills(elapsedSeconds: number, timeScale = 1): number {
  const window = Math.min(Math.max(0, elapsedSeconds), MAX_REPORT_WINDOW)
  return Math.floor((window * Math.max(1, timeScale)) / MIN_KILL_CYCLE) + KILL_BURST
}

const withBonus = (value: number, percent: number) =>
  Math.max(0, value + Math.trunc((value * percent) / 100))

/** C++ integer division truncates negative jitter toward zero, before the minimum and options. */
function variedReward(base: number, percent: number, jitter: number, bonus: number) {
  const value = Math.trunc((base * percent) / 100)
  return withBonus(Math.max(1, value + Math.trunc((value * jitter) / 100)), bonus)
}

/** Expected reward for estimates; real payouts use independent rolls for every kill. */
export function killReward(
  monster: MonsterDef,
  hero?: Hero,
  now = Date.now(),
): { exp: number; gold: number; sp: number } {
  const bonuses = hero ? rewardBonuses(hero, now) : { exp: 0, sp: 0 }
  const rates = levelRewardRates(hero?.level ?? monster.level, monster.level)
  const mean = (base: number, percent: number, bonus: number) =>
    Array.from({ length: 21 }, (_, i) => variedReward(base, percent, i - 10, bonus)).reduce(
      (sum, value) => sum + value,
      0,
    ) / 21
  const goldMean =
    Array.from({ length: 101 }, (_, i) => Math.trunc((monster.gold * (i + 50)) / 100)).reduce(
      (sum, value) => sum + value,
      0,
    ) / 101
  return {
    exp: mean(monster.exp, rates.exp, bonuses.exp),
    gold: goldMean * rates.goldChance,
    sp: mean(monster.sp ?? 0, rates.sp, bonuses.sp),
  }
}

function rolledReward(monster: MonsterDef, level: number, bonuses: RewardBonuses, rng: Rng) {
  const rates = levelRewardRates(level, monster.level)
  return {
    exp: variedReward(monster.exp, rates.exp, rollInt(rng, -10, 10), bonuses.exp),
    sp: variedReward(monster.sp ?? 0, rates.sp, rollInt(rng, -10, 10), bonuses.sp),
    gold:
      rollInt(rng, 1, 10000) <= rates.goldChance * 10000
        ? Math.trunc((monster.gold * rollInt(rng, 50, 150)) / 100)
        : 0,
  }
}

/** Battle_DivisionExpSP.cpp:143–230; Battle_NPCDropItem.cpp:495–528, solo and neutral events. */
export function rollKillReward(monster: MonsterDef, hero: Hero, rng: Rng, now = Date.now()) {
  return rolledReward(monster, hero.level, rewardBonuses(hero, now), rng)
}

/** Share per-kill rolls and level-up boundaries between watched combat and expeditions. */
export function rewardKills(
  hero: Hero & { exp: number },
  monster: MonsterDef,
  kills: number,
  rng: Rng,
  now = Date.now(),
  multipliers = { exp: 1, sp: 1, gold: 1, drop: 1 },
  encounterDrops?: (monster: MonsterDef, rng: Rng) => ItemStack[],
) {
  const bonuses = rewardBonuses(hero, now)
  const items = new Map<number, number>()
  let level = hero.level,
    remainingExp = hero.exp,
    exp = 0,
    gold = 0,
    sp = 0
  for (let k = 0; k < kills; k++) {
    // Neither level penalties nor reward buffs can affect an encounter's item rolls.
    const fixedDrops = encounterDrops?.(monster, rng)
    const base = rolledReward(monster, level, bonuses, rng)
    const reward = {
      exp: Math.trunc(base.exp * multipliers.exp),
      sp: Math.trunc(base.sp * multipliers.sp),
      gold: Math.trunc(base.gold * multipliers.gold),
    }
    exp += reward.exp
    gold += reward.gold
    sp += reward.sp
    if (fixedDrops || levelRewardRates(level, monster.level).drops) {
      for (const item of fixedDrops ?? monsterDrops(monster, 1, rng, multipliers.drop))
        items.set(item.itemId, (items.get(item.itemId) ?? 0) + item.count)
    }
    // Owner: every monster has a fixed 1% Token roll, independent of level and bonuses.
    if (rollInt(rng, 1, 10000) <= TOKEN_DROP_CHANCE * 10000)
      items.set(TOKEN_ID, (items.get(TOKEN_ID) ?? 0) + 1)
    // A level gained by this kill changes the penalties of the next kill, even in one report.
    const progress = gainExp(level, remainingExp, reward.exp)
    level = progress.level
    remainingExp = progress.exp
  }
  return {
    exp,
    gold,
    sp,
    level,
    remainingExp,
    levelsGained: level - hero.level,
    drops: [...items]
      .map(([itemId, count]) => ({ itemId, count }))
      .sort((a, b) => a.itemId - b.itemId),
  }
}

/**
 * Pays out a combat report, accepting at most `allowedKills` kills; rolls the drops, takes the
 * potions drunk out of the inventory and adds `playSeconds` of play time (options on worn gear).
 */
export function applyCombatReport(
  character: CharacterData,
  monster: MonsterDef,
  report: CombatReport,
  allowedKills: number,
  rng: Rng,
  playSeconds = 0,
  now = Date.now(),
  encounterDrops?: (monster: MonsterDef, rng: Rng) => ItemStack[],
): CombatResult {
  character = pruneTitles(character, now)
  const kills = clamp(Math.floor(report.kills), 0, Math.max(0, allowedKills))
  const deaths = Math.max(0, Math.floor(report.deaths))
  const potions = (report.potions ?? []).filter((p) => getItem(p.itemId).potion)
  const { inventory, taken } = takeFromInventory(character.inventory, potions)
  const working =
    report.boosts === undefined
      ? character.boosts
      : reportedBoosts(
          character.boosts,
          taken.map((p) => p.itemId),
          report.boosts,
          now,
        )
  // EXP / SP potions working in the fight (Blessed Iris, skill pills)
  const multipliers = effectRewardMultipliers(boostEffects(working, now))
  const reward = rewardKills(character, monster, kills, rng, now, multipliers, encounterDrops)
  const { exp, gold, sp, drops } = reward
  const played = applyPlayTime(character, playSeconds, rng)
  const bag = stowDrops({ inventory, gear: played.character.gear }, drops, rng)
  // each death of the report after its kills (Battle_ProcDead_PC.cpp)
  let left = { exp: reward.remainingExp, sp: character.sp + sp }
  const lost = { exp: 0, sp: 0 }
  for (let i = 0; i < deaths; i++) {
    const loss = deathLoss(reward.level, left.exp, left.sp)
    if (loss.exp === 0 && loss.sp === 0) break
    left = { exp: left.exp - loss.exp, sp: left.sp - loss.sp }
    lost.exp += loss.exp
    lost.sp += loss.sp
  }
  const boosts = report.boosts === undefined ? {} : { boosts: working ?? [] }
  return {
    character: {
      ...played.character,
      ...bag,
      ...boosts,
      level: reward.level,
      exp: left.exp,
      gold: character.gold + gold,
      sp: left.sp,
      ...recordKills(character, character.location, kills, deaths),
    },
    kills,
    exp,
    gold,
    sp,
    levelsGained: reward.levelsGained,
    drops,
    potionsUsed: taken,
    optionsGained: played.gained,
    lost,
  }
}
