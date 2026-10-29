/**
 * Class skills: learning (character level, SP, prerequisites — 1:1 from t_skilllevel) and what a skill
 * does in IdleLC's one-on-one auto-combat. The effect mapping from t_magic type/subtype is our reading
 * of the data (names and descriptions) until the LC server code is available; see docs/balance.md.
 * Pure — the server will run the same code.
 */
import { getSkill, skillsForClass } from '../data/skills.ts'
import type {
  ClassId,
  CombatStats,
  SkillDef,
  SkillEffectDef,
  SkillLevelDef,
} from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'

/** 10 000 units = 1 skill point, as the LC server stores them (t_npc.a_skill_point). */
export const SP_UNIT = 10_000

/** A learned skill on a character. */
export interface LearnedSkill {
  level: number
  /** Used automatically in combat. */
  auto: boolean
}

export type StatKey =
  | 'attack'
  | 'defense'
  | 'maxHp'
  | 'maxMp'
  | 'hit'
  | 'dodge'
  | 'critChance'
  | 'critMultiplier'
  | 'attackSpeed'
  | 'castTime'
  | 'hpRegen'
  | 'mpRegen'

export interface StatEffect {
  kind: 'stat'
  stat: StatKey
  value: number
  percent: boolean
}

export type SkillEffect =
  | { kind: 'damage'; percent: number }
  | StatEffect
  /** `chance` 0..1 that the stun lands. */
  | { kind: 'stun'; chance: number }
  | { kind: 'poison'; perSecond: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'mana'; amount: number }
  /** HP or MP restored every second while the effect lasts (like healing and mana potions). */
  | { kind: 'regen'; resource: 'hp' | 'mp'; perSecond: number }

/** t_magic.a_type 0 (stat change): subtype → the stat it changes. */
const STAT_SUBTYPES: Record<number, StatKey> = {
  0: 'attack',
  1: 'defense',
  2: 'attack', // magic attack — IdleLC has one attack stat
  3: 'defense', // magic defense — and one defense stat
  4: 'hit',
  5: 'dodge',
  6: 'critChance',
  7: 'attackSpeed',
  8: 'castTime',
  10: 'hpRegen',
  11: 'mpRegen',
  12: 'maxHp',
  13: 'maxMp',
  14: 'critMultiplier',
  22: 'attack', // amplification
  23: 'attackSpeed', // haste
}

/** What one t_magic effect does in IdleLC, or null when it has no counterpart here (yet). */
export function interpretEffect(e: SkillEffectDef): SkillEffect | null {
  switch (e.type) {
    case 0: {
      const stat = STAT_SUBTYPES[e.subtype]
      return stat ? { kind: 'stat', stat, value: e.power, percent: e.damageType === 2 } : null
    }
    case 2: // states
      if (e.subtype === 7 || e.subtype === 5 || e.subtype === 2) {
        return { kind: 'stun', chance: e.power > 0 ? Math.min(1, e.power / 100) : 1 }
      }
      if (e.subtype === 16)
        return { kind: 'stat', stat: 'attackSpeed', value: e.power, percent: true }
      // 9 / 10: HP / MP per second — the states of the healing and mana potions
      if (e.subtype === 9) return { kind: 'regen', resource: 'hp', perSecond: e.power }
      if (e.subtype === 10) return { kind: 'regen', resource: 'mp', perSecond: e.power }
      if (e.subtype === 0) return { kind: 'poison', perSecond: e.power }
      return null
    case 3:
      return { kind: 'damage', percent: e.power }
    case 4:
      if (e.subtype === 0) return { kind: 'heal', amount: e.power }
      if (e.subtype === 1) return { kind: 'mana', amount: e.power }
      return null
    default:
      return null
  }
}

/** attack: damages the monster; debuff: weakens it; buff / heal: on the hero; passive: always on. */
export type SkillKind = 'attack' | 'debuff' | 'buff' | 'heal' | 'passive'

/** A skill at one level, ready for combat. */
export interface SkillRank {
  id: number
  name: string
  level: number
  kind: SkillKind
  /** Its effects land on the monster (attacks and debuffs). */
  offensive: boolean
  mpCost: number
  hpCost: number
  /** Wind-up before the skill fires, in seconds (t_skill.a_readyTime; 0 = at once). */
  castTime: number
  /** Animation after it fired (t_skill.a_fireTime), in seconds. */
  fireTime: number
  /** Seconds before it can be used again (counted from the start of the cast). */
  cooldown: number
  /** Seconds the stat changes, stun or poison last. */
  duration: number
  effects: SkillEffect[]
  auto: boolean
}

export function rankOf(skill: SkillDef, level: number): SkillLevelDef | undefined {
  return skill.levels.find((l) => l.level === level)
}

/** Interprets a skill at a level (t_skill timings are in 1/10 s). */
export function skillRank(skill: SkillDef, level: number, auto = true): SkillRank {
  const rank = rankOf(skill, level) ?? skill.levels[0]!
  const effects = rank.effects.map(interpretEffect).filter((e): e is SkillEffect => e !== null)
  const hurts = effects.some((e) => e.kind === 'damage' || e.kind === 'stun' || e.kind === 'poison')
  const stats = effects.filter((e) => e.kind === 'stat')
  const curses =
    !hurts && stats.length > 0 && stats.every((e) => e.value < 0) && skill.targetType === 2
  const offensive = skill.type !== 3 && (hurts || curses)
  const kind: SkillKind =
    skill.type === 3
      ? 'passive'
      : effects.some((e) => e.kind === 'damage')
        ? 'attack'
        : offensive
          ? 'debuff'
          : effects.some((e) => e.kind === 'heal' || e.kind === 'mana')
            ? 'heal'
            : 'buff'
  const castTime = skill.readyTime / 10
  return {
    id: skill.id,
    name: skill.name,
    level: rank.level,
    kind,
    offensive,
    mpCost: rank.mp,
    hpCost: rank.hp,
    castTime,
    fireTime: skill.fireTime / 10,
    cooldown: Math.max(castTime, skill.reuseTime / 10),
    duration: rank.duration / 10,
    effects,
    auto,
  }
}

/**
 * False when none of the skill's effects exists in IdleLC yet (summons, movement speed,
 * resurrection…) — or when it builds on such a skill.
 */
export function isAvailable(skill: SkillDef, seen = new Set<number>()): boolean {
  if (seen.has(skill.id)) return true
  seen.add(skill.id)
  const works = skill.levels.some((l) => l.effects.some((e) => interpretEffect(e) !== null))
  return (
    works &&
    skill.levels.every((l) =>
      l.requires.every((r) => {
        const required = getSkill(r.skill)
        return !required || isAvailable(required, seen)
      }),
    )
  )
}

/** Rank 1 of the class's free level-1 skills: every new character knows them. */
export function starterSkills(classId: ClassId): Record<string, LearnedSkill> {
  const learned: Record<string, LearnedSkill> = {}
  for (const skill of skillsForClass(classId)) {
    const first = skill.levels[0]
    if (
      first?.level === 1 &&
      first.learnLevel <= 1 &&
      first.learnSp === 0 &&
      first.requires.length === 0 &&
      isAvailable(skill)
    ) {
      learned[skill.id] = { level: 1, auto: true }
    }
  }
  return learned
}

export type LearnError =
  | 'unknown-skill'
  | 'wrong-class'
  | 'not-available'
  | 'max-level'
  | 'level-too-low'
  | 'not-enough-sp'
  | 'missing-skill'

/** The rank the character would learn next, or undefined at the maximum. */
export function nextRank(
  character: Pick<CharacterData, 'skills'>,
  skill: SkillDef,
): SkillLevelDef | undefined {
  const current = character.skills[skill.id]?.level ?? 0
  return skill.levels.find((l) => l.level === current + 1)
}

/** Prerequisites of a rank the character does not meet yet. */
export function missingSkills(
  character: Pick<CharacterData, 'skills'>,
  rank: SkillLevelDef,
): { skill: SkillDef; level: number }[] {
  return rank.requires.flatMap((r) => {
    const skill = getSkill(r.skill)
    return skill && (character.skills[r.skill]?.level ?? 0) < r.level
      ? [{ skill, level: r.level }]
      : []
  })
}

export function checkLearn(character: CharacterData, skillId: number): LearnError | null {
  const skill = getSkill(skillId)
  if (!skill) return 'unknown-skill'
  if (skill.classId !== character.classId) return 'wrong-class'
  if (!isAvailable(skill)) return 'not-available'
  const next = nextRank(character, skill)
  if (!next) return 'max-level'
  if (character.level < next.learnLevel) return 'level-too-low'
  if (missingSkills(character, next).length > 0) return 'missing-skill'
  if (character.sp < next.learnSp * SP_UNIT) return 'not-enough-sp'
  return null
}

/** Learns the next rank, paying its SP. Throws a GameError when it can't. */
export function applyLearn(character: CharacterData, skillId: number): CharacterData {
  const error = checkLearn(character, skillId)
  if (error) throw new GameError(error, `skill ${skillId}`)
  const skill = getSkill(skillId)!
  const next = nextRank(character, skill)!
  const skills = {
    ...character.skills,
    [skillId]: { level: next.level, auto: character.skills[skillId]?.auto ?? true },
  }
  // a new active skill goes onto the bar while there is room
  const joins =
    !character.skills[skillId] &&
    skillRank(skill, 1).kind !== 'passive' &&
    character.skillBar.length < SKILL_BAR_SIZE
  return {
    ...character,
    sp: character.sp - next.learnSp * SP_UNIT,
    skills,
    skillBar: joins
      ? arrangeBar(character.classId, [...character.skillBar, skillId])
      : character.skillBar,
  }
}

/** Skills used in fights sit on the bar; it has room for this many. */
export const SKILL_BAR_SIZE = 7

/** Bar order: attacks and curses on the left, buffs and recovery on the right; else as given. */
export function arrangeBar(classId: ClassId, ids: readonly number[]): number[] {
  const side = (id: number) => {
    const skill = getSkill(id)
    const kind = skill && skill.classId === classId ? skillRank(skill, 1).kind : 'attack'
    return kind === 'buff' || kind === 'heal' ? 1 : 0
  }
  return ids
    .map((id, i) => ({ id, i, side: side(id) }))
    .sort((a, b) => a.side - b.side || a.i - b.i)
    .map((e) => e.id)
}

/** The learned active skills that fit on a fresh bar (in learning order), arranged. */
export function defaultBar(
  classId: ClassId,
  learned: Readonly<Record<string, LearnedSkill>>,
): number[] {
  const active = learnedRanks(classId, learned)
    .filter((r) => r.kind !== 'passive')
    .map((r) => r.id)
  // the first skills learned, then attacks left and buffs right
  return arrangeBar(classId, active.slice(0, SKILL_BAR_SIZE))
}

/** Puts a new set of skills on the bar (learned active skills, at most SKILL_BAR_SIZE). */
export function applyBar(character: CharacterData, ids: readonly number[]): CharacterData {
  const unique = [...new Set(ids)]
  if (unique.length > SKILL_BAR_SIZE) throw new GameError('bar-full', `${unique.length}`)
  for (const id of unique) {
    const skill = getSkill(id)
    if (!skill || !character.skills[id] || skill.classId !== character.classId) {
      throw new GameError('not-learned', `skill ${id}`)
    }
    if (skillRank(skill, 1).kind === 'passive') throw new GameError('passive-skill', `skill ${id}`)
  }
  return { ...character, skillBar: arrangeBar(character.classId, unique) }
}

/** Turns automatic use of a learned skill on or off. */
export function applyAuto(character: CharacterData, skillId: number, auto: boolean): CharacterData {
  const learned = character.skills[skillId]
  if (!learned) throw new GameError('not-learned', `skill ${skillId}`)
  return { ...character, skills: { ...character.skills, [skillId]: { ...learned, auto } } }
}

/** The learned skills of a character that work in IdleLC, interpreted (passive and active). */
export function learnedRanks(
  classId: ClassId,
  learned: Readonly<Record<string, LearnedSkill>>,
): SkillRank[] {
  return skillsForClass(classId)
    .filter((s) => learned[s.id] && isAvailable(s))
    .map((s) => skillRank(s, learned[s.id]!.level, learned[s.id]!.auto))
}

/** Combat stats after a set of stat changes (flat values or percent). */
export function applyStats(stats: CombatStats, effects: readonly StatEffect[]): CombatStats {
  if (effects.length === 0) return stats
  const s = { ...stats }
  for (const { stat, value, percent } of effects) {
    switch (stat) {
      case 'attack':
      case 'defense':
      case 'maxHp':
      case 'maxMp':
      case 'hpRegen':
      case 'mpRegen': {
        const base = s[stat] ?? 0
        s[stat] = percent ? base * (1 + value / 100) : base + value
        break
      }
      case 'hit':
      case 'dodge':
        // percentage points of hit chance; flat powers are in 1/10 %
        s[stat] = (s[stat] ?? 0) + (percent ? value : value / 10)
        break
      case 'critChance':
        s.critChance += percent ? value / 100 : value / 1000
        break
      case 'critMultiplier':
        s.critMultiplier += value / 100
        break
      case 'attackSpeed':
        // percent: +10 = 10% faster attacks; flat values are in 1/10 s
        s.attackInterval = percent
          ? s.attackInterval / Math.max(0.2, 1 + value / 100)
          : s.attackInterval - value / 10
        break
      case 'castTime':
        s.castTime = (s.castTime ?? 0) + value / 10
        break
    }
  }
  s.attack = Math.max(1, s.attack)
  s.defense = Math.max(0, s.defense)
  s.maxHp = Math.max(1, Math.round(s.maxHp))
  if (s.maxMp !== undefined) s.maxMp = Math.max(0, Math.round(s.maxMp))
  s.attackInterval = Math.max(0.3, s.attackInterval)
  s.critChance = Math.min(1, Math.max(0, s.critChance))
  return s
}

/** Stat changes from the passive skills (they always apply). */
export function passiveEffects(ranks: readonly SkillRank[]): StatEffect[] {
  return ranks
    .filter((r) => r.kind === 'passive')
    .flatMap((r) => r.effects)
    .filter((e): e is StatEffect => e.kind === 'stat')
}
