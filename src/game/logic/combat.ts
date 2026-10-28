/**
 * Auto-combat state machine. Pure: combatTick returns a new state and the events that happened.
 * The 3D scene only reacts to events — it never decides outcomes.
 *
 * spawning → (spawn) → approach → (engage) → fighting → victory → (despawn) → spawning …
 *                                               └─────→ defeat → (revive, despawn) → spawning …
 */
import type { CombatStats } from '../data/types.ts'
import { regenPerSecond, rollAttack } from './balance.ts'
import type { Rng } from './rng.ts'

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
} as const

/** Largest simulated step; bigger dt values are split so event order stays correct. */
const MAX_STEP = 0.05

export interface FighterInit {
  level: number
  stats: CombatStats
}

export interface Fighter extends FighterInit {
  hp: number
  /** Seconds until the next swing may start. */
  cooldown: number
  /** Seconds until the current swing lands, or null when not swinging. */
  impactIn: number | null
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

export type CombatEvent =
  | { type: 'spawn'; monsterId: string }
  | { type: 'engage' }
  | { type: 'attack'; source: Side }
  | { type: 'hit'; target: Side; amount: number; crit: boolean }
  | { type: 'miss'; target: Side }
  | { type: 'death'; who: Side }
  | { type: 'despawn' }
  | { type: 'revive' }

export interface TickResult {
  state: CombatState
  events: CombatEvent[]
}

function freshFighter(init: FighterInit, hp = init.stats.maxHp): Fighter {
  return { level: init.level, stats: init.stats, hp, cooldown: 0, impactIn: null }
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

/** Switch to a different monster; the current one disappears and the new one spawns. */
export function changeMonster(
  state: CombatState,
  monsterId: string,
  monster: FighterInit,
): TickResult {
  const events: CombatEvent[] = state.phase === 'spawning' ? [] : [{ type: 'despawn' }]
  const player = { ...state.player, cooldown: 0, impactIn: null }
  if (state.phase === 'defeat') {
    player.hp = player.stats.maxHp
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

/** Replace player level/stats (e.g. after level up), keeping the HP ratio. */
export function updatePlayer(state: CombatState, player: FighterInit): CombatState {
  const ratio = state.player.hp / state.player.stats.maxHp
  return {
    ...state,
    player: {
      ...state.player,
      level: player.level,
      stats: player.stats,
      hp: Math.max(1, Math.round(player.stats.maxHp * ratio)),
    },
  }
}

export function combatTick(state: CombatState, dt: number, rng: Rng): TickResult {
  const s: CombatState = { ...state, player: { ...state.player }, monster: { ...state.monster } }
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

function regen(f: Fighter, dt: number): void {
  f.hp = Math.min(f.stats.maxHp, f.hp + regenPerSecond(f.stats.maxHp) * dt)
}

function advance(s: CombatState, dt: number, rng: Rng, events: CombatEvent[]): void {
  s.phaseTime += dt

  switch (s.phase) {
    case 'spawning':
      regen(s.player, dt)
      if (s.phaseTime >= TIMINGS.spawning) {
        s.monster = freshFighter(s.monster)
        enter(s, 'approach')
        events.push({ type: 'spawn', monsterId: s.monsterId })
      }
      return

    case 'approach':
      regen(s.player, dt)
      if (s.phaseTime >= TIMINGS.approach) {
        s.player.cooldown = 0
        s.player.impactIn = null
        s.monster.cooldown = s.monster.stats.attackInterval * TIMINGS.monsterInitiative
        s.monster.impactIn = null
        enter(s, 'fighting')
        events.push({ type: 'engage' })
      }
      return

    case 'fighting':
      if (fighterStep(s, 'player', dt, rng, events)) return
      fighterStep(s, 'monster', dt, rng, events)
      return

    case 'victory':
      regen(s.player, dt)
      if (s.phaseTime >= TIMINGS.victory) {
        enter(s, 'spawning')
        events.push({ type: 'despawn' })
      }
      return

    case 'defeat':
      if (s.phaseTime >= TIMINGS.defeat) {
        s.player = { ...s.player, hp: s.player.stats.maxHp, cooldown: 0, impactIn: null }
        enter(s, 'spawning')
        events.push({ type: 'revive' }, { type: 'despawn' })
      }
      return
  }
}

/** Advances one fighter's swing. Returns true when the fight ended. */
function fighterStep(
  s: CombatState,
  side: Side,
  dt: number,
  rng: Rng,
  events: CombatEvent[],
): boolean {
  const self = side === 'player' ? s.player : s.monster
  const targetSide: Side = side === 'player' ? 'monster' : 'player'
  const target = side === 'player' ? s.monster : s.player

  self.cooldown -= dt

  if (self.impactIn !== null) {
    self.impactIn -= dt
    if (self.impactIn > 0) return false
    self.impactIn = null

    const result = rollAttack(self, target, rng)
    if (result.kind === 'miss') {
      events.push({ type: 'miss', target: targetSide })
      return false
    }
    target.hp = Math.max(0, target.hp - result.damage)
    events.push({
      type: 'hit',
      target: targetSide,
      amount: result.damage,
      crit: result.kind === 'crit',
    })
    if (target.hp > 0) return false

    target.impactIn = null
    events.push({ type: 'death', who: targetSide })
    if (targetSide === 'monster') {
      s.kills += 1
      enter(s, 'victory')
    } else {
      s.deaths += 1
      enter(s, 'defeat')
    }
    return true
  }

  if (self.cooldown <= 0) {
    self.cooldown += self.stats.attackInterval
    self.impactIn = TIMINGS.impactDelay
    events.push({ type: 'attack', source: side })
  }
  return false
}
