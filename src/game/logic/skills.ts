/**
 * Class skills: learning (character level, SP, prerequisites — 1:1 from t_skilllevel) and what a skill
 * does in IdleLC's one-on-one auto-combat. Immediate HP/MP recovery follows the original server's
 * GameServer/Skill.cpp; other effect mappings remain IdleLC adaptations (docs/source-audit/skills.md).
 * Pure — the server will run the same code.
 */
import { getSkill, skillsForClass } from '../data/skills.ts'
import { lcData, lcSkillMotion } from '../data/lcSource.ts'
import type {
  ClassId,
  CombatStats,
  SkillDef,
  SkillEffectDef,
  SkillLevelDef,
  SkillNeeds,
} from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { applyClientStats, bindCombatChannels } from './clientStats.ts'

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
  | 'deadly'
  | 'attackSpeed'
  | 'castTime'
  | 'castSpeed'
  | 'reuseTime'
  | 'maxHp450'
  | 'blockChance'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'constitution'
  | 'hpRegen'
  | 'mpRegen'
  | 'cooldownReduction'
  | 'cooldownFree'
  | 'mpCostReduction'
  | 'hpSteal'
  | 'mpSteal'
  | 'moveSpeed'
  | 'magicAttack'
  | 'magicDefense'
  | 'magicHit'
  | 'magicEvasion'
  | 'runSpeed'
  | 'stunResistance'
  | 'stoneResistance'
  | 'silenceResistance'
  | 'attackRange'

export interface StatEffect {
  kind: 'stat'
  stat: StatKey
  value: number
  percent: boolean
  /** Source melee/ranged assist subtypes only apply to the matching weapon channel. */
  channel?: 'melee' | 'ranged'
}

export type SkillEffect =
  | { kind: 'damage'; percent: number; damageType?: number; attackType?: number }
  | StatEffect
  /** `chance` 0..1 that the stun lands. */
  | { kind: 'stun'; chance?: number; resistance?: 'stone' }
  | { kind: 'state'; state: 'stone' | 'silence' | 'confusion' | 'hold'; chance?: number }
  | {
      kind: 'poison'
      perSecond: number
      dotKind?: 'poison' | 'blood'
      percent?: boolean
      chance?: number
      requiresHitrate?: true
    }
  | { kind: 'mpChange'; power: number; percent: boolean }
  | { kind: 'cure'; state: 'poison' }
  /** Immediate recovery: a flat amount, or a percent of the maximum resource. */
  | { kind: 'heal'; amount: number; percent?: true }
  | { kind: 'mana'; amount: number; percent?: true }
  /** HP or MP restored every second while the effect lasts (like healing and mana potions). */
  | { kind: 'regen'; resource: 'hp' | 'mp'; perSecond: number }
  /** MST_OTHER_REFLEX: `chance` 0..1 to send back a flat amount or a percent of a hit taken. */
  | { kind: 'reflect'; chance: number; power: number; percent: boolean }
  /** MST_OTHER_SKILLCANCEL: `chance` 0..1 to cancel the skill the target is still readying. */
  | { kind: 'interrupt'; chance: number }
  /**
   * MST_OTHER_TOUNT: hate towards the caster. A monster here fights the hero alone, so it changes
   * nothing; the skill's other effects still land.
   */
  | { kind: 'taunt'; power: number }
  /** MST_OTHER_SUMMON: calls an elemental (0 fire, 1 wind, 2 earth, 3 water) to fight alongside. */
  | { kind: 'summon'; element: 0 | 1 | 2 | 3 }

/** t_magic.a_type 0 (stat change): subtype → the stat it changes. */
const STAT_SUBTYPES: Record<number, StatKey> = {
  0: 'attack',
  1: 'defense',
  2: 'magicAttack',
  3: 'magicDefense',
  4: 'hit',
  5: 'dodge',
  6: 'critChance',
  7: 'attackSpeed',
  8: 'reuseTime',
  9: 'runSpeed',
  10: 'hpRegen',
  11: 'mpRegen',
  12: 'maxHp',
  13: 'maxMp',
  14: 'deadly',
  15: 'magicHit',
  16: 'magicEvasion',
  // MST_STAT_ATTACKDIST: metres added to m_attackRange (Character.cpp:459–460)
  17: 'attackRange',
  18: 'attack',
  19: 'attack',
  22: 'maxHp450',
  23: 'castSpeed',
  // MST_STAT_SKILLCOOLTIME: m_skillCooltime, the same reuse formula as "Decrease skill delay"
  37: 'cooldownReduction',
}

/** What one t_magic effect does in IdleLC, or null when it has no counterpart here (yet). */
export function interpretEffect(e: SkillEffectDef): SkillEffect | null {
  switch (e.type) {
    case 0: {
      const stat = STAT_SUBTYPES[e.subtype]
      return stat
        ? {
            kind: 'stat',
            stat,
            value: e.power,
            percent: e.damageType === 2,
            ...(e.subtype === 18
              ? { channel: 'melee' as const }
              : e.subtype === 19
                ? { channel: 'ranged' as const }
                : {}),
          }
        : null
    }
    case 2: // states
      if (e.subtype === 7)
        return { kind: 'stun', chance: e.hitrate === undefined ? undefined : e.hitrate / 10000 }
      if ([1, 2, 3, 4].includes(e.subtype))
        return {
          kind: 'state',
          state: ({ 1: 'hold', 2: 'confusion', 3: 'stone', 4: 'silence' } as const)[
            e.subtype as 1 | 2 | 3 | 4
          ],
          chance: e.hitrate === undefined ? undefined : e.hitrate / 10000,
        }
      if (e.subtype === 16)
        return { kind: 'stat', stat: 'attackSpeed', value: e.power, percent: true }
      // 9 / 10: HP / MP per second — the states of the healing and mana potions
      if (e.subtype === 9) return { kind: 'regen', resource: 'hp', perSecond: e.power }
      if (e.subtype === 10) return { kind: 'regen', resource: 'mp', perSecond: e.power }
      if (e.subtype === 0 || e.subtype === 5)
        return {
          kind: 'poison',
          perSecond: e.power,
          dotKind: e.subtype === 5 ? 'blood' : 'poison',
          percent: e.damageType === 2,
          chance: e.hitrate === undefined ? undefined : e.hitrate / 10000,
          requiresHitrate: true,
        }
      if (e.subtype === 13) return { kind: 'mpChange', power: e.power, percent: e.damageType === 2 }
      return null
    case 3:
      return { kind: 'damage', percent: e.power, damageType: e.damageType, attackType: e.subtype }
    case 5:
      return e.subtype === 0 ? { kind: 'cure', state: 'poison' } : null
    case 6:
      if (e.subtype === 1 && e.hitrate !== undefined)
        return { kind: 'interrupt', chance: e.hitrate / 10000 }
      if (e.subtype === 8) return { kind: 'taunt', power: e.power }
      if (e.subtype === 9 && [0, 1, 2, 3].includes(e.power))
        return { kind: 'summon', element: e.power as 0 | 1 | 2 | 3 }
      // MT_OTHER / MST_OTHER_REFLEX: APPVAL(hcReflex) and the hit rate as its chance (Character.cpp:1363)
      if (e.subtype === 4 && e.hitrate !== undefined && (e.damageType === 1 || e.damageType === 2))
        return {
          kind: 'reflect',
          chance: e.hitrate / 10000,
          power: e.power,
          percent: e.damageType === 2,
        }
      return null
    case 4:
      // GameServer/Skill.cpp: MT_RECOVER accepts ONLYPOWER (0) and RATE (2), not ADDITION (1).
      if (e.damageType !== 0 && e.damageType !== 2) return null
      if (e.subtype === 0 || e.subtype === 1) {
        return {
          kind: e.subtype === 0 ? 'heal' : 'mana',
          amount: e.power,
          ...(e.damageType === 2 ? { percent: true as const } : {}),
        }
      }
      return null
    default:
      return null
  }
}

/** attack: damages the monster; debuff: weakens it; buff / heal: on the hero; passive: always on. */
export type SkillKind = 'attack' | 'debuff' | 'buff' | 'heal' | 'passive'

/** A skill at one level, ready for combat. */
/** Skill.h SF_NOTHELP: a harmful skill. */
const SF_NOTHELP = 1 << 2
/** Skill.h SF_NOT_BOSS. */
const SF_NOT_BOSS = 1 << 15

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
  /** SF_GUILD / SCT_NO_COOL_TIME skills bypass ordinary cooldown adjustments. */
  fixedCooldown?: boolean
  attackType?: 'melee' | 'ranged' | 'magic'
  /** Source skill reach; self areas use appRange, target skills their weapon's fireRange. */
  range?: number
  /** NPC source skill slot and chance out of 10000 (MobActivity.cpp:1736). */
  npcSlot?: number
  npcProbability?: number
  /** Seconds the stat changes, stun or poison last. */
  duration: number
  /**
   * t_skill.a_flag is exactly SF_NOTHELP: option 101 shortens it on the target
   * (CAssistList::Add, Assist.cpp:103–109).
   */
  reducibleDebuff?: boolean
  /** Skill.h SF_NOT_BOSS: it cannot be used on a boss. */
  notBoss?: boolean
  /** Its t_magic records and levels (CAssistList::CanApply / DelDuplicate). */
  magics?: readonly { magic: number; level: number }[]
  /**
   * The hero's release clip (lc-skill-motion.json): its length and the moment its blow lands, in
   * seconds before the cast speed. The client plays it to the end before the hero acts again.
   */
  motion?: { fire: number; impact?: number }
  effects: SkillEffect[]
  auto: boolean
}

function magicsOfRank(rank: SkillLevelDef) {
  const magics = rank.effects.flatMap((e) =>
    e.magic !== undefined && e.magicLevel !== undefined
      ? [{ magic: e.magic, level: e.magicLevel }]
      : [],
  )
  return magics.length ? { magics } : {}
}

export function rankOf(skill: Pick<SkillDef, 'levels'>, level: number): SkillLevelDef | undefined {
  return skill.levels.find((l) => l.level === level)
}

/** Interprets a skill at a level (t_skill timings are in 1/10 s). */
export function skillRank(
  skill: Omit<SkillDef, 'classId'> & Partial<Pick<SkillDef, 'classId'>>,
  level: number,
  auto = true,
): SkillRank {
  const rank = rankOf(skill, level) ?? skill.levels[0]!
  const effects = rank.effects.map(interpretEffect).filter((e): e is SkillEffect => e !== null)
  const hurts = effects.some(
    (e) =>
      e.kind === 'damage' ||
      e.kind === 'stun' ||
      e.kind === 'poison' ||
      e.kind === 'state' ||
      e.kind === 'interrupt',
  )
  const stats = effects.filter((e) => e.kind === 'stat')
  const curses =
    !hurts &&
    stats.length > 0 &&
    stats.every((e) => e.value < 0) &&
    [2, 3, 6, 7, 11].includes(skill.targetType)
  const offensive = skill.type !== 3 && (hurts || curses)
  const kind: SkillKind =
    skill.type === 3
      ? 'passive'
      : effects.some((e) => e.kind === 'damage')
        ? 'attack'
        : offensive
          ? 'debuff'
          : effects.some((e) => e.kind === 'heal' || e.kind === 'mana' || e.kind === 'cure')
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
    cooldown: skill.reuseTime / 10,
    fixedCooldown:
      ((skill.flag ?? 0) & (1 << 9)) !== 0 || ((skill.applyState ?? 0) & (1 << 7)) !== 0,
    attackType: skill.type === 2 ? 'magic' : skill.type === 1 ? 'ranged' : 'melee',
    ...(skill.fireRange !== undefined || skill.appRange !== undefined
      ? {
          range: [1, 11].includes(skill.targetType)
            ? (skill.appRange ?? 0)
            : (skill.fireRange ?? 0),
        }
      : {}),
    duration: rank.duration / 10,
    ...(skill.flag === SF_NOTHELP ? { reducibleDebuff: true } : {}),
    ...(((skill.flag ?? 0) & SF_NOT_BOSS) !== 0 ? { notBoss: true } : {}),
    ...magicsOfRank(rank),
    ...(lcSkillMotion?.[skill.id] ? { motion: lcSkillMotion[skill.id] } : {}),
    effects,
    auto,
  }
}

/**
 * False when one of the skill's effects has no counterpart in IdleLC (resurrection, invisibility)
 * or when it builds on such a skill; `unavailableReason` says which.
 */
export function isAvailable(skill: SkillDef, seen = new Set<number>()): boolean {
  if (seen.has(skill.id)) return true
  seen.add(skill.id)
  // Spending SP must never silently buy only a fragment of a skill.
  const works =
    skill.levels.length > 0 &&
    skill.levels.every(
      (l) =>
        l.effects.length > 0 &&
        l.effects.every((raw) => {
          const effect = interpretEffect(raw)
          return (
            effect !== null &&
            !(
              (effect.kind === 'stun' || effect.kind === 'state' || effect.kind === 'poison') &&
              raw.hitrate === undefined
            ) &&
            !(
              effect.kind === 'stat' &&
              effect.stat === 'deadly' &&
              lcData?.monsters.some((m) => m.constitution === undefined)
            )
          )
        }),
    )
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

/** Why a skill that isAvailable rejects does not work in IdleLC, as the Skills window tells it. */
export function unavailableReason(skill: SkillDef): string {
  const raw = skill.levels.flatMap((l) => l.effects)
  // MST_CURE_REBIRTH on STT_PARTY_ONE: only a dead party member
  if (raw.some((e) => e.type === 5 && e.subtype === 6))
    return 'It brings back a fallen party member; IdleLC heroes hunt alone.'
  // MST_ASSIST_INVISIBLE: the hero's next attack ends it (Battle.cpp CancelInvisible)
  if (raw.some((e) => e.type === 2 && e.subtype === 15))
    return 'Invisibility ends with your next attack, so it changes nothing in a one-on-one fight yet.'
  const missing = skill.levels
    .flatMap((l) => l.requires)
    .map((r) => getSkill(r.skill))
    .find((required) => required && !isAvailable(required))
  if (missing) return `It builds on ${missing.name}, which does not work yet.`
  return 'This skill is not available yet.'
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
    .filter((s) => learned[s.id])
    .map((s) => skillRank(s, learned[s.id]!.level, learned[s.id]!.auto))
    .filter((r) =>
      r.effects.some((e) => {
        if (e.kind === 'stun' || e.kind === 'state') return e.chance !== undefined
        if (e.kind === 'poison') return !e.requiresHitrate || e.chance !== undefined
        return true
      }),
    )
}

/** What the hero holds: the weapon's kind (t_item.a_subtype_idx) or null, and a shield or not. */
export interface Wielded {
  weapon: number | null
  shield: boolean
}

/**
 * Whether the worn gear meets a skill's needs (t_skill): a weapon and a shield when it asks for
 * them, and a worn weapon of one of its kinds.
 */
export function meetsNeeds(needs: SkillNeeds | undefined, wielded: Wielded): boolean {
  if (!needs) return true
  if (needs.weapon && wielded.weapon === null) return false
  if (needs.shield && !wielded.shield) return false
  return (
    wielded.weapon === null || needs.weapons.length === 0 || needs.weapons.includes(wielded.weapon)
  )
}

/** Whether a skill works with the worn gear: actives by what using them needs, passives by theirs. */
export function worksWith(skill: SkillDef, wielded: Wielded): boolean {
  return meetsNeeds(skill.type === 3 ? skill.passiveNeeds : skill.needs, wielded)
}

/** The learned skills that work with the worn gear. */
export function wieldableRanks(ranks: readonly SkillRank[], wielded: Wielded): SkillRank[] {
  return ranks.filter((r) => {
    const skill = getSkill(r.id)
    return !skill || worksWith(skill, wielded)
  })
}

/** Combat stats after a set of stat changes (flat values or percent). */
export function applyStats(stats: CombatStats, effects: readonly StatEffect[]): CombatStats {
  if (effects.length === 0) return stats
  const s = { ...stats }
  const sum = (stat: StatKey, percent: boolean) =>
    effects.reduce(
      (total, effect) =>
        total + (effect.stat === stat && effect.percent === percent ? effect.value : 0),
      0,
    )
  // Character.cpp:419–440: ordinary flat HP, ordinary rate, then independent flat/rate 450 caps.
  // Sum the unbounded group before capping: +300,+300,-200 must contribute +400 in any order.
  const ordinaryHp = stats.maxHp + sum('maxHp', false)
  const hp = ordinaryHp + Math.trunc((ordinaryHp * sum('maxHp', true)) / 100)
  s.maxHp =
    hp +
    Math.min(450, sum('maxHp450', false)) +
    Math.min(450, Math.trunc((hp * sum('maxHp450', true)) / 100))
  if (effects.some((effect) => effect.stat === 'reuseTime')) {
    const units = (stats.reuseTime ?? 0) * 10 + sum('reuseTime', false)
    s.reuseTime = (units + Math.trunc((units * sum('reuseTime', true)) / 100)) / 10
  }
  if (effects.some((effect) => effect.stat === 'attackSpeed')) {
    // Character.cpp:387–388. Integer pulse arithmetic, after the flat subtraction.
    let pulses = Math.trunc(stats.attackInterval * 10) - Math.trunc(sum('attackSpeed', false))
    pulses -= Math.trunc((pulses * sum('attackSpeed', true)) / 100)
    s.attackInterval = pulses / 10
  }
  if (effects.some((effect) => effect.stat === 'attackRange')) {
    // Character.cpp:459–460: metres first, then the rate on the longer range (a float).
    const range = (stats.attackRange ?? 0) + sum('attackRange', false)
    s.attackRange = range + (range * sum('attackRange', true)) / 100
  }
  if (effects.some((effect) => effect.stat === 'hpRegen' || effect.stat === 'mpRegen')) {
    s.recoveryGroups = [
      ...(stats.recoveryGroups ?? []),
      {
        hpFlat: sum('hpRegen', false),
        hpRate: sum('hpRegen', true),
        mpFlat: sum('mpRegen', false),
        mpRate: sum('mpRegen', true),
      },
    ]
  }
  const grouped = new Set<StatKey>([
    'attack',
    'defense',
    'maxHp',
    'maxMp',
    'hpRegen',
    'mpRegen',
    'hit',
    'dodge',
    'strength',
    'dexterity',
    'intelligence',
    'constitution',
  ])
  for (const stat of grouped) {
    if (stat === 'maxHp') continue
    if (!effects.some((effect) => effect.stat === stat)) continue
    const existing = s[stat as keyof CombatStats]
    const base = typeof existing === 'number' ? existing : 0
    const flat = sum(stat, false)
    const rate = sum(stat, true)
    // Hit/avoid assist rates use the pre-addition rating (Battle_GetDamage.cpp:1664–1685).
    const delta = ((stat === 'hit' || stat === 'dodge' ? base : base + flat) * rate) / 100
    const value = base + flat + (stat === 'maxMp' ? Math.trunc(delta) : delta)
    Object.assign(s, { [stat]: value })
  }
  // Synthetic fighters without a sheet retain the original single-channel fallback adapter.
  if (!stats.clientContext && stats.magicAttack === undefined)
    s.attack += sum('magicAttack', false) + (stats.attack * sum('magicAttack', true)) / 100
  if (!stats.clientContext) {
    if (stats.physicalAttack !== undefined)
      s.physicalAttack =
        stats.physicalAttack +
        sum('attack', false) +
        Math.trunc((stats.physicalAttack * sum('attack', true)) / 100)
    if (stats.physicalHit !== undefined)
      s.physicalHit =
        stats.physicalHit +
        sum('hit', false) +
        Math.trunc((stats.physicalHit * sum('hit', true)) / 100)
    for (const key of ['magicAttack', 'magicDefense', 'magicHit', 'magicEvasion'] as const) {
      const base = stats[key]
      if (base !== undefined)
        s[key] = base + sum(key, false) + Math.trunc((base * sum(key, true)) / 100)
    }
    if (stats.magicDefense === undefined)
      s.defense += sum('magicDefense', false) + (stats.defense * sum('magicDefense', true)) / 100
    if (stats.physicalAttack === undefined && effects.some((effect) => effect.stat === 'magicHit'))
      s.hit =
        (s.hit ?? 0) + sum('magicHit', false) + ((stats.hit ?? 0) * sum('magicHit', true)) / 100
    if (
      stats.physicalAttack === undefined &&
      effects.some((effect) => effect.stat === 'magicEvasion')
    )
      s.dodge =
        (s.dodge ?? 0) +
        sum('magicEvasion', false) +
        ((stats.dodge ?? 0) * sum('magicEvasion', true)) / 100
  }
  for (const { stat, value, percent } of effects) {
    if (grouped.has(stat) || stat === 'maxHp450' || stat === 'reuseTime') continue
    switch (stat) {
      case 'magicAttack':
      case 'magicDefense':
      case 'magicHit':
      case 'magicEvasion':
      case 'runSpeed':
        // The source-sheet channels are updated separately below.
        break
      case 'attackRange':
        // Applied as one additive/rate group above.
        break
      case 'critChance':
        s.critChance += percent ? value / 100 : value / 1000
        break
      case 'critMultiplier':
        s.critMultiplier += value / 100
        break
      case 'deadly':
        // Source weight is kept separately from critical damage.
        break
      case 'attackSpeed':
        // Applied as one additive/rate group above.
        break
      case 'castTime':
        s.castTime = (s.castTime ?? 0) + value / 10
        break
      case 'castSpeed':
        // Only the rate group is consumed by m_skillSpeed (Character.cpp:391).
        if (percent) s.castSpeed = (s.castSpeed ?? 0) + value
        break
      case 'moveSpeed':
        s.moveSpeed = ((1 + (s.moveSpeed ?? 0) / 100) * (1 + value / 100) - 1) * 100
        break
      case 'stunResistance':
      case 'stoneResistance':
      case 'silenceResistance':
        s[stat] = Math.min(80, (s[stat] ?? 0) + value)
        break
      case 'cooldownFree':
        s.cooldownFree = value > 0
        break
      case 'blockChance':
      case 'cooldownReduction':
      case 'mpCostReduction':
      case 'hpSteal':
      case 'mpSteal':
        // percent values (rare options)
        s[stat] = (s[stat] ?? 0) + value
        break
    }
  }
  s.attack = Math.max(1, s.attack)
  s.defense = Math.max(0, s.defense)
  s.maxHp = Math.max(1, Math.round(s.maxHp))
  if (s.maxMp !== undefined) s.maxMp = Math.max(0, Math.round(s.maxMp))
  s.attackInterval = Math.max(0.3, s.attackInterval)
  s.critChance = Math.min(1, Math.max(0, s.critChance))
  for (const key of ['strength', 'dexterity', 'intelligence', 'constitution'] as const) {
    if (s[key] !== undefined) s[key] = Math.max(1, Math.trunc(s[key]))
  }
  applyClientStats(stats, s, effects)
  return bindCombatChannels(s)
}

/**
 * Combat Reflection from the passive skills. The server sums the amounts but sets the chance from
 * the last passive it applies (`hcReflexProb = realHitrateValue`, Character.cpp:1365).
 */
export function passiveReflect(
  ranks: readonly SkillRank[],
): { chance: number; flat: number; rate: number } | undefined {
  let reflect: { chance: number; flat: number; rate: number } | undefined
  for (const r of ranks) {
    if (r.kind !== 'passive') continue
    for (const e of r.effects) {
      if (e.kind !== 'reflect') continue
      reflect ??= { chance: 0, flat: 0, rate: 0 }
      reflect.chance = e.chance
      if (e.percent) reflect.rate += e.power
      else reflect.flat += e.power
    }
  }
  return reflect
}

/** Stat changes from the passive skills (they always apply). */
export function passiveEffects(ranks: readonly SkillRank[]): StatEffect[] {
  return ranks
    .filter((r) => r.kind === 'passive')
    .flatMap((r) => r.effects)
    .filter((e): e is StatEffect => e.kind === 'stat')
}
