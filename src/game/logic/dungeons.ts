/** IdleLC's active horde mode. Original actors, skill effects and rewards; own waves and crystals. */
import {
  DUNGEON_DAILY_RUNS,
  DUNGEON_MAX_ENEMIES,
  DUNGEON_MAX_LEVEL,
  DUNGEON_RADIUS,
  DUNGEON_SECONDS,
  DUNGEON_WAVE_SECONDS,
  getDungeon,
  type DungeonId,
} from '../data/dungeons.ts'
import { SKILLS, getSkill } from '../data/skills.ts'
import { lcData } from '../data/lcSource.ts'
import type { ClassId, SkillDef } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import {
  advanceActor,
  actAgainst,
  applyEffects,
  copyFighter,
  effectiveStats,
  freshFighter,
  isStunned,
  landAreaSkill,
  runSpeed,
  type CombatEvent,
  type CombatState,
  type Fighter,
  type ActiveEffect,
} from './combat.ts'
import { playerFighter, monsterFighter } from './fighters.ts'
import { boostEffects } from './boosts.ts'
import { interpretEffect, skillRank, type SkillRank } from './skills.ts'
import type { ItemStack } from './loot.ts'
import type { ElementalType } from './summons.ts'
import { rollInt, type Rng } from './rng.ts'
import type { LcDungeonSuperBuff } from '../data/lcTypes.ts'
import { HP_COEFFICIENT, MP_COEFFICIENT } from './attributes.ts'

export interface DungeonPoint {
  x: number
  z: number
}
export interface DungeonEnemy extends DungeonPoint {
  uid: number
  monsterId: string
  fighter: Fighter
  deadFor: number
  /** An attack list belongs to this NPC, not to the whole crowd. */
  hate?: { player: number; summons: Partial<Record<ElementalType, number>> }
}
export interface DungeonCrystal extends DungeonPoint {
  uid: number
  value: number
}
export type DungeonEnd = 'completed' | 'defeated' | 'left' | 'interrupted'
export interface DungeonRecord {
  runId: string
  dungeonId: DungeonId
  endedAt: number
  outcome: DungeonEnd
  seconds: number
  score: number
  level: number
  exp: number
  gold: number
  sp: number
  drops: ItemStack[]
  lost: { exp: number; sp: number }
}
export type DungeonCheckpoint = Omit<DungeonRecord, 'endedAt' | 'outcome'>
export interface DungeonProgress {
  /** UTC day; never moved backwards by a local clock correction. */
  day: string
  entries: Partial<Record<DungeonId, number>>
  best: Partial<Record<DungeonId, DungeonRecord>>
  history: DungeonRecord[]
  active: DungeonCheckpoint | null
  /** Spendable currency and lifetime ranking score are deliberately independent. */
  points: number
  totalPoints: number
  buffLevels: Record<number, number>
}
export interface DungeonRun {
  id: string
  dungeonId: DungeonId
  elapsed: number
  score: number
  level: number
  xp: number
  pendingLevels: number
  choices: number[]
  buffs: number[]
  /** Buffer levels are frozen on entry, just like equipment. */
  buffLevels: Record<number, number>
  wave: number
  remainingSpawns: number
  spawnIn: number
  nextUid: number
  targetUid: number | null
  player: Fighter
  position: DungeonPoint
  facing: number
  enemies: DungeonEnemy[]
  crystals: DungeonCrystal[]
  ended: DungeonEnd | null
  rewards: {
    exp: number
    gold: number
    sp: number
    drops: ItemStack[]
    lost: { exp: number; sp: number }
  }
}
export interface DungeonEvent {
  enemyUid: number | null
  event: CombatEvent
}
export interface DungeonUpdate {
  character: CharacterData
  run: DungeonRun | null
  events: DungeonEvent[]
  result?: DungeonRecord
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10)
export const dungeonXpNeeded = (level: number): number => 3 + Math.floor((level - 1) * 1.25)
export const emptyDungeonProgress = (): DungeonProgress => ({
  day: '',
  entries: {},
  best: {},
  history: [],
  active: null,
  points: 0,
  totalPoints: 0,
  buffLevels: {},
})

export function dailyProgress(progress: DungeonProgress | undefined, now: number): DungeonProgress {
  const p = progress ?? emptyDungeonProgress()
  const day = utcDay(now)
  return day > p.day ? { ...p, day, entries: {} } : p
}
export function dungeonRunsLeft(
  character: Pick<CharacterData, 'dungeons'>,
  id: DungeonId,
  now = Date.now(),
): number {
  return Math.max(0, DUNGEON_DAILY_RUNS - (dailyProgress(character.dungeons, now).entries[id] ?? 0))
}

/** All fully understood, lasting, helpful active class buffs, including ranks above the hero. */
const BUFF_DEFINITIONS: Record<number, SkillDef> = lcData?.dungeonBuffs
  ? Object.fromEntries(
      lcData.dungeonBuffs.map((s) => [s.id, { ...s, classId: s.classId as ClassId }]),
    )
  : SKILLS
export const dungeonBuffDefinition = (id: number): SkillDef | undefined =>
  BUFF_DEFINITIONS[id] ?? getSkill(id)
export const DUNGEON_BUFFS = Object.values(BUFF_DEFINITIONS)
  .filter((s) => {
    const last = s.levels.at(-1)
    if (!last || last.effects.some((e) => interpretEffect(e) === null)) return false
    const rank = skillRank(s, last.level, false)
    return (
      rank.kind === 'buff' &&
      !rank.offensive &&
      rank.duration > 0 &&
      rank.effects.some((e) => (e.kind === 'stat' && e.value > 0) || e.kind === 'regen') &&
      rank.effects.every((e) => ['stat', 'regen'].includes(e.kind))
    )
  })
  .map((s) => s.id)

export const DUNGEON_BUFF_UPGRADE_COST = 100
export const DUNGEON_SUPER_BUFFS: readonly LcDungeonSuperBuff[] = lcData?.dungeonSuperBuffs ?? []
export const dungeonSuperBuffDefinition = (id: number) =>
  DUNGEON_SUPER_BUFFS.find((b) => b.id === id)
export const dungeonChoiceLevel = (run: DungeonRun) => run.level - run.pendingLevels + 1
export const isDungeonSuperLevel = (level: number) => [5, 10, 15, 20].includes(level)

export function dungeonSuperEffect(
  buff: LcDungeonSuperBuff,
  remaining: number,
  classId?: ClassId,
): ActiveEffect {
  return {
    skillId: buff.skillId ?? buff.id,
    ...(buff.itemId === undefined ? {} : { itemId: buff.itemId }),
    name: buff.name,
    dungeon: true,
    remaining,
    stats: [
      ...buff.effects.flatMap((raw) => {
        const e = interpretEffect(raw)
        return e?.kind === 'stat' ? [e] : []
      }),
      ...(buff.attributes
        ? (['strength', 'dexterity', 'intelligence', 'constitution'] as const).map((stat) => ({
            kind: 'stat' as const,
            stat,
            value: buff.attributes!,
            percent: false,
          }))
        : []),
      // ApplyArtifact: CON-derived HP and INT/CON-derived MP, after passives and before assists.
      ...(buff.attributes && classId
        ? [
            {
              kind: 'stat' as const,
              stat: 'maxHp' as const,
              value: buff.attributes * HP_COEFFICIENT[classId][3],
              percent: false,
            },
            {
              kind: 'stat' as const,
              stat: 'maxMp' as const,
              value: buff.attributes * (MP_COEFFICIENT[classId][2] + MP_COEFFICIENT[classId][3]),
              percent: false,
            },
          ]
        : []),
    ],
    ...(buff.rewards ? { rewards: { ...buff.rewards } } : {}),
    stun: false,
    poison: 0,
    nextTick: 1,
  }
}

/** Source cash EXP, SP and artefact bonuses are successive multipliers, not one summed percent. */
export function dungeonRewardMultipliers(run: DungeonRun) {
  const rates = { exp: 1, sp: 1, gold: 1, drop: 1 }
  for (const e of run.player.effects)
    if (e.remaining > 0 && e.rewards)
      for (const key of ['exp', 'sp', 'gold', 'drop'] as const)
        rates[key] *= 1 + e.rewards[key] / 100
  return rates
}

export function dungeonBuffLevel(progress: DungeonProgress | undefined, id: number): number {
  return progress?.buffLevels[id] ?? 1
}

export function dungeonBuffRank(id: number, level = 1) {
  const skill = dungeonBuffDefinition(id)
  if (!skill || !DUNGEON_BUFFS.includes(id)) throw new GameError('unknown-dungeon-buff')
  return skillRank(skill, level, false)
}

export function upgradeDungeonBuff(character: CharacterData, id: number): CharacterData {
  if (character.dungeons?.active) throw new GameError('in-dungeon')
  const skill = dungeonBuffDefinition(id)
  if (!skill || !DUNGEON_BUFFS.includes(id)) throw new GameError('unknown-dungeon-buff')
  const progress = character.dungeons ?? emptyDungeonProgress()
  const level = dungeonBuffLevel(progress, id)
  if (!skill.levels.some((rank) => rank.level === level + 1))
    throw new GameError('dungeon-buff-max', 'This blessing is already at its maximum level.')
  if (progress.points < DUNGEON_BUFF_UPGRADE_COST)
    throw new GameError('dungeon-points', 'Not enough dungeon points.')
  return {
    ...character,
    dungeons: {
      ...progress,
      points: progress.points - DUNGEON_BUFF_UPGRADE_COST,
      buffLevels: { ...progress.buffLevels, [id]: level + 1 },
    },
  }
}

function offerBuffs(run: DungeonRun, rng: Rng): void {
  if (run.pendingLevels <= 0 || run.choices.length) return
  const special = isDungeonSuperLevel(dungeonChoiceLevel(run)) && DUNGEON_SUPER_BUFFS.length > 0
  const pool = (special ? DUNGEON_SUPER_BUFFS.map((b) => b.id) : DUNGEON_BUFFS).filter(
    (id) => !run.buffs.includes(id),
  )
  for (let n = 0, count = special ? 4 : 3; n < count && pool.length; n++)
    run.choices.push(pool.splice(rollInt(rng, 0, pool.length - 1), 1)[0]!)
  if (!run.choices.length) run.pendingLevels = 0
}

export function chooseDungeonBuff(run: DungeonRun, id: number, rng: Rng): DungeonRun {
  if (run.ended || !run.choices.includes(id) || run.buffs.includes(id))
    throw new GameError('dungeon-buff-not-offered')
  const next = {
    ...run,
    player: copyFighter(run.player),
    buffs: [...run.buffs, id],
    choices: [],
    pendingLevels: run.pendingLevels - 1,
  }
  const special = dungeonSuperBuffDefinition(id)
  if (special)
    next.player.effects.push(
      dungeonSuperEffect(
        special,
        DUNGEON_SECONDS - run.elapsed,
        run.player.stats.clientContext?.classId,
      ),
    )
  else
    applyEffects(
      next.player,
      'player',
      { ...dungeonBuffRank(id, run.buffLevels[id] ?? 1), duration: DUNGEON_SECONDS - run.elapsed },
      rng,
      [],
    )
  if (!special)
    next.player.effects = next.player.effects.map((e) =>
      e.skillId === id ? { ...e, dungeon: true } : e,
    )
  offerBuffs(next, rng)
  return next
}

export function createDungeonRun(
  character: CharacterData,
  dungeonId: DungeonId,
  id: string,
  now: number,
): DungeonRun {
  const def = getDungeon(dungeonId)
  if (!def) throw new GameError('unknown-dungeon')
  if (character.level < def.minLevel)
    throw new GameError('dungeon-level', `Requires character level ${def.minLevel}.`)
  if (character.expedition || character.dungeons?.active) throw new GameError('character-busy')
  if (dungeonRunsLeft(character, dungeonId, now) <= 0)
    throw new GameError('dungeon-daily-limit', 'No entries left today. Reset: 00:00 UTC.')
  const player = freshFighter(playerFighter(character, now))
  player.effects = boostEffects(character.boosts ?? [], now)
  return {
    id,
    dungeonId,
    elapsed: 0,
    score: 0,
    level: 1,
    xp: 0,
    pendingLevels: 0,
    choices: [],
    buffs: [],
    buffLevels: { ...character.dungeons?.buffLevels },
    wave: 0,
    remainingSpawns: 0,
    spawnIn: 0,
    nextUid: 1,
    targetUid: null,
    player,
    position: { x: 0, z: 0 },
    facing: Math.PI,
    enemies: [],
    crystals: [],
    ended: null,
    rewards: { exp: 0, gold: 0, sp: 0, drops: [], lost: { exp: 0, sp: 0 } },
  }
}

const distance = (a: DungeonPoint, b: DungeonPoint) => Math.hypot(a.x - b.x, a.z - b.z)
function moveToward(point: DungeonPoint, target: DungeonPoint, metres: number): void {
  const d = distance(point, target)
  if (d <= 0) return
  const t = Math.min(1, Math.max(0, metres) / d)
  point.x += (target.x - point.x) * t
  point.z += (target.z - point.z) * t
}

function spawn(run: DungeonRun, rng: Rng): void {
  const roster = getDungeon(run.dungeonId)!.monsterIds
  const tier = Math.min(roster.length - 1, Math.floor(((run.wave - 1) * roster.length) / 20))
  const monsterId = roster[rollInt(rng, Math.max(0, tier - 1), tier)]!
  let angle = rng() * Math.PI * 2
  let point = {
    x: Math.sin(angle) * (DUNGEON_RADIUS - 1),
    z: Math.cos(angle) * (DUNGEON_RADIUS - 1),
  }
  if (distance(point, run.position) < 10) {
    angle += Math.PI
    point = { x: Math.sin(angle) * (DUNGEON_RADIUS - 1), z: Math.cos(angle) * (DUNGEON_RADIUS - 1) }
  }
  const fighter = freshFighter(monsterFighter(monsterId))
  fighter.cooldown = fighter.stats.attackInterval * 0.5
  run.enemies.push({ ...point, uid: run.nextUid++, monsterId, fighter, deadFor: -1 })
}

function duel(run: DungeonRun, enemy: DungeonEnemy): CombatState {
  const hate = enemy.hate ?? { player: 0, summons: {} }
  run.player.hate = hate.player
  for (const summon of run.player.summons ?? []) summon.hate = hate.summons[summon.element] ?? 0
  return {
    phase: 'fighting',
    phaseTime: 0,
    player: run.player,
    monster: enemy.fighter,
    monsterId: enemy.monsterId,
    kills: 0,
    deaths: 0,
  }
}

function rememberHate(run: DungeonRun, enemy: DungeonEnemy): void {
  enemy.hate = {
    player: run.player.hate ?? 0,
    summons: Object.fromEntries((run.player.summons ?? []).map((s) => [s.element, s.hate])),
  }
}

/** Client FindTargetsInRange: self/target circles, a 120-degree cone, or a 1 m wide rectangle. */
export function dungeonAreaTargets(
  run: DungeonRun,
  primary: DungeonEnemy,
  rank: SkillRank,
): DungeonEnemy[] {
  const def = getSkill(rank.id)
  const cap = def?.levels.find((l) => l.level === rank.level)?.targetMax ?? 1
  const range = def?.appRange ?? 0
  if (
    !rank.offensive ||
    !def ||
    cap <= 1 ||
    range <= 0 ||
    ![1, 3, 6, 7, 11].includes(def.targetType)
  )
    return []
  const center = def.targetType === 3 ? primary : run.position
  const direction = { x: primary.x - run.position.x, z: primary.z - run.position.z }
  const length = Math.hypot(direction.x, direction.z) || 1
  return run.enemies
    .filter((e) => {
      if (e.uid === primary.uid || e.fighter.hp <= 0 || (rank.notBoss && e.fighter.stats.boss))
        return false
      if (distance(e, center) > range) return false
      const dx = e.x - run.position.x,
        dz = e.z - run.position.z
      const along = (dx * direction.x + dz * direction.z) / length
      if (def.targetType === 6) return along > Math.hypot(dx, dz) * 0.5
      if (def.targetType === 7)
        return (
          along > 0 &&
          along <= range &&
          Math.abs(dx * direction.z - dz * direction.x) / length <= 0.5
        )
      return true
    })
    .sort((a, b) => distance(a, center) - distance(b, center))
    .slice(0, cap - 1)
}

/** At most 50 ms; input is a camera-relative stick vector in world x/z. Does not pay rewards. */
export function dungeonStep(
  run: DungeonRun,
  seconds: number,
  input: DungeonPoint,
  rng: Rng,
): { run: DungeonRun; events: DungeonEvent[]; kills: string[]; potions: ItemStack[] } {
  const result = {
    run,
    events: [] as DungeonEvent[],
    kills: [] as string[],
    potions: [] as ItemStack[],
  }
  if (run.ended || run.choices.length || seconds <= 0) return result
  const dt = Math.min(0.05, seconds, DUNGEON_SECONDS - run.elapsed)
  const next: DungeonRun = {
    ...run,
    elapsed: Math.min(DUNGEON_SECONDS, run.elapsed + dt),
    position: { ...run.position },
    player: copyFighter(run.player),
    enemies: run.enemies.map((e) => ({ ...e, fighter: copyFighter(e.fighter) })),
    crystals: run.crystals.map((c) => ({ ...c })),
    choices: [...run.choices],
  }
  result.run = next
  const playerEvents: CombatEvent[] = []
  advanceActor(next.player, 'player', dt, playerEvents)
  result.events.push(...playerEvents.map((event) => ({ enemyUid: null, event })))
  const blocked = isStunned(next.player) || next.player.effects.some((e) => e.state === 'hold')
  const ix = Number.isFinite(input.x) ? input.x : 0,
    iz = Number.isFinite(input.z) ? input.z : 0
  const strength = Math.min(1, Math.hypot(ix, iz))
  if (!blocked && strength > 0.05) {
    const length = Math.hypot(ix, iz)
    const metres = runSpeed(effectiveStats(next.player)) * dt * strength
    next.position.x += (ix / length) * metres
    next.position.z += (iz / length) * metres
    next.facing = Math.atan2(ix, iz)
    const radius = Math.hypot(next.position.x, next.position.z)
    if (radius > DUNGEON_RADIUS - 1.5) {
      next.position.x *= (DUNGEON_RADIUS - 1.5) / radius
      next.position.z *= (DUNGEON_RADIUS - 1.5) / radius
    }
  }

  const wave = Math.min(20, Math.floor(run.elapsed / DUNGEON_WAVE_SECONDS) + 1)
  if (wave > next.wave) {
    next.wave = wave
    next.remainingSpawns += 4 + wave
    next.spawnIn = 0
  }
  next.spawnIn -= dt
  if (
    next.remainingSpawns > 0 &&
    next.spawnIn <= 0 &&
    next.enemies.filter((e) => e.fighter.hp > 0).length < DUNGEON_MAX_ENEMIES
  ) {
    spawn(next, rng)
    next.remainingSpawns--
    next.spawnIn = 0.65
  }

  for (const e of next.enemies) {
    if (e.fighter.hp <= 0) {
      e.deadFor += dt
      continue
    }
    const events: CombatEvent[] = []
    advanceActor(e.fighter, 'monster', dt, events)
    const d = distance(e, next.position)
    const stop = Math.max(1.8, e.fighter.stats.attackRange ?? 1.8)
    if (d > stop && !isStunned(e.fighter) && !e.fighter.effects.some((fx) => fx.state === 'hold'))
      moveToward(e, next.position, Math.min(d - stop, runSpeed(effectiveStats(e.fighter)) * dt))
    result.events.push(...events.map((event) => ({ enemyUid: e.uid, event })))
  }
  const living = next.enemies.filter((e) => e.fighter.hp > 0)
  // Keep a crowd readable instead of stacking every body at the same contact point.
  for (let i = 0; i < living.length; i++)
    for (let j = i + 1; j < living.length; j++) {
      const a = living[i]!,
        b = living[j]!
      const dx = a.x - b.x,
        dz = a.z - b.z,
        d = Math.hypot(dx, dz)
      if (d < 1.15 && d > 0.001) {
        const push = Math.min((1.15 - d) / 2, 2 * dt)
        a.x += (dx / d) * push
        a.z += (dz / d) * push
        b.x -= (dx / d) * push
        b.z -= (dz / d) * push
      }
    }
  const pinned =
    next.player.impactIn !== null ? living.find((e) => e.uid === next.targetUid) : undefined
  const target =
    pinned ??
    living.reduce<DungeonEnemy | undefined>(
      (a, e) => (!a || distance(e, next.position) < distance(a, next.position) ? e : a),
      undefined,
    )
  if (target) {
    next.targetUid = target.uid
    const events: CombatEvent[] = []
    const inRange =
      distance(target, next.position) <=
      Math.max(2.4, effectiveStats(next.player).attackRange ?? 2.4)
    const fired = actAgainst(
      duel(next, target),
      'player',
      dt,
      rng,
      events,
      inRange,
      distance(target, next.position),
    )
    rememberHate(next, target)
    result.events.push(...events.map((event) => ({ enemyUid: target.uid, event })))
    if (fired?.offensive && next.player.hp > 0)
      for (const extra of dungeonAreaTargets(next, target, fired)) {
        const extraEvents: CombatEvent[] = []
        landAreaSkill(duel(next, extra), fired, rng, extraEvents)
        rememberHate(next, extra)
        result.events.push(...extraEvents.map((event) => ({ enemyUid: extra.uid, event })))
      }
  } else next.player.cooldown = Math.max(0, next.player.cooldown - dt)
  for (const enemy of living) {
    if (enemy.fighter.hp <= 0 || next.player.hp <= 0) continue
    const events: CombatEvent[] = []
    actAgainst(
      duel(next, enemy),
      'monster',
      dt,
      rng,
      events,
      distance(enemy, next.position) <= Math.max(1.85, enemy.fighter.stats.attackRange ?? 1.85),
      distance(enemy, next.position),
    )
    rememberHate(next, enemy)
    result.events.push(...events.map((event) => ({ enemyUid: enemy.uid, event })))
  }
  for (const enemy of next.enemies) {
    if (enemy.fighter.hp > 0 || enemy.deadFor >= 0) continue
    enemy.deadFor = 0
    next.score++
    result.kills.push(enemy.monsterId)
    const nearby = next.crystals.find((c) => distance(c, enemy) < 1)
    if (nearby) nearby.value++
    else next.crystals.push({ uid: next.nextUid++, x: enemy.x, z: enemy.z, value: 1 })
  }
  next.enemies = next.enemies.filter((e) => e.deadFor < 0.8)
  for (const crystal of next.crystals) {
    if (distance(crystal, next.position) < 4.5) moveToward(crystal, next.position, 12 * dt)
    if (distance(crystal, next.position) <= 1.4) {
      next.xp += crystal.value
      crystal.value = 0
    }
  }
  next.crystals = next.crystals.filter((c) => c.value > 0)
  while (next.level < DUNGEON_MAX_LEVEL && next.xp >= dungeonXpNeeded(next.level)) {
    next.xp -= dungeonXpNeeded(next.level)
    next.level++
    next.pendingLevels++
  }
  if (next.level === DUNGEON_MAX_LEVEL) next.xp = 0
  offerBuffs(next, rng)
  for (const [id, count] of Object.entries(next.player.potionsUsed))
    if (count > 0) result.potions.push({ itemId: Number(id), count })
  next.player.potionsUsed = {}
  if (next.player.hp <= 0) next.ended = 'defeated'
  else if (next.elapsed >= DUNGEON_SECONDS - 1e-6) next.ended = 'completed'
  if (next.ended) next.choices = []
  return result
}

export function dungeonCheckpoint(run: DungeonRun): DungeonCheckpoint {
  return {
    runId: run.id,
    dungeonId: run.dungeonId,
    seconds: run.elapsed,
    score: run.score,
    level: run.level,
    ...run.rewards,
  }
}
export function recordDungeon(progress: DungeonProgress, record: DungeonRecord): DungeonProgress {
  if (progress.history.some((r) => r.runId === record.runId)) return { ...progress, active: null }
  const best = progress.best[record.dungeonId]
  const earned = record.outcome === 'completed' ? record.score : 0
  return {
    ...progress,
    points: progress.points + earned,
    totalPoints: progress.totalPoints + earned,
    active: null,
    best:
      !best || record.score > best.score
        ? { ...progress.best, [record.dungeonId]: record }
        : progress.best,
    history: [record, ...progress.history].slice(0, 30),
  }
}

/** Validate only persisted summaries. Live actors are never restored or simulated offline. */
export function sanitizeDungeonProgress(raw: unknown): DungeonProgress {
  const empty = emptyDungeonProgress()
  if (!raw || typeof raw !== 'object') return empty
  const p = raw as Partial<DungeonProgress>
  const record = (r: unknown): r is DungeonRecord =>
    !!r &&
    typeof r === 'object' &&
    typeof (r as DungeonRecord).runId === 'string' &&
    !!getDungeon((r as DungeonRecord).dungeonId) &&
    ['seconds', 'score', 'level', 'exp', 'gold', 'sp'].every(
      (key) =>
        Number.isFinite((r as unknown as Record<string, number>)[key]) &&
        (r as unknown as Record<string, number>)[key]! >= 0,
    ) &&
    (r as DungeonRecord).seconds <= DUNGEON_SECONDS &&
    (r as DungeonRecord).level <= DUNGEON_MAX_LEVEL &&
    Array.isArray((r as DungeonRecord).drops) &&
    (r as DungeonRecord).drops.every(
      (d) => d && Number.isInteger(d.itemId) && Number.isInteger(d.count) && d.count > 0,
    ) &&
    !!(r as DungeonRecord).lost &&
    Number.isFinite((r as DungeonRecord).lost.exp) &&
    (r as DungeonRecord).lost.exp >= 0 &&
    Number.isFinite((r as DungeonRecord).lost.sp) &&
    (r as DungeonRecord).lost.sp >= 0
  const finished = (r: unknown): r is DungeonRecord =>
    record(r) &&
    Number.isFinite(r.endedAt) &&
    ['completed', 'defeated', 'left', 'interrupted'].includes(r.outcome)
  const history = (Array.isArray(p.history) ? p.history : []).filter(finished).slice(0, 30)
  const best = Object.fromEntries(
    Object.entries(p.best ?? {}).filter(
      ([id, r]) => getDungeon(id) && finished(r) && r.dungeonId === id,
    ),
  )
  const entries = Object.fromEntries(
    Object.entries(p.entries ?? {})
      .filter(([id, n]) => getDungeon(id) && Number.isInteger(n) && n >= 0)
      .map(([id, n]) => [id, Math.min(2, n)]),
  )
  const validPoints = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0
  // v15 had no wallet. Credit its completed, recorded rounds once on migration.
  const legacyPoints = history.reduce(
    (sum, r) => sum + (r.outcome === 'completed' ? r.score : 0),
    0,
  )
  const totalPoints = validPoints(p.totalPoints) ? p.totalPoints : legacyPoints
  const points = Math.min(validPoints(p.points) ? p.points : legacyPoints, totalPoints)
  const buffLevels = Object.fromEntries(
    Object.entries(p.buffLevels ?? {}).filter(
      ([id, level]) =>
        DUNGEON_BUFFS.includes(Number(id)) &&
        Number.isInteger(level) &&
        !!dungeonBuffDefinition(Number(id))?.levels.some((rank) => rank.level === level),
    ),
  )
  return {
    day: typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : '',
    entries,
    history,
    best,
    active: record(p.active) ? p.active : null,
    points,
    totalPoints,
    buffLevels,
  }
}
