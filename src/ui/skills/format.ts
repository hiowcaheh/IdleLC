import { WEAPON_KINDS } from '../../game/data/items.ts'
import type { SkillDef, SkillLevelDef } from '../../game/data/types.ts'
import { REGEN_TICK_SECONDS } from '../../game/logic/balance.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import type { ActiveEffect } from '../../game/logic/combat.ts'
import {
  SP_UNIT,
  checkLearn,
  missingSkills,
  skillRank,
  type SkillEffect,
  type SkillKind,
  type SkillRank,
  type StatKey,
} from '../../game/logic/skills.ts'

/** What a skill needs worn ("sword or dual swords, shield"), or null when it needs nothing. */
export function needsText(skill: SkillDef): string | null {
  const needs = skill.type === 3 ? skill.passiveNeeds : skill.needs
  if (!needs) return null
  const kinds = needs.weapons.map((k) => WEAPON_KINDS[k] ?? `weapon ${k}`)
  const parts = [
    kinds.length ? kinds.join(' or ') : needs.weapon ? 'a weapon' : null,
    needs.shield ? 'a shield' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Skill points with one decimal (they come in tenths of a point per kill). */
export function formatSp(units: number): string {
  const sp = Math.floor(units / (SP_UNIT / 10)) / 10
  return sp.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export const KIND_LABELS: Record<SkillKind, string> = {
  attack: 'Attack',
  debuff: 'Curse',
  buff: 'Buff',
  heal: 'Recovery',
  passive: 'Passive',
}

/** 2.5 → "2.5 s", 300 → "5 min". */
export function seconds(value: number): string {
  if (value >= 120 && value % 60 === 0) return `${value / 60} min`
  return `${Number(value.toFixed(1))} s`
}

const STAT_LABELS: Record<StatKey, string> = {
  attack: 'Attack',
  defense: 'Defense',
  maxHp: 'Max HP',
  maxMp: 'Max MP',
  hit: 'Hit Rate',
  dodge: 'Evasion',
  critChance: 'Critical chance',
  critMultiplier: 'Critical damage',
  attackSpeed: 'Attack speed',
  castTime: 'Cast time',
  hpRegen: 'HP recovery',
  mpRegen: 'MP recovery',
  cooldownReduction: 'Skill cooldown',
  mpCostReduction: 'Skill MP cost',
  hpSteal: 'HP steal',
  mpSteal: 'MP steal',
  moveSpeed: 'Move speed',
}

const signed = (n: number, unit = '') =>
  `${n < 0 ? '−' : '+'}${Number(Math.abs(n).toFixed(1)).toLocaleString('en-US')}${unit}`

/** The stat change as the player reads it (same units as applyStats). */
function statValue(stat: StatKey, value: number, percent: boolean): string {
  if (percent) return signed(value, '%')
  switch (stat) {
    case 'hit':
    case 'dodge':
    case 'critChance':
      return signed(value / 10, '%')
    case 'critMultiplier':
      return signed(value, '%')
    case 'attackSpeed':
      return signed(value / 10, ' s')
    case 'castTime':
      return signed(value / 10, ' s')
    case 'hpRegen':
    case 'mpRegen':
      return `${signed(value)} / ${REGEN_TICK_SECONDS} s`
    default:
      return signed(value)
  }
}

/**
 * What an effect on a fighter does right now, row by row (["Attack", "+25"], ["HP per second", "+33"]);
 * `bad` marks what weakens the fighter (less defense, longer casting, poison, a stun).
 */
export function activeEffectRows(
  effect: ActiveEffect,
): { label: string; value: string; bad: boolean }[] {
  const rows = effect.stats.map((s) => ({
    label: STAT_LABELS[s.stat],
    value: statValue(s.stat, s.value, s.percent),
    // casting takes longer with a positive change; every other stat is worse when it drops
    bad: s.stat === 'castTime' ? s.value > 0 : s.value < 0,
  }))
  if (effect.hpPerSecond)
    rows.push({ label: 'HP per second', value: `+${effect.hpPerSecond}`, bad: false })
  if (effect.mpPerSecond)
    rows.push({ label: 'MP per second', value: `+${effect.mpPerSecond}`, bad: false })
  if (effect.poison > 0)
    rows.push({ label: 'Poison damage', value: `−${effect.poison}`, bad: true })
  if (effect.stun) rows.push({ label: 'Stunned', value: 'No attacks', bad: true })
  return rows
}

/** Which effect of a fighter: the skill's or the potion's. */
export const effectKey = (effect: ActiveEffect) =>
  effect.itemId === undefined ? `skill-${effect.skillId}` : `item-${effect.itemId}`

/** Time left on an effect: "35 s", "4 min 12 s". */
export function timeLeft(secondsLeft: number): string {
  const total = Math.max(0, Math.ceil(secondsLeft))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

export function describeEffect(effect: SkillEffect, rank: SkillRank): string {
  const lasting = rank.duration > 0 ? ` for ${seconds(rank.duration)}` : ''
  switch (effect.kind) {
    case 'damage':
      return `Hits for +${effect.percent}% damage`
    case 'stat': {
      const who = rank.offensive ? 'Enemy ' : ''
      const label = who ? STAT_LABELS[effect.stat].toLowerCase() : STAT_LABELS[effect.stat]
      return `${who}${label} ${statValue(effect.stat, effect.value, effect.percent)}${rank.kind === 'passive' ? '' : lasting}`
    }
    case 'stun':
      return effect.chance >= 1
        ? `Stuns${lasting}`
        : `${Math.round(effect.chance * 100)}% chance to stun${lasting}`
    case 'poison':
      return `Poison: ${effect.perSecond} damage per second${lasting}`
    case 'heal':
      return `Restores ${effect.amount} HP`
    case 'mana':
      return `Restores ${effect.amount} MP`
    case 'regen':
      return `Restores ${effect.perSecond} ${effect.resource === 'hp' ? 'HP' : 'MP'} per second${lasting}`
  }
}

/** Cost and timing line of a rank ("12 MP · instant · cooldown 3 s"). */
export function rankCosts(rank: SkillRank): string {
  if (rank.kind === 'passive') return 'Always active'
  const parts = [`${rank.mpCost} MP`]
  if (rank.hpCost > 0) parts.push(`${rank.hpCost} HP`)
  parts.push(
    rank.castTime > 0 ? `cast ${seconds(rank.castTime)}` : 'instant',
    `cooldown ${seconds(rank.cooldown)}`,
  )
  return parts.join(' · ')
}

export interface LearnState {
  /** The rank the next learn gives, if any. */
  next: SkillLevelDef | undefined
  nextRank: SkillRank | undefined
  canLearn: boolean
  /** Why it can't be learned now (shown under the button). */
  blocked: string | null
}

export function learnState(character: CharacterData, skill: SkillDef): LearnState {
  const current = character.skills[skill.id]?.level ?? 0
  const next = skill.levels.find((l) => l.level === current + 1)
  const nextRank = next ? skillRank(skill, next.level) : undefined
  if (character.expedition) {
    return { next, nextRank, canLearn: false, blocked: 'Not while on an expedition.' }
  }
  const error = checkLearn(character, skill.id)
  if (!error) return { next, nextRank, canLearn: true, blocked: null }
  let blocked: string
  switch (error) {
    case 'max-level':
      blocked = 'Mastered.'
      break
    case 'level-too-low':
      blocked = `Requires character level ${next!.learnLevel}.`
      break
    case 'missing-skill':
      blocked = `Learn ${missingSkills(character, next!)
        .map((m) => `${m.skill.name} Lv ${m.level}`)
        .join(', ')} first.`
      break
    case 'not-enough-sp':
      blocked = `Needs ${next!.learnSp} SP (you have ${formatSp(character.sp)}).`
      break
    case 'not-available':
      blocked = 'Not available in IdleLC yet.'
      break
    default:
      blocked = 'Cannot be learned.'
  }
  return { next, nextRank, canLearn: false, blocked }
}
