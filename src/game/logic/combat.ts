/**
 * Auto-combat state machine. Pure: combatTick returns a new state and the events that happened.
 * The 3D scene only reacts to events — it never decides outcomes.
 *
 * spawning → (spawn) → approach → (engage) → fighting → victory → (despawn) → spawning …
 *                                               └─────→ defeat → (revive, despawn) → spawning …
 *
 * In a fight the hero uses its automatic skills (src/game/logic/skills.ts) when they are ready and
 * there is mana: heal when hurt, keep buffs up, weaken the monster, then the strongest attack.
 */
import type { CombatStats } from '../data/types.ts'
import {
  COMBAT_MP_REGEN,
  OUT_OF_COMBAT_MP_REGEN,
  OUT_OF_COMBAT_REGEN,
  REGEN_TICK_SECONDS,
  rollAttack,
  skillDamageMultiplier,
} from './balance.ts'
import { chance, type Rng } from './rng.ts'
import { applyStats, type SkillKind, type SkillRank, type StatEffect } from './skills.ts'

export type Side = 'player' | 'monster'
export type CombatPhase = 'spawning' | 'approach' | 'fighting' | 'victory' | 'defeat'

/** Phase durations and swing timing, in seconds. */
export const TIMINGS = {
  spawning: 1.0,
  approach: 1.3,
  victory: 2.2,
  defeat: 3.0,
  /** Time from the start of a swing to the moment the hit lands. */
  impactDelay: 0.4,
  /** Fraction of attackInterval the monster waits before its first swing. */
  monsterInitiative: 0.5,
  /**
   * Share of a skill's fire animation (t_skill.a_fireTime) the hero stays busy after it lands.
   * 0 until the client's skill animations are attached: standing still for it looks frozen.
   */
  skillAnimationLock: 0,
} as const

/** The hero heals below this share of HP and restores mana below this share of MP. */
export const HEAL_BELOW = 0.6
export const MANA_BELOW = 0.4
/** Seconds between two poison ticks. */
export const POISON_TICK = 1

/** Largest simulated step; bigger dt values are split so event order stays correct. */
const MAX_STEP = 0.05
/** Tolerance for timers that add up many small steps. */
const EPSILON = 1e-6

export interface FighterInit {
  level: number
  stats: CombatStats
  /** Active skills the fighter uses (the hero); passives are already in `stats`. */
  skills?: readonly SkillRank[]
}

/** A buff, debuff, stun or poison on a fighter. */
export interface ActiveEffect {
  skillId: number
  name: string
  /** Seconds left. */
  remaining: number
  stats: StatEffect[]
  stun: boolean
  /** Poison damage per tick. */
  poison: number
  /** Seconds until the next poison tick. */
  nextTick: number
}

export interface Fighter extends FighterInit {
  hp: number
  mp: number
  /** Seconds until the next swing or cast may start. */
  cooldown: number
  /** Seconds until the current swing or cast lands, or null when idle. */
  impactIn: number | null
  /** Skill being cast (lands with impactIn), or null for a normal swing. */
  casting: SkillRank | null
  /** Seconds before each skill can be used again, by skill id. */
  skillCooldowns: Record<number, number>
  effects: ActiveEffect[]
}

export interface CombatState {
  phase: CombatPhase
  /** Seconds spent in the current phase. */
  phaseTime: number
  player: Fighter
  monster: Fighter
  monsterId: string
  kills: number
  deaths: number
}

export type EffectKind = 'buff' | 'debuff' | 'stun' | 'poison'

export type CombatEvent =
  | { type: 'spawn'; monsterId: string }
  | { type: 'engage' }
  | { type: 'attack'; source: Side }
  | {
      type: 'cast'
      source: Side
      skillId: number
      name: string
      kind: SkillKind
      /** Seconds until it lands. */
      castTime: number
    }
  | { type: 'hit'; target: Side; amount: number; crit: boolean; skill?: boolean; poison?: boolean }
  | { type: 'miss'; target: Side }
  | { type: 'heal'; target: Side; amount: number; mana?: boolean }
  | { type: 'effect'; target: Side; skillId: number; name: string; kind: EffectKind }
  | { type: 'death'; who: Side }
  | { type: 'despawn' }
  | { type: 'revive' }

export interface TickResult {
  state: CombatState
  events: CombatEvent[]
}

function freshFighter(init: FighterInit): Fighter {
  return {
    level: init.level,
    stats: init.stats,
    skills: init.skills,
    hp: init.stats.maxHp,
    mp: init.stats.maxMp ?? 0,
    cooldown: 0,
    impactIn: null,
    casting: null,
    skillCooldowns: {},
    effects: [],
  }
}

/** A copy that can be changed without touching the original (combatTick is pure). */
function copyFighter(f: Fighter): Fighter {
  return {
    ...f,
    skillCooldowns: { ...f.skillCooldowns },
    effects: f.effects.map((e) => ({ ...e })),
  }
}

function copyState(state: CombatState): CombatState {
  return { ...state, player: copyFighter(state.player), monster: copyFighter(state.monster) }
}

/** Stats with the active buffs and debuffs applied. */
export function effectiveStats(f: Fighter): CombatStats {
  return f.effects.length === 0
    ? f.stats
    : applyStats(
        f.stats,
        f.effects.flatMap((e) => e.stats),
      )
}

export function isStunned(f: Fighter): boolean {
  return f.effects.some((e) => e.stun)
}

export function createCombat(
  player: FighterInit,
  monsterId: string,
  monster: FighterInit,
): CombatState {
  return {
    phase: 'spawning',
    phaseTime: 0,
    player: freshFighter(player),
    monster: freshFighter(monster),
    monsterId,
    kills: 0,
    deaths: 0,
  }
}

/** The hero after a defeat: full HP and MP, buffs gone. */
function revived(f: Fighter): Fighter {
  return {
    ...f,
    hp: f.stats.maxHp,
    mp: f.stats.maxMp ?? 0,
    cooldown: 0,
    impactIn: null,
    casting: null,
    effects: [],
  }
}

/** Switch to a different monster; the current one disappears and the new one spawns. */
export function changeMonster(
  state: CombatState,
  monsterId: string,
  monster: FighterInit,
): TickResult {
  const events: CombatEvent[] = state.phase === 'spawning' ? [] : [{ type: 'despawn' }]
  let player: Fighter = { ...copyFighter(state.player), cooldown: 0, impactIn: null, casting: null }
  if (state.phase === 'defeat') {
    player = revived(player)
    events.unshift({ type: 'revive' })
  }
  return {
    state: {
      ...state,
      phase: 'spawning',
      phaseTime: 0,
      player,
      monster: freshFighter(monster),
      monsterId,
    },
    events,
  }
}

/** Replace player level, stats and skills (level up, new skill), keeping the HP and MP ratios. */
export function updatePlayer(state: CombatState, player: FighterInit): CombatState {
  const old = state.player
  const hpRatio = old.hp / old.stats.maxHp
  const oldMaxMp = old.stats.maxMp ?? 0
  const maxMp = player.stats.maxMp ?? 0
  return {
    ...state,
    player: {
      ...copyFighter(old),
      level: player.level,
      stats: player.stats,
      skills: player.skills,
      hp: Math.max(1, Math.round(player.stats.maxHp * hpRatio)),
      mp: oldMaxMp > 0 ? Math.round((maxMp * old.mp) / oldMaxMp) : maxMp,
    },
  }
}

/** Dev tool: the current monster dies at once (only while it is on the field). */
export function killMonster(state: CombatState): TickResult {
  if (state.phase !== 'approach' && state.phase !== 'fighting') return { state, events: [] }
  const s = copyState(state)
  const events: CombatEvent[] = []
  s.monster.hp = 0
  endFight(s, 'monster', events)
  return { state: s, events }
}

/** Dev tool: restores the player's HP and MP (no effect while defeated). */
export function healPlayer(state: CombatState): CombatState {
  if (state.phase === 'defeat') return state
  const player = copyFighter(state.player)
  const stats = effectiveStats(player)
  return { ...state, player: { ...player, hp: stats.maxHp, mp: stats.maxMp ?? 0 } }
}

export function combatTick(state: CombatState, dt: number, rng: Rng): TickResult {
  const s = copyState(state)
  const events: CombatEvent[] = []
  let remaining = Math.max(0, dt)
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_STEP)
    remaining -= step
    advance(s, step, rng, events)
  }
  return { state: s, events }
}

function enter(s: CombatState, phase: CombatPhase): void {
  s.phase = phase
  s.phaseTime = 0
}

/** HP and MP regeneration: a lot out of combat, only MP (and skill bonuses) during a fight. */
function regen(f: Fighter, dt: number, inCombat: boolean): void {
  const stats = effectiveStats(f)
  const hpRate =
    (inCombat ? 0 : stats.maxHp * OUT_OF_COMBAT_REGEN) + (stats.hpRegen ?? 0) / REGEN_TICK_SECONDS
  f.hp = Math.min(stats.maxHp, Math.max(f.hp, f.hp + hpRate * dt))
  const maxMp = stats.maxMp ?? 0
  if (maxMp > 0) {
    const share = inCombat ? COMBAT_MP_REGEN : OUT_OF_COMBAT_MP_REGEN
    const mpRate = maxMp * share + (stats.mpRegen ?? 0) / REGEN_TICK_SECONDS
    f.mp = Math.min(maxMp, Math.max(f.mp, f.mp + mpRate * dt))
  }
}

/** Skill cooldowns run all the time. */
function tickCooldowns(f: Fighter, dt: number): void {
  for (const id in f.skillCooldowns) {
    const left = f.skillCooldowns[id]! - dt
    if (left > 0) f.skillCooldowns[id] = left
    else delete f.skillCooldowns[id]
  }
}

/** Counts down buffs and debuffs; returns the poison damage of the ticks that happened. */
function tickEffects(f: Fighter, dt: number): number[] {
  if (f.effects.length === 0) return []
  const poison: number[] = []
  for (const e of f.effects) {
    e.remaining -= dt
    if (e.poison <= 0) continue
    e.nextTick -= dt
    while (e.nextTick <= EPSILON && e.remaining > -EPSILON) {
      poison.push(e.poison)
      e.nextTick += POISON_TICK
    }
  }
  f.effects = f.effects.filter((e) => e.remaining > 0)
  return poison
}

function advance(s: CombatState, dt: number, rng: Rng, events: CombatEvent[]): void {
  s.phaseTime += dt
  tickCooldowns(s.player, dt)
  if (s.phase !== 'fighting') tickEffects(s.player, dt)

  switch (s.phase) {
    case 'spawning':
      regen(s.player, dt, false)
      if (s.phaseTime >= TIMINGS.spawning) {
        s.monster = freshFighter(s.monster)
        enter(s, 'approach')
        events.push({ type: 'spawn', monsterId: s.monsterId })
      }
      return

    case 'approach':
      regen(s.player, dt, false)
      if (s.phaseTime >= TIMINGS.approach) {
        s.player.cooldown = 0
        s.player.impactIn = null
        s.player.casting = null
        s.monster.cooldown = s.monster.stats.attackInterval * TIMINGS.monsterInitiative
        s.monster.impactIn = null
        enter(s, 'fighting')
        events.push({ type: 'engage' })
      }
      return

    case 'fighting':
      regen(s.player, dt, true)
      if (poisonStep(s, 'player', dt, events)) return
      if (poisonStep(s, 'monster', dt, events)) return
      if (fighterStep(s, 'player', dt, rng, events)) return
      fighterStep(s, 'monster', dt, rng, events)
      return

    case 'victory':
      regen(s.player, dt, false)
      if (s.phaseTime >= TIMINGS.victory) {
        enter(s, 'spawning')
        events.push({ type: 'despawn' })
      }
      return

    case 'defeat':
      if (s.phaseTime >= TIMINGS.defeat) {
        s.player = revived(s.player)
        enter(s, 'spawning')
        events.push({ type: 'revive' }, { type: 'despawn' })
      }
      return
  }
}

function endFight(s: CombatState, loser: Side, events: CombatEvent[]): void {
  s.player.impactIn = null
  s.player.casting = null
  s.monster.impactIn = null
  events.push({ type: 'death', who: loser })
  if (loser === 'monster') {
    s.kills += 1
    s.monster.effects = []
    enter(s, 'victory')
  } else {
    s.deaths += 1
    s.player.effects = []
    enter(s, 'defeat')
  }
}

/** Effect timers and poison damage on one fighter. Returns true when the fight ended. */
function poisonStep(s: CombatState, side: Side, dt: number, events: CombatEvent[]): boolean {
  const f = side === 'player' ? s.player : s.monster
  for (const amount of tickEffects(f, dt)) {
    const damage = Math.max(1, Math.round(amount))
    f.hp = Math.max(0, f.hp - damage)
    events.push({ type: 'hit', target: side, amount: damage, crit: false, poison: true })
    if (f.hp <= 0) {
      endFight(s, side, events)
      return true
    }
  }
  return false
}

/** Advances one fighter's swing or cast. Returns true when the fight ended. */
function fighterStep(
  s: CombatState,
  side: Side,
  dt: number,
  rng: Rng,
  events: CombatEvent[],
): boolean {
  const self = side === 'player' ? s.player : s.monster
  const target = side === 'player' ? s.monster : s.player
  if (isStunned(self)) return false

  self.cooldown -= dt

  if (self.impactIn !== null) {
    self.impactIn -= dt
    if (self.impactIn > 0) return false
    self.impactIn = null
    const skill = self.casting
    self.casting = null
    return skill ? landSkill(s, side, skill, rng, events) : landSwing(s, side, rng, events)
  }

  if (self.cooldown <= 0) {
    const stats = effectiveStats(self)
    const skill = chooseSkill(self, target)
    if (skill) {
      // wind-up (shortened by cast-speed skills), then it lands like a swing
      const windUp = Math.max(0, skill.castTime + (stats.castTime ?? 0))
      const landsIn = windUp + TIMINGS.impactDelay
      self.mp -= skill.mpCost
      self.hp -= skill.hpCost
      self.skillCooldowns[skill.id] = skill.cooldown
      self.casting = skill
      self.impactIn = landsIn
      self.cooldown += Math.max(
        stats.attackInterval,
        landsIn + skill.fireTime * TIMINGS.skillAnimationLock,
      )
      events.push({
        type: 'cast',
        source: side,
        skillId: skill.id,
        name: skill.name,
        kind: skill.kind,
        castTime: landsIn,
      })
    } else {
      self.cooldown += stats.attackInterval
      self.impactIn = TIMINGS.impactDelay
      events.push({ type: 'attack', source: side })
    }
  }
  return false
}

/** Damage to the other fighter; returns true when it died. */
function strike(
  s: CombatState,
  side: Side,
  rng: Rng,
  events: CombatEvent[],
  multiplier: number,
  skill: boolean,
): boolean | null {
  const self = side === 'player' ? s.player : s.monster
  const targetSide: Side = side === 'player' ? 'monster' : 'player'
  const target = side === 'player' ? s.monster : s.player
  const result = rollAttack(
    { level: self.level, stats: effectiveStats(self) },
    { level: target.level, stats: effectiveStats(target) },
    rng,
    multiplier,
  )
  if (result.kind === 'miss') {
    events.push({ type: 'miss', target: targetSide })
    return null
  }
  if (multiplier <= 0) return false
  target.hp = Math.max(0, target.hp - result.damage)
  events.push({
    type: 'hit',
    target: targetSide,
    amount: result.damage,
    crit: result.kind === 'crit',
    ...(skill ? { skill } : {}),
  })
  if (target.hp > 0) return false
  endFight(s, targetSide, events)
  return true
}

function landSwing(s: CombatState, side: Side, rng: Rng, events: CombatEvent[]): boolean {
  return strike(s, side, rng, events, 1, false) === true
}

function landSkill(
  s: CombatState,
  side: Side,
  skill: SkillRank,
  rng: Rng,
  events: CombatEvent[],
): boolean {
  const self = side === 'player' ? s.player : s.monster
  if (skill.offensive) {
    const targetSide: Side = side === 'player' ? 'monster' : 'player'
    const damage = skill.effects.find((e) => e.kind === 'damage')
    const multiplier = damage ? skillDamageMultiplier(damage.percent) : 0
    const outcome = strike(s, side, rng, events, multiplier, true)
    if (outcome === null) return false // missed
    if (outcome) return true
    applyEffects(targetSide === 'player' ? s.player : s.monster, targetSide, skill, rng, events)
    return false
  }

  const stats = effectiveStats(self)
  for (const e of skill.effects) {
    if (e.kind === 'heal') {
      const before = self.hp
      self.hp = Math.min(stats.maxHp, self.hp + e.amount)
      events.push({ type: 'heal', target: side, amount: Math.round(self.hp - before) })
    } else if (e.kind === 'mana') {
      const before = self.mp
      self.mp = Math.min(stats.maxMp ?? 0, self.mp + e.amount)
      events.push({ type: 'heal', target: side, amount: Math.round(self.mp - before), mana: true })
    }
  }
  applyEffects(self, side, skill, rng, events)
  return false
}

/** Puts a skill's lasting effects (stats, stun, poison) on a fighter for the skill's duration. */
function applyEffects(
  f: Fighter,
  side: Side,
  skill: SkillRank,
  rng: Rng,
  events: CombatEvent[],
): void {
  if (skill.duration <= 0) return
  const stats = skill.effects.filter((e): e is StatEffect => e.kind === 'stat')
  const stunEffect = skill.effects.find((e) => e.kind === 'stun')
  const stun = stunEffect !== undefined && chance(rng, stunEffect.chance)
  const poison = skill.effects.find((e) => e.kind === 'poison')?.perSecond ?? 0
  if (stats.length === 0 && !stun && poison <= 0) return
  f.effects = [
    ...f.effects.filter((e) => e.skillId !== skill.id),
    {
      skillId: skill.id,
      name: skill.name,
      remaining: skill.duration,
      stats,
      stun,
      poison,
      nextTick: POISON_TICK,
    },
  ]
  if (stun) {
    // a stun interrupts the swing or cast in progress
    f.impactIn = null
    f.casting = null
  }
  const kind: EffectKind = stun
    ? 'stun'
    : poison > 0
      ? 'poison'
      : skill.offensive
        ? 'debuff'
        : 'buff'
  events.push({ type: 'effect', target: side, skillId: skill.id, name: skill.name, kind })
}

/** Strongest damage first. */
function damageOf(rank: SkillRank): number {
  const damage = rank.effects.find((e) => e.kind === 'damage')
  return damage?.kind === 'damage' ? damage.percent : 0
}

/** Picks the automatic skill to use now, or null for a normal swing. */
export function chooseSkill(self: Fighter, target: Fighter): SkillRank | null {
  if (!self.skills || self.skills.length === 0) return null
  const ready = self.skills.filter(
    (r) =>
      r.auto &&
      r.kind !== 'passive' &&
      !self.skillCooldowns[r.id] &&
      self.mp >= r.mpCost &&
      self.hp > r.hpCost,
  )
  if (ready.length === 0) return null
  const stats = effectiveStats(self)
  const hurt = self.hp < stats.maxHp * HEAL_BELOW
  const drained = self.mp < (stats.maxMp ?? 0) * MANA_BELOW
  const on = (f: Fighter, id: number) => f.effects.some((e) => e.skillId === id)

  const heal = ready.find(
    (r) =>
      r.kind === 'heal' &&
      r.effects.some((e) => (e.kind === 'heal' && hurt) || (e.kind === 'mana' && drained)),
  )
  if (heal) return heal
  const buff = ready.find((r) => r.kind === 'buff' && !on(self, r.id))
  if (buff) return buff
  const debuff = ready.find((r) => r.kind === 'debuff' && !on(target, r.id))
  if (debuff) return debuff
  const attacks = ready.filter((r) => r.kind === 'attack')
  return attacks.length > 0 ? attacks.reduce((a, b) => (damageOf(b) > damageOf(a) ? b : a)) : null
}
