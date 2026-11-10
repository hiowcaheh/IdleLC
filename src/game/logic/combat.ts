/**
 * Auto-combat state machine. Pure: combatTick returns a new state and the events that happened.
 * The 3D scene only reacts to events — it never decides outcomes.
 *
 * spawning → (spawn) → approach → (engage) → fighting → victory → (despawn) → spawning …
 *                                               └─────→ defeat → (revive, despawn) → spawning …
 *
 * In a fight the hero uses its automatic skills (src/game/logic/skills.ts) when they are ready and
 * there is mana: heal when hurt, keep buffs up, weaken the monster, then the strongest attack. It
 * also drinks the potions it carries: healing / mana potions when low, recovery potions while hurt.
 */
import type { CombatStats, PotionDef } from '../data/types.ts'
import {
  COMBAT_MP_REGEN,
  OUT_OF_COMBAT_MP_REGEN,
  OUT_OF_COMBAT_REGEN,
  REGEN_TICK_SECONDS,
  rollAttack,
  skillDamageMultiplier,
} from './balance.ts'
import { chance, rollInt, type Rng } from './rng.ts'
import {
  ELEMENTAL_NAMES,
  ELEMENTAL_RECOVER_HP,
  SUMMON_DELAY,
  SUMMON_DURATION,
  elementalBlocks,
  type ElementalType,
} from './summons.ts'
import { naturalRecovery } from './recovery.ts'
import {
  applyStats,
  interpretEffect,
  type SkillKind,
  type SkillRank,
  type StatEffect,
} from './skills.ts'

export type Side = 'player' | 'monster'
export type CombatPhase = 'traveling' | 'spawning' | 'approach' | 'fighting' | 'victory' | 'defeat'

/** Phase durations and swing timing, in seconds. */
export const TIMINGS = {
  /** Going to another hunting spot (the hero runs there; no monster). */
  travel: 2.5,
  /** After a kill the hero goes straight on: the fallen monster sinks while the next one comes. */
  spawning: 0.5,
  approach: 1.3,
  victory: 1.2,
  defeat: 3.0,
  /** Time from the start of a swing to the moment the hit lands. */
  impactDelay: 0.4,
  /** Fraction of attackInterval the monster waits before its first swing. */
  monsterInitiative: 0.5,
} as const

/** The hero heals below this share of HP and restores mana below this share of MP. */
export const HEAL_BELOW = 0.6
export const MANA_BELOW = 0.4
/** The hero drinks a healing potion below this share of HP and a mana potion below this share of MP. */
export const HP_POTION_BELOW = 0.5
export const MP_POTION_BELOW = 0.3
/** Seconds between two poison ticks. */
export const POISON_TICK = 1

/** Largest simulated step; bigger dt values are split so event order stays correct. */
const MAX_STEP = 0.05

/** A phase has lasted its time (steps of 0.05 s add up to a hair under round numbers). */
const reached = (phaseTime: number, length: number) => phaseTime >= length - 1e-9
/** Tolerance for timers that add up many small steps. */
const EPSILON = 1e-6

export type PotionKind = PotionDef['kind']

/** Potions of one kind the hero carries into fights. */
export interface PotionSupply {
  itemId: number
  name: string
  count: number
  potion: PotionDef
  /**
   * Share of HP / MP (0–1) the hero drinks it below, from the quick slot's slider; unset: healing
   * below HP_POTION_BELOW, mana below MP_POTION_BELOW, recovery whenever the bar is not full.
   */
  below?: number
}

export interface FighterInit {
  level: number
  stats: CombatStats
  /** Active skills the fighter uses (the hero); passives are already in `stats`. */
  skills?: readonly SkillRank[]
  /** Potions the fighter drinks by itself (the hero). */
  potions?: readonly PotionSupply[]
  /** The stats an elemental gets when the hero summons it, by elemental (a Sorcerer's). */
  summonStats?: Partial<Record<ElementalType, CombatStats>>
}

/** A Sorcerer's elemental fighting at the hero's side (CElemental). */
export interface Summon {
  element: ElementalType
  name: string
  level: number
  stats: CombatStats
  hp: number
  /** Seconds until the next swing may start, and until the current one lands (null: idle). */
  cooldown: number
  impactIn: number | null
  /** Seconds before it leaves (SUMMON_DURATION). */
  remaining: number
  recoveryIn: number
  /** The monster's hate towards it. */
  hate: number
}

/** A buff, debuff, stun, poison or potion on a fighter. */
export interface ActiveEffect {
  /** The skill, or 0 for a potion. */
  skillId: number
  /** The potion (item id) that gives the effect. */
  itemId?: number
  potion?: PotionKind
  name: string
  /** Seconds left. */
  remaining: number
  stats: StatEffect[]
  stun: boolean
  state?: 'stone' | 'silence' | 'confusion' | 'hold'
  dotKind?: 'poison' | 'blood'
  mpChange?: { power: number; percent: boolean }
  /** Poison damage per tick. */
  poison: number
  /** Seconds until the next poison tick. */
  nextTick: number
  /** HP and MP restored per second (healing and mana potions). */
  hpPerSecond?: number
  mpPerSecond?: number
  /** A boost potion's SF_NOCANCEL: the hero's death does not end it. */
  keepOnDeath?: boolean
  /** The t_magic records (index and level) of the skill behind it, for CAssistList::CanApply. */
  magics?: readonly { magic: number; level: number }[]
  /** Free dungeon selections expire with the run and never become owned potion boosts. */
  dungeon?: true
  visual?: 'Angel_wing03'
  rewards?: { exp: number; sp: number; gold: number; drop: number }
  /** HP / MP steal potions (Battle.cpp hcHPSteelPotion / hcMPSteelPotion). */
  steal?: 'hp' | 'mp'
  /** Berserker Potion: 10% of the hero's hits on a monster deal double (hcAttackBerserker). */
  berserker?: true
}

export interface Fighter extends FighterInit {
  hp: number
  mp: number
  /** Recovery has its own server-pulse clock, independent of casts and render frames. */
  recoveryIn: number
  combatMode: boolean
  /** Seconds until the next swing or cast may start. */
  cooldown: number
  /** Seconds until the current swing or cast lands, or null when idle. */
  impactIn: number | null
  /** Skill being cast (lands with impactIn), or null for a normal swing. */
  casting: SkillRank | null
  /** Seconds before each skill can be used again, by skill id. */
  skillCooldowns: Record<number, number>
  /** Seconds before another potion of the kind can be drunk. */
  /** Seconds until a potion of the kind (a boost: of the skill, `boost:<skill>`) may be drunk. */
  potionCooldowns: Partial<Record<string, number>>
  /** Potions drunk and not yet taken off the supply (takePotionsUsed), by item id. */
  potionsUsed: Record<number, number>
  effects: ActiveEffect[]
  /** The hero's elementals. */
  summons?: Summon[]
  /** Seconds before an elemental of the kind may come again (SUMMON_DELAY). */
  summonDelay?: Partial<Record<ElementalType, number>>
  /** The monster's hate towards the hero (its NPC attack list), reset for each new monster. */
  hate?: number
  /** The monster: the elemental its current swing or cast is aimed at (none: the hero). */
  aimAt?: ElementalType
}

export interface CombatState {
  /** Present only for a timed single encounter; ordinary hunting keeps no extra clock. */
  encounterClock?: EncounterClock
  phase: CombatPhase
  /** Seconds spent in the current phase. */
  phaseTime: number
  /** Going to another spot: metres of the run (the route over the map) and metres run so far. */
  travel?: { distance: number; done: number }
  /**
   * Fighting a hero who shoots from range: metres the monster still runs before it can strike
   * (absent once it is there, and for heroes who walk up to the monster).
   */
  closing?: number
  player: Fighter
  monster: Fighter
  monsterId: string
  kills: number
  deaths: number
}

export interface EncounterClock {
  started: boolean
  seconds: number
  assisted: boolean
}

export type EffectKind = 'buff' | 'debuff' | 'stun' | 'poison'

export type CombatEvent =
  | { type: 'spawn'; monsterId: string }
  /** The fight starts; `gap`: metres the monster runs in while a ranged hero already shoots. */
  | { type: 'engage'; gap?: number }
  /** `at`: the monster swings at this elemental instead of the hero. */
  | { type: 'attack'; source: Side; at?: ElementalType }
  | {
      type: 'cast'
      source: Side
      skillId: number
      name: string
      kind: SkillKind
      /** Seconds until it lands. */
      castTime: number
      /** Seconds of wind-up before the release starts. */
      windUp: number
      /** Seconds the release clip plays (the hero's skills with a client clip). */
      releaseTime?: number
      at?: ElementalType
    }
  | {
      type: 'hit'
      target: Side
      amount: number
      crit: boolean
      deadly?: boolean
      skill?: boolean
      poison?: boolean
      /** Damage a Combat Reflection sent back. */
      reflected?: boolean
      /** Dealt by this elemental of the hero. */
      by?: ElementalType
    }
  | { type: 'miss'; target: Side; by?: ElementalType }
  /** An elemental comes, swings, is hit or missed by the monster, leaves or falls. */
  | { type: 'summon'; element: ElementalType; name: string }
  | { type: 'summonAttack'; element: ElementalType }
  | { type: 'summonHit'; element: ElementalType; amount: number; crit: boolean }
  | { type: 'summonMiss'; element: ElementalType }
  | { type: 'summonGone'; element: ElementalType; died: boolean }
  /** A Charge cancelled the skill the fighter was readying. */
  | { type: 'interrupt'; target: Side; skillId: number }
  | { type: 'heal'; target: Side; amount: number; mana?: boolean }
  | { type: 'effect'; target: Side; skillId: number; name: string; kind: EffectKind }
  | { type: 'potion'; itemId: number; name: string; kind: PotionKind }
  | { type: 'death'; who: Side }
  | { type: 'despawn' }
  | { type: 'revive' }
  /** The hero sets off to another hunting spot / gets there. */
  | { type: 'travel' }
  | { type: 'arrive' }

export interface TickResult {
  state: CombatState
  events: CombatEvent[]
}

export function freshFighter(init: FighterInit): Fighter {
  return {
    level: init.level,
    stats: init.stats,
    skills: init.skills,
    potions: init.potions,
    hp: init.stats.maxHp,
    mp: init.stats.maxMp ?? 0,
    recoveryIn: REGEN_TICK_SECONDS,
    combatMode: false,
    cooldown: 0,
    impactIn: null,
    casting: null,
    skillCooldowns: {},
    potionCooldowns: {},
    potionsUsed: {},
    effects: [],
    ...(init.summonStats ? { summonStats: init.summonStats } : {}),
  }
}

/** A copy that can be changed without touching the original (combatTick is pure). */
export function copyFighter(f: Fighter): Fighter {
  return {
    ...f,
    skillCooldowns: { ...f.skillCooldowns },
    potionCooldowns: { ...f.potionCooldowns },
    potionsUsed: { ...f.potionsUsed },
    effects: f.effects.map((e) => ({ ...e })),
    ...(f.summons ? { summons: f.summons.map((x) => ({ ...x })) } : {}),
    ...(f.summonDelay ? { summonDelay: { ...f.summonDelay } } : {}),
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

/**
 * Whether an effect only hurts or hinders its fighter (a curse, stun, poison, a lower stat):
 * those stay until they run out; buffs and potions can be taken off.
 */
export function isHarmful(effect: ActiveEffect): boolean {
  return (
    effect.stun ||
    effect.state !== undefined ||
    effect.poison > 0 ||
    effect.mpChange !== undefined ||
    effect.stats.some((s) =>
      s.stat === 'castTime' || s.stat === 'reuseTime' ? s.value > 0 : s.value < 0,
    )
  )
}

/** Takes a buff or potion effect off a fighter (by its skill, or by its potion's item). */
export function removeEffect(
  state: CombatState,
  side: Side,
  which: { skillId: number; itemId?: number },
): CombatState | null {
  const fighter = state[side]
  const match = (e: ActiveEffect) =>
    which.itemId !== undefined
      ? e.itemId === which.itemId
      : e.itemId === undefined && e.skillId === which.skillId
  const effect = fighter.effects.find(match)
  if (!effect || isHarmful(effect)) return null
  const next = copyFighter(fighter)
  next.effects = fighter.effects.filter((e) => !match(e))
  // HP and MP may not stay above a lowered maximum
  const stats = effectiveStats(next)
  next.hp = Math.min(next.hp, stats.maxHp)
  next.mp = Math.min(next.mp, stats.maxMp ?? 0)
  return { ...state, [side]: next }
}

/**
 * CAssistList::CanApply (Assist.cpp:180–215): an effect can't land while one with the same magic
 * at a higher level works (Super Haste's run speed keeps out the Potion of Haste's).
 */
export function strongerWorking(
  f: Pick<Fighter, 'effects'>,
  magics: readonly { magic: number; level: number }[] | undefined,
): boolean {
  if (!magics?.length) return false
  return f.effects.some((e) =>
    e.magics?.some((m) => magics.some((n) => n.magic === m.magic && n.level < m.level)),
  )
}

/** CAssistList::DelDuplicate: what an effect with these magics replaces (same magic). */
function sharesMagic(
  effect: ActiveEffect,
  magics: readonly { magic: number; level: number }[] | undefined,
): boolean {
  return !!magics?.length && !!effect.magics?.some((m) => magics.some((n) => n.magic === m.magic))
}

/** Whether a buff or potion on the fighter makes it run faster (the scene's smoke at its feet). */
export function hasRunBoost(fighter: Pick<Fighter, 'effects'>): boolean {
  return fighter.effects.some((e) =>
    e.stats.some((s) => (s.stat === 'runSpeed' || s.stat === 'moveSpeed') && s.value > 0),
  )
}

export function isStunned(f: Fighter): boolean {
  return f.effects.some((e) => e.stun || e.state === 'stone')
}

/** Mana a skill costs the fighter (rare option "Decrease MP Consumption"). */
export function skillMpCost(rank: SkillRank, stats: CombatStats): number {
  // doFuncSkill.cpp:982–1001: need − trunc(need × option / 100), never below 0
  const cost = rank.mpCost
  const option = stats.mpCostReduction ?? 0
  return Math.max(0, option > 0 ? cost - Math.trunc((cost * option) / 100) : cost)
}

/**
 * Whether the fighter can pay for a skill now (doFuncSkill.cpp:980–1003,1664–1685): MP strictly
 * above the cost (even a free skill needs some), HP above an HP cost when there is one. Checked
 * when the skill is chosen and again when it fires.
 */
export function canPaySkill(f: Pick<Fighter, 'hp' | 'mp'>, rank: SkillRank, stats: CombatStats) {
  return f.mp > skillMpCost(rank, stats) && (rank.hpCost === 0 || f.hp > rank.hpCost)
}

/** Skill preparation and reuse are shared by the battle and its details window. */
/**
 * The client's skill animation speed, (100 − skill speed) / 100 (Player.es SkillAnimationEx): a
 * cast speed of 20% plays the release in 80% of its time. Never below a fifth (own guard: the
 * animation always plays).
 */
export function skillAnimationPace(stats: CombatStats): number {
  return Math.max(0.2, 1 - (stats.castSpeed ?? 0) / 100)
}

/**
 * The release of a skill once its wind-up is over: when its blow lands and when the hero is free
 * again (seconds from the release). With the client's clip the whole clip plays, at the cast speed,
 * and the blow lands at its moment in it; without one it lands like a swing.
 */
export function skillRelease(
  rank: Pick<SkillRank, 'motion'>,
  stats: CombatStats,
): { impact: number; done: number } {
  const motion = rank.motion
  if (!motion) return { impact: TIMINGS.impactDelay, done: TIMINGS.impactDelay }
  const pace = skillAnimationPace(stats)
  const done = motion.fire * pace
  const impact =
    motion.impact !== undefined ? motion.impact * pace : Math.min(TIMINGS.impactDelay, done)
  return { impact, done }
}

export function skillPreparationTime(rank: SkillRank, stats: CombatStats): number {
  return Math.max(0, rank.castTime * (1 - (stats.castSpeed ?? 0) / 100) + (stats.castTime ?? 0))
}

export function skillCooldownTime(rank: SkillRank, stats: CombatStats): number {
  // the 100 Cooldown Reduction Potion: no cooldown at all (own rule, owner's request 2026-11-05)
  if (stats.cooldownFree && !rank.fixedCooldown) return 0
  let pulses = rank.cooldown * 10
  if (!rank.fixedCooldown) {
    pulses += (stats.reuseTime ?? 0) * 10
    const prob = stats.cooldownReduction ?? 0
    if (prob !== 0) pulses *= ((150 / (150 + prob)) * 100) / (100 + prob)
  }
  if (pulses < 1) pulses = 10
  return Math.ceil(pulses - 1e-9) / 10
}

/** Seconds the hero runs to a new monster (rare option "Move Speed" makes it shorter). */
export function approachTime(state: Pick<CombatState, 'player'>): number {
  return movementTime(TIMINGS.approach, effectiveStats(state.player))
}

/**
 * The fastest a hero (and an elemental) runs, in metres a second, whatever potions, buffs and
 * options add: the owner's fixed rule, in fights, on expeditions and in dungeons alike.
 */
export const MAX_RUN_SPEED = 20

/**
 * Run speed in metres a second: a hero's with the class's base and its option and assist bonuses
 * (at most MAX_RUN_SPEED), a monster's from the database.
 */
export function runSpeed(stats: CombatStats): number {
  const monster = stats.client === undefined && stats.npcRunSpeed !== undefined
  const speed =
    stats.client?.runSpeed ??
    (stats.npcRunSpeed ?? BASE_RUN_SPEED) * (1 + (stats.moveSpeed ?? 0) / 100)
  return Math.max(0.1, monster ? speed : Math.min(MAX_RUN_SPEED, speed))
}

/**
 * Heroes whose attack reaches further than this (metres) fight from where they stand: Healer 20,
 * Mage 15, a Rogue with a crossbow 15. Titan, Knight, a Rogue with daggers (2.3) and Sorcerer (3)
 * walk up to the monster.
 */
export const RANGED_REACH = 5

/**
 * Metres a monster runs before it can strike a hero who fights from range: the hero opens fire at
 * its attack range and the monster comes on until it is within its own (MobActivity.cpp MobMoveTo:
 * the distance less the attack range). 0 for heroes who walk up to the monster.
 */
export function openingGap(
  player: Pick<Fighter, 'stats'>,
  monster: Pick<Fighter, 'stats'>,
): number {
  const reach = player.stats.attackRange ?? 0
  if (reach <= RANGED_REACH) return 0
  return Math.max(0, reach - (monster.stats.attackRange ?? 0))
}

/** Run speed of a hero without a client sheet (metres a second; the source's Titan and Knight). */
const BASE_RUN_SPEED = 6

/** Run speed in metres/second drives both kinds of movement, including class and assist bonuses. */
export function movementTime(secondsAtBaseSpeed: number, stats: CombatStats): number {
  return (secondsAtBaseSpeed * BASE_RUN_SPEED) / runSpeed(stats)
}

/** Metres of a run to another spot when its route is unknown (a zone drawn without a map). */
export const TRAVEL_METRES = TIMINGS.travel * BASE_RUN_SPEED

/** Seconds a whole run to another spot takes at the hero's run speed now. */
export function travelTime(state: Pick<CombatState, 'player' | 'travel'>): number {
  return (state.travel?.distance ?? TRAVEL_METRES) / runSpeed(effectiveStats(state.player))
}

/** Seconds the run to another spot still takes at the hero's run speed now; 0 outside a run. */
export function travelSecondsLeft(state: Pick<CombatState, 'phase' | 'player' | 'travel'>): number {
  if (state.phase !== 'traveling') return 0
  const left = (state.travel?.distance ?? TRAVEL_METRES) - (state.travel?.done ?? 0)
  return Math.max(0, left) / runSpeed(effectiveStats(state.player))
}

/** How far through its run to another spot the hero is (0…1); 1 outside a run. */
export function travelProgress(
  state: Pick<CombatState, 'phase' | 'player' | 'travel'>,
  extraSeconds = 0,
): number {
  if (state.phase !== 'traveling') return 1
  const distance = state.travel?.distance ?? TRAVEL_METRES
  if (distance <= 0) return 1
  const blocked = isStunned(state.player) || state.player.effects.some((e) => e.state === 'hold')
  const ahead = blocked ? 0 : extraSeconds * runSpeed(effectiveStats(state.player))
  return Math.min(1, ((state.travel?.done ?? 0) + ahead) / distance)
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
    effects: f.effects.filter((e) => e.keepOnDeath),
  }
}

/**
 * Switch to a different monster; the current one disappears, the hero runs `distance` metres to it
 * (its route over the map; TRAVEL_METRES when unknown) and it spawns.
 */
export function changeMonster(
  state: CombatState,
  monsterId: string,
  monster: FighterInit,
  distance: number = TRAVEL_METRES,
): TickResult {
  const events: CombatEvent[] =
    state.phase === 'spawning' || state.phase === 'traveling' ? [] : [{ type: 'despawn' }]
  let player: Fighter = { ...copyFighter(state.player), cooldown: 0, impactIn: null, casting: null }
  if (state.phase === 'defeat') {
    player = revived(player)
    events.unshift({ type: 'revive' })
  }
  events.push({ type: 'travel' })
  return {
    state: {
      ...state,
      phase: 'traveling',
      phaseTime: 0,
      travel: { distance: Math.max(0, distance), done: 0 },
      player,
      monster: freshFighter(monster),
      monsterId,
    },
    events,
  }
}

/**
 * Replace player level, stats, skills and potions (level up, new skill, potions bought), keeping the
 * HP and MP ratios. Potions drunk since the last takePotionsUsed still count against the new supply.
 */
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
      potions: player.potions,
      summonStats: player.summonStats,
      hp: old.hp <= 0 ? 0 : Math.max(1, Math.round(player.stats.maxHp * hpRatio)),
      mp: oldMaxMp > 0 ? Math.round((maxMp * old.mp) / oldMaxMp) : maxMp,
    },
  }
}

/** Potions of a supply entry the fighter still has. */
export function potionsLeft(f: Fighter, supply: PotionSupply): number {
  return Math.max(0, supply.count - (f.potionsUsed[supply.itemId] ?? 0))
}

/**
 * Takes the potions the hero drank off its supply and returns them (to be reported to the service,
 * which removes them from the inventory).
 */
export function takePotionsUsed(state: CombatState): {
  state: CombatState
  used: { itemId: number; count: number }[]
} {
  const player = state.player
  const used = Object.entries(player.potionsUsed)
    .map(([id, count]) => ({ itemId: Number(id), count }))
    .filter((u) => u.count > 0)
    .sort((a, b) => a.itemId - b.itemId)
  if (used.length === 0) return { state, used }
  return {
    state: {
      ...state,
      player: {
        ...copyFighter(player),
        potions: player.potions?.map((p) => ({ ...p, count: potionsLeft(player, p) })),
        potionsUsed: {},
      },
    },
    used,
  }
}

/**
 * A new fight after time away from the screen (an expedition): the hero keeps the share of HP and MP
 * it had in `previous` and regenerates as out of combat for `awaySeconds` — leaving and coming back
 * at once heals nothing.
 */
export function carryVitals(
  previous: CombatState,
  next: CombatState,
  awaySeconds: number,
): CombatState {
  const before = previous.player
  const beforeStats = effectiveStats(before)
  const stats = next.player.stats
  const maxMp = stats.maxMp ?? 0
  const share = (value: number, max: number) => (max > 0 ? Math.max(0, value) / max : 1)
  const seconds = Math.max(0, awaySeconds)
  const hp = stats.maxHp * (share(before.hp, beforeStats.maxHp) + OUT_OF_COMBAT_REGEN * seconds)
  const mp = maxMp * (share(before.mp, beforeStats.maxMp ?? 0) + OUT_OF_COMBAT_MP_REGEN * seconds)
  return {
    ...next,
    player: {
      ...next.player,
      hp: Math.max(1, Math.min(stats.maxHp, Math.round(hp))),
      mp: Math.min(maxMp, Math.round(mp)),
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

export function combatTick(
  state: CombatState,
  dt: number,
  rng: Rng,
  singleEncounter = false,
): TickResult {
  const s = copyState(state)
  const events: CombatEvent[] = []
  let remaining = Math.max(0, dt)
  while (remaining > 0) {
    if (singleEncounter && (s.phase === 'victory' || s.phase === 'defeat')) break
    const step = Math.min(remaining, MAX_STEP)
    remaining -= step
    const fighting = s.phase === 'fighting'
    const eventFrom = events.length
    advance(s, step, rng, events)
    if (s.encounterClock && fighting) {
      const clock = s.encounterClock
      const attacks = events
        .slice(eventFrom)
        .some(
          (e) =>
            (e.type === 'attack' && e.source === 'player') ||
            (e.type === 'cast' &&
              e.source === 'player' &&
              (e.kind === 'attack' || e.kind === 'debuff')) ||
            e.type === 'summonAttack',
        )
      s.encounterClock = {
        ...clock,
        started: clock.started || attacks,
        seconds: clock.seconds + (clock.started ? step : 0),
      }
    }
  }
  return { state: s, events }
}

/** Shared by the dungeon's many actors. Advance each actor's clocks exactly once per step. */
export function advanceActor(
  fighter: Fighter,
  side: Side,
  dt: number,
  events: CombatEvent[],
): void {
  tickCooldowns(fighter, dt)
  tickSummons(fighter, dt, events)
  regen(fighter, dt, true)
  for (const amount of tickEffects(fighter, dt)) {
    const damage = Math.min(Math.max(0, fighter.hp - 1), Math.max(0, Math.trunc(amount)))
    fighter.hp -= damage
    events.push({ type: 'hit', target: side, amount: damage, crit: false, poison: true })
  }
  if (side === 'player') drinkPotions(fighter, events)
}

/** Resolve one actor against its current target using the same source damage, skills and costs. */
export function actAgainst(
  state: CombatState,
  side: Side,
  dt: number,
  rng: Rng,
  events: CombatEvent[],
  inRange: boolean,
  distance?: number,
): SkillRank | null {
  if (side === 'player' && inRange) summonsStep(state, dt, rng, events)
  if (state.monster.hp <= 0 || state.player.hp <= 0) return null
  const self = state[side]
  const rank = self.casting
  const fires =
    rank &&
    self.impactIn !== null &&
    self.impactIn <= dt &&
    !isStunned(self) &&
    canPaySkill(self, rank, effectiveStats(self))
  fighterStep(state, side, dt, rng, events, inRange, distance)
  return fires ? rank : null
}

/** Additional targets of the same paid cast; each gets its own source hit/damage/effect rolls. */
export function landAreaSkill(
  state: CombatState,
  rank: SkillRank,
  rng: Rng,
  events: CombatEvent[],
): void {
  landSkill(state, 'player', rank, rng, events)
}

function enter(s: CombatState, phase: CombatPhase): void {
  s.phase = phase
  s.phaseTime = 0
  delete s.closing
}

/**
 * The fight begins: the hero swings at once, the monster after its initiative. `gap`: metres the
 * monster still runs in (a hero fighting from range), during which only the hero strikes.
 */
function engage(s: CombatState, events: CombatEvent[], gap: number): void {
  s.player.cooldown = 0
  s.player.impactIn = null
  s.player.casting = null
  s.monster.cooldown = s.monster.stats.attackInterval * TIMINGS.monsterInitiative
  s.monster.impactIn = null
  enter(s, 'fighting')
  s.player.combatMode = true
  if (gap > 0) s.closing = gap
  events.push(gap > 0 ? { type: 'engage', gap } : { type: 'engage' })
}

/**
 * The monster runs in at its speed (not while stunned or held). True when it is within reach and
 * may act this step.
 */
function closeIn(s: CombatState, dt: number): boolean {
  if (s.closing === undefined) return true
  const held = isStunned(s.monster) || s.monster.effects.some((e) => e.state === 'hold')
  const left = held ? s.closing : s.closing - dt * runSpeed(effectiveStats(s.monster))
  if (left > EPSILON) s.closing = left
  else delete s.closing
  return false
}

/**
 * HP and MP regeneration: a lot out of combat, only MP (and skill bonuses) during a fight; healing
 * and mana potions restore their amount per second wherever the hero is.
 */
function regen(f: Fighter, dt: number, inCombat: boolean): void {
  const stats = effectiveStats(f)
  let hpPotions = 0
  let mpPotions = 0
  for (const e of f.effects) {
    hpPotions += e.hpPerSecond ?? 0
    mpPotions += e.mpPerSecond ?? 0
  }
  if (stats.clientContext) {
    f.recoveryIn -= dt
    while (f.recoveryIn <= EPSILON) {
      f.recoveryIn += REGEN_TICK_SECONDS
      const recovered = naturalRecovery(stats, inCombat || f.combatMode)
      f.hp = Math.min(stats.maxHp, f.hp + recovered.hp)
      f.mp = Math.min(stats.maxMp ?? 0, f.mp + recovered.mp)
    }
    f.hp = Math.min(stats.maxHp, f.hp + hpPotions * dt)
    f.mp = Math.min(stats.maxMp ?? 0, f.mp + mpPotions * dt)
    return
  }
  const hpRate =
    (inCombat ? 0 : stats.maxHp * OUT_OF_COMBAT_REGEN) +
    (stats.hpRegen ?? 0) / REGEN_TICK_SECONDS +
    hpPotions
  f.hp = Math.min(stats.maxHp, Math.max(f.hp, f.hp + hpRate * dt))
  const maxMp = stats.maxMp ?? 0
  if (maxMp > 0) {
    const share = inCombat ? COMBAT_MP_REGEN : OUT_OF_COMBAT_MP_REGEN
    const mpRate = maxMp * share + (stats.mpRegen ?? 0) / REGEN_TICK_SECONDS + mpPotions
    f.mp = Math.min(maxMp, Math.max(f.mp, f.mp + mpRate * dt))
  }
}

/** Skill and potion cooldowns run all the time. */
function tickCooldowns(f: Fighter, dt: number): void {
  for (const id in f.skillCooldowns) {
    const left = f.skillCooldowns[id]! - dt
    if (left > 0) f.skillCooldowns[id] = left
    else delete f.skillCooldowns[id]
  }
  for (const key in f.potionCooldowns) {
    const left = f.potionCooldowns[key]! - dt
    if (left > 0) f.potionCooldowns[key] = left
    else delete f.potionCooldowns[key]
  }
}

/** Counts down buffs and debuffs; returns the poison damage of the ticks that happened. */
function tickEffects(f: Fighter, dt: number): number[] {
  if (f.effects.length === 0) return []
  const poison: number[] = []
  for (const e of f.effects) {
    e.remaining -= dt
    if (e.poison <= 0 && !e.mpChange) continue
    e.nextTick -= dt
    while (e.nextTick <= EPSILON && e.remaining > -EPSILON) {
      if (e.poison > 0) poison.push(e.poison)
      if (e.mpChange) {
        const value = e.mpChange.percent
          ? Math.trunc(((f.stats.maxMp ?? 0) * e.mpChange.power) / 100)
          : e.mpChange.power
        const next = f.mp + value
        f.mp = Math.max(0, Math.min(f.stats.maxMp ?? 0, next))
        // MP_CANCEL ends the complete assist when it can no longer pay its upkeep.
        if (next < 0 || next > (f.stats.maxMp ?? 0)) e.remaining = 0
      }
      e.nextTick += POISON_TICK
    }
  }
  f.effects = f.effects.filter((e) => e.remaining > 0)
  return poison
}

function advance(s: CombatState, dt: number, rng: Rng, events: CombatEvent[]): void {
  const movementBlocked =
    (s.phase === 'traveling' || s.phase === 'approach') &&
    (isStunned(s.player) || s.player.effects.some((e) => e.state === 'hold'))
  if (!movementBlocked) s.phaseTime += dt
  tickCooldowns(s.player, dt)
  tickSummons(s.player, dt, events)
  if (s.phase !== 'fighting' && s.phase !== 'defeat') poisonStep(s, 'player', dt, events)

  switch (s.phase) {
    case 'traveling': {
      regen(s.player, dt, true)
      // the hero drinks on the way too, to arrive healed (owner's rule, 2026-11-07)
      drinkPotions(s.player, events)
      // metres at the speed of the moment: a speed potion drunk on the way shortens what is left
      const run = s.travel ?? { distance: TRAVEL_METRES, done: 0 }
      const done = movementBlocked ? run.done : run.done + dt * runSpeed(effectiveStats(s.player))
      s.travel = { distance: run.distance, done }
      if (done >= run.distance - EPSILON) {
        enter(s, 'spawning')
        delete s.travel
        events.push({ type: 'arrive' })
      }
      return
    }

    case 'spawning':
      regen(s.player, dt, false)
      drinkPotions(s.player, events)
      if (reached(s.phaseTime, TIMINGS.spawning)) {
        s.monster = freshFighter(s.monster)
        // a new monster: an empty attack list
        s.player.hate = 0
        for (const x of s.player.summons ?? []) x.hate = 0
        events.push({ type: 'spawn', monsterId: s.monsterId })
        // a hero who fights from range opens fire while the monster comes on; others walk up
        const gap = openingGap(s.player, s.monster)
        if (gap > 0) engage(s, events, gap)
        else enter(s, 'approach')
      }
      return

    case 'approach':
      regen(s.player, dt, true)
      drinkPotions(s.player, events)
      if (reached(s.phaseTime, approachTime(s))) engage(s, events, 0)
      return

    case 'fighting':
      regen(s.player, dt, true)
      drinkPotions(s.player, events)
      if (poisonStep(s, 'player', dt, events)) return
      if (poisonStep(s, 'monster', dt, events)) return
      if (fighterStep(s, 'player', dt, rng, events)) return
      // still running in towards a hero who shoots from range: it can't strike yet
      if (!closeIn(s, dt)) return
      if (summonsStep(s, dt, rng, events)) return
      fighterStep(s, 'monster', dt, rng, events)
      return

    case 'victory':
      regen(s.player, dt, false)
      drinkPotions(s.player, events)
      if (reached(s.phaseTime, TIMINGS.victory)) {
        enter(s, 'spawning')
        events.push({ type: 'despawn' })
      }
      return

    case 'defeat':
      if (reached(s.phaseTime, TIMINGS.defeat)) {
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
  delete s.monster.aimAt
  for (const x of s.player.summons ?? []) x.impactIn = null
  events.push({ type: 'death', who: loser })
  if (loser === 'monster') {
    s.kills += 1
    s.monster.effects = []
    enter(s, 'victory')
  } else {
    s.deaths += 1
    // the server clears the hero's buffs at death, but not SF_NOCANCEL ones (Assist.cpp ClearAssist)
    s.player.effects = s.player.effects.filter((e) => e.keepOnDeath)
    // and sends the elementals away (Battle_ProcDead_PC.cpp:567–568)
    for (const x of [...(s.player.summons ?? [])]) dismiss(s.player, x.element, false, events)
    enter(s, 'defeat')
  }
}

/** Effect timers and poison damage on one fighter. Returns true when the fight ended. */
function poisonStep(s: CombatState, side: Side, dt: number, events: CombatEvent[]): boolean {
  const f = side === 'player' ? s.player : s.monster
  for (const amount of tickEffects(f, dt)) {
    const damage = Math.min(Math.max(0, f.hp - 1), Math.max(0, Math.trunc(amount)))
    f.hp = Math.max(1, f.hp - damage)
    events.push({ type: 'hit', target: side, amount: damage, crit: false, poison: true })
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
  inRange = true,
  distance?: number,
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
    if (!skill) return landSwing(s, side, rng, events)
    // FIRE: the costs are checked again and paid only now (doFuncSkill.cpp:1664,1804–1807), so
    // a cast a stun cut short costs nothing
    const stats = effectiveStats(self)
    if (!canPaySkill(self, skill, stats)) return false
    self.mp -= skillMpCost(skill, stats)
    self.hp -= skill.hpCost
    return landSkill(s, side, skill, rng, events)
  }

  if (self.cooldown <= 0) {
    const stats = effectiveStats(self)
    const skill = chooseSkill(
      distance === undefined && inRange
        ? self
        : {
            ...self,
            skills: self.skills?.filter(
              (r) =>
                !r.offensive ||
                (inRange &&
                  (distance === undefined ||
                    r.range === undefined ||
                    distance <= Math.max(1.8, r.range))),
            ),
          },
      target,
      rng,
    )
    if (!skill && !inRange) return false
    // the monster turns on whom it hates most as it starts the swing or the cast
    if (side === 'monster') {
      const aim = aimFor(s)
      if (aim === undefined) delete self.aimAt
      else self.aimAt = aim
    }
    const at = side === 'monster' && self.aimAt !== undefined ? { at: self.aimAt } : {}
    if (skill) {
      // wind-up (shortened by cast speed), then the release: the blow lands at its moment and
      // the hero acts again only when the whole release animation has played
      const windUp = skillPreparationTime(skill, stats)
      const release = skillRelease(skill, stats)
      const landsIn = windUp + release.impact
      // the cooldown runs from READY (Skill.cpp:803); MP and HP are paid at FIRE
      self.skillCooldowns[skill.id] = skillCooldownTime(skill, stats)
      self.casting = skill
      self.impactIn = landsIn
      self.cooldown += Math.max(stats.attackInterval, windUp + release.done)
      events.push({
        type: 'cast',
        source: side,
        skillId: skill.id,
        name: skill.name,
        kind: skill.kind,
        castTime: landsIn,
        windUp,
        ...(skill.motion ? { releaseTime: release.done } : {}),
        ...at,
      })
    } else {
      self.cooldown += stats.attackInterval
      self.impactIn = TIMINGS.impactDelay
      events.push({ type: 'attack', source: side, ...at })
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
  power?: { power: number; type: number },
  attackType?: CombatStats['attackType'],
): boolean | null {
  const self = side === 'player' ? s.player : s.monster
  if (side === 'monster' && s.monster.aimAt !== undefined)
    return strikeSummon(s, s.monster.aimAt, rng, events, multiplier, skill, power, attackType)
  const targetSide: Side = side === 'player' ? 'monster' : 'player'
  const target = side === 'player' ? s.monster : s.player
  const selected = attackStats(self, attackType)
  const result = rollAttack(
    { level: self.level, stats: selected },
    { level: target.level, stats: effectiveStats(target) },
    rng,
    multiplier,
    skill,
    power,
  )
  if (result.kind === 'miss') {
    events.push({ type: 'miss', target: targetSide })
    return null
  }
  if (multiplier <= 0) return false
  // Berserker Potion: 10% of the hero's hits on a monster deal double (Battle_GetDamage.cpp)
  if (side === 'player' && self.effects.some((e) => e.berserker && e.remaining > 0))
    if (rng() < 0.1) result.damage *= 2
  target.hp = Math.max(0, target.hp - result.damage)
  if (side === 'player') addHate(s, s.player, result.damage)
  steal(self, result.damage, rng)
  events.push({
    type: 'hit',
    target: targetSide,
    amount: result.damage,
    crit: result.kind === 'crit',
    ...(result.kind === 'deadly' ? { deadly: true } : {}),
    ...(skill ? { skill } : {}),
  })
  if (target.hp > 0) return reflect(s, side, rng, events, result.damage)
  endFight(s, targetSide, events)
  return true
}

/** The attack a fighter makes with a skill of the given attack type (or its normal one). */
function attackStats(self: Fighter, attackType?: CombatStats['attackType']): CombatStats {
  const original = effectiveStats(self)
  return attackType
    ? {
        ...original,
        attackType,
        attack:
          attackType === 'magic'
            ? (original.magicAttack ?? original.attack)
            : (original.client?.physicalAttack ?? original.physicalAttack ?? original.attack),
        hit:
          attackType === 'magic'
            ? (original.magicHit ?? original.hit)
            : (original.client?.physicalHit ?? original.physicalHit ?? original.hit),
      }
    : original
}

/** Battle.cpp:1319 HATE_FIRST_ATTACK: the first to hurt a monster tops its list. */
const HATE_FIRST_ATTACK = 1500

/**
 * ApplyHateByDamage (Battle.cpp:1335–1357): 10 000 × damage / the monster's maximum HP, at least 1,
 * and HATE_FIRST_ATTACK more for whoever hurts it first.
 */
function addHate(s: CombatState, who: { hate?: number }, damage: number): void {
  const listed = (s.player.hate ?? 0) > 0 || (s.player.summons ?? []).some((x) => x.hate > 0)
  const maxHp = effectiveStats(s.monster).maxHp
  who.hate =
    (who.hate ?? 0) +
    Math.max(1, Math.trunc((10000 * damage) / maxHp)) +
    (listed ? 0 : HATE_FIRST_ATTACK)
}

/** The monster turns on whoever it hates most (Battle.cpp:2606–2609); the hero when none is ahead. */
function aimFor(s: CombatState): ElementalType | undefined {
  let top = s.player.hate ?? 0
  let aim: ElementalType | undefined
  for (const x of s.player.summons ?? []) {
    if (x.hate > top) {
      top = x.hate
      aim = x.element
    }
  }
  return aim
}

/** The monster's swing or skill on an elemental: damage only. Null when it missed or is gone. */
function strikeSummon(
  s: CombatState,
  element: ElementalType,
  rng: Rng,
  events: CombatEvent[],
  multiplier: number,
  skill: boolean,
  power?: { power: number; type: number },
  attackType?: CombatStats['attackType'],
): boolean | null {
  const summon = s.player.summons?.find((x) => x.element === element)
  if (!summon) return null
  const result = rollAttack(
    { level: s.monster.level, stats: attackStats(s.monster, attackType) },
    { level: summon.level, stats: summon.stats },
    rng,
    multiplier,
    skill,
    power,
  )
  if (result.kind === 'miss') {
    events.push({ type: 'summonMiss', element })
    return null
  }
  if (multiplier <= 0) return false
  summon.hp = Math.max(0, summon.hp - result.damage)
  events.push({
    type: 'summonHit',
    element,
    amount: result.damage,
    crit: result.kind === 'crit' || result.kind === 'deadly',
  })
  // Battle_ProcDead_Elemental.cpp:55: a fallen elemental is sent away
  if (summon.hp <= 0) dismiss(s.player, element, true, events)
  return false
}

/** UnsummonElemental (PC.cpp:5207–5246): it leaves and SUMMON_DELAY starts for its kind. */
function dismiss(
  hero: Fighter,
  element: ElementalType,
  died: boolean,
  events: CombatEvent[],
): void {
  if (!hero.summons?.some((x) => x.element === element)) return
  hero.summons = hero.summons.filter((x) => x.element !== element)
  hero.summonDelay = { ...hero.summonDelay, [element]: SUMMON_DELAY }
  events.push({ type: 'summonGone', element, died })
}

/** CanSummonElemental: its kind is not waiting out SUMMON_DELAY and nothing present blocks it. */
export function canSummon(
  hero: Pick<Fighter, 'summons' | 'summonDelay' | 'summonStats'>,
  element: ElementalType,
): boolean {
  return (
    hero.summonStats?.[element] !== undefined &&
    !(hero.summonDelay?.[element] ?? 0) &&
    !(hero.summons ?? []).some((x) => elementalBlocks(x.element, element))
  )
}

/** SummonElemental (PC.cpp:5140–5205): it comes at full HP with the stats of this moment. */
function summonElemental(hero: Fighter, element: ElementalType, events: CombatEvent[]): void {
  const stats = hero.summonStats?.[element]
  if (!stats || !canSummon(hero, element)) return
  hero.summons = [
    ...(hero.summons ?? []),
    {
      element,
      name: ELEMENTAL_NAMES[element],
      level: hero.level,
      stats,
      hp: stats.maxHp,
      cooldown: 0,
      impactIn: null,
      remaining: SUMMON_DURATION,
      recoveryIn: REGEN_TICK_SECONDS,
      hate: 0,
    },
  ]
  events.push({ type: 'summon', element, name: ELEMENTAL_NAMES[element] })
}

/** Time passes for the elementals in every phase: they leave after 20 minutes and recover HP. */
function tickSummons(hero: Fighter, dt: number, events: CombatEvent[]): void {
  if (hero.summonDelay) {
    for (const key of Object.keys(hero.summonDelay)) {
      const element = Number(key) as ElementalType
      const left = (hero.summonDelay[element] ?? 0) - dt
      if (left > EPSILON) hero.summonDelay[element] = left
      else delete hero.summonDelay[element]
    }
  }
  for (const x of [...(hero.summons ?? [])]) {
    x.remaining -= dt
    if (x.remaining <= EPSILON) {
      dismiss(hero, x.element, false, events)
      continue
    }
    x.recoveryIn -= dt
    while (x.recoveryIn <= EPSILON) {
      x.recoveryIn += REGEN_TICK_SECONDS
      x.hp = Math.min(x.stats.maxHp, x.hp + ELEMENTAL_RECOVER_HP)
    }
  }
}

/** The elementals swing at the monster. Returns true when one of them killed it. */
function summonsStep(s: CombatState, dt: number, rng: Rng, events: CombatEvent[]): boolean {
  for (const x of [...(s.player.summons ?? [])]) {
    x.cooldown -= dt
    if (x.impactIn !== null) {
      x.impactIn -= dt
      if (x.impactIn > 0) continue
      x.impactIn = null
      const result = rollAttack(
        { level: x.level, stats: x.stats },
        { level: s.monster.level, stats: effectiveStats(s.monster) },
        rng,
      )
      if (result.kind === 'miss') {
        events.push({ type: 'miss', target: 'monster', by: x.element })
        continue
      }
      s.monster.hp = Math.max(0, s.monster.hp - result.damage)
      addHate(s, x, result.damage)
      events.push({
        type: 'hit',
        target: 'monster',
        amount: result.damage,
        crit: result.kind === 'crit',
        ...(result.kind === 'deadly' ? { deadly: true } : {}),
        by: x.element,
      })
      if (s.monster.hp > 0) continue
      endFight(s, 'monster', events)
      return true
    }
    if (x.cooldown <= 0) {
      x.cooldown = Math.max(0, x.cooldown) + x.stats.attackInterval
      x.impactIn = TIMINGS.impactDelay
      events.push({ type: 'summonAttack', element: x.element })
    }
  }
  return false
}

/**
 * A defender who survived the hit may send part of it back (Battle.cpp:185–204, within 25 m: every
 * fight here). The reflected damage needs no roll to hit and is not reflected again. Returns true
 * when it killed the attacker.
 */
function reflect(
  s: CombatState,
  attackerSide: Side,
  rng: Rng,
  events: CombatEvent[],
  damage: number,
): boolean {
  const attacker = attackerSide === 'player' ? s.player : s.monster
  const back = effectiveStats(attackerSide === 'player' ? s.monster : s.player).reflect
  if (!back || !chance(rng, back.chance)) return false
  const amount = back.flat + Math.trunc((damage * back.rate) / 100)
  if (amount <= 0) return false
  attacker.hp = Math.max(0, attacker.hp - amount)
  if (attackerSide === 'monster') addHate(s, s.player, amount)
  events.push({ type: 'hit', target: attackerSide, amount, crit: false, reflected: true })
  if (attacker.hp > 0) return false
  endFight(s, attackerSide, events)
  return true
}

/**
 * HP / MP steal (Battle.cpp): a steal potion replaces the rare option of its kind — 30% of the
 * hits give back 5% of the damage as HP, or 10% of max MP; else the option's share of the damage.
 */
function steal(f: Fighter, damage: number, rng: Rng): void {
  const stats = effectiveStats(f)
  const potion = (kind: 'hp' | 'mp') => f.effects.some((e) => e.steal === kind && e.remaining > 0)
  if (damage > 0 && potion('hp')) {
    if (rng() >= 0.7) f.hp = Math.min(stats.maxHp, f.hp + Math.trunc((damage * 5) / 100))
  } else if (stats.hpSteal) f.hp = Math.min(stats.maxHp, f.hp + (damage * stats.hpSteal) / 100)
  if (damage > 0 && potion('mp')) {
    if (rng() >= 0.7)
      f.mp = Math.min(stats.maxMp ?? 0, f.mp + Math.trunc(((stats.maxMp ?? 0) * 10) / 100))
  } else if (stats.mpSteal) f.mp = Math.min(stats.maxMp ?? 0, f.mp + (damage * stats.mpSteal) / 100)
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
    const multiplier = damage
      ? damage.damageType === undefined
        ? skillDamageMultiplier(damage.percent)
        : 1
      : 0
    const power =
      damage?.damageType === undefined
        ? undefined
        : { power: damage.percent, type: damage.damageType }
    // a monster's skill on an elemental: its damage only
    const atSummon = side === 'monster' && s.monster.aimAt !== undefined
    const outcome = strike(s, side, rng, events, multiplier, true, power, skill.attackType)
    if (outcome === null) return false // missed
    if (outcome) return true
    if (atSummon) return false
    const target = targetSide === 'player' ? s.player : s.monster
    interrupt(target, targetSide, skill, rng, events)
    if (side === 'player') taunt(s, skill)
    applyEffects(target, targetSide, skill, rng, events)
    return false
  }

  const stats = effectiveStats(self)
  for (const e of skill.effects) {
    if (e.kind === 'summon') {
      summonElemental(self, e.element, events)
    } else if (e.kind === 'cure') {
      self.effects = self.effects.filter((fx) => !(fx.poison > 0 && fx.dotKind !== 'blood'))
    } else if (e.kind === 'heal') {
      const before = self.hp
      // MT_RECOVER/MDT_RATE uses maximum HP and integer division by SKILL_RATE_UNIT (100).
      const amount = e.percent ? Math.floor((stats.maxHp * e.amount) / 100) : e.amount
      self.hp = Math.min(stats.maxHp, self.hp + amount)
      events.push({ type: 'heal', target: side, amount: Math.round(self.hp - before) })
    } else if (e.kind === 'mana') {
      const before = self.mp
      const maxMp = stats.maxMp ?? 0
      const amount = e.percent ? Math.floor((maxMp * e.amount) / 100) : e.amount
      self.mp = Math.min(maxMp, self.mp + amount)
      events.push({ type: 'heal', target: side, amount: Math.round(self.mp - before), mana: true })
    }
  }
  applyEffects(self, side, skill, rng, events)
  return false
}

/**
 * The fighter is still readying a skill (the server's SKILL_CON_READY: before it fires), and will
 * be for `lead` more seconds.
 */
export function readyingSkill(f: Pick<Fighter, 'casting' | 'impactIn'>, lead = 0): boolean {
  return (
    f.casting !== null && f.impactIn !== null && f.impactIn > TIMINGS.impactDelay + lead + EPSILON
  )
}

/** MST_OTHER_SKILLCANCEL (Skill.cpp:2227–2237): a skill still being readied is cancelled. */
function interrupt(
  target: Fighter,
  side: Side,
  skill: SkillRank,
  rng: Rng,
  events: CombatEvent[],
): void {
  const cancel = skill.effects.find((e) => e.kind === 'interrupt')
  if (!cancel || !target.casting || !readyingSkill(target) || !chance(rng, cancel.chance)) return
  events.push({ type: 'interrupt', target: side, skillId: target.casting.id })
  target.casting = null
  target.impactIn = null
}

/**
 * MST_OTHER_TOUNT (Skill.cpp:2291–2327): whoever the monster hated most takes the hero's hate, and
 * the hero's becomes that top hate plus the skill's power, so it turns back from an elemental.
 */
function taunt(s: CombatState, skill: SkillRank): void {
  const power = skill.effects.find((e) => e.kind === 'taunt')?.power
  if (power === undefined) return
  const own = s.player.hate ?? 0
  let top: { hate?: number } = s.player
  let max = own
  for (const x of s.player.summons ?? []) {
    if (x.hate > max) {
      max = x.hate
      top = x
    }
  }
  top.hate = own
  s.player.hate = max + power
}

/** Puts a skill's lasting effects (stats, stun, poison) on a fighter for the skill's duration. */
export function applyEffects(
  f: Fighter,
  side: Side,
  skill: SkillRank,
  rng: Rng,
  events: CombatEvent[],
): void {
  if (skill.duration <= 0) return
  // a stronger effect of the same magic keeps this one out (CAssistList::CanApply)
  if (strongerWorking(f, skill.magics)) return
  const stats = skill.effects.filter((e): e is StatEffect => e.kind === 'stat')
  const stunEffect = skill.effects.find((e) => e.kind === 'stun')
  const stateEffect = skill.effects.find((e) => e.kind === 'state')
  const resistance =
    effectiveStats(f)[stunEffect?.resistance === 'stone' ? 'stoneResistance' : 'stunResistance'] ??
    0
  const stun =
    stunEffect !== undefined &&
    stunEffect.chance !== undefined &&
    chance(rng, stunEffect.chance * (1 - Math.min(80, resistance) / 100))
  const stateResistance =
    stateEffect?.state === 'stone'
      ? effectiveStats(f).stoneResistance
      : stateEffect?.state === 'silence'
        ? effectiveStats(f).silenceResistance
        : 0
  const state =
    stateEffect &&
    stateEffect.chance !== undefined &&
    chance(rng, stateEffect.chance * (1 - Math.min(80, stateResistance ?? 0) / 100))
      ? stateEffect.state
      : undefined
  const dot = skill.effects.find((e) => e.kind === 'poison')
  let poison =
    dot && (!dot.requiresHitrate || dot.chance !== undefined) && chance(rng, dot.chance ?? 1)
      ? dot.percent
        ? Math.trunc((effectiveStats(f).maxHp * dot.perSecond) / 100)
        : dot.perSecond
      : 0
  // Assist.cpp: ordinary player DOT is reduced by twenty, NPCs receive its full power.
  if (f.stats.clientContext) poison = Math.trunc(poison / 20)
  const mpChange = skill.effects.find((e) => e.kind === 'mpChange')
  const perSecond = (resource: 'hp' | 'mp') =>
    skill.effects.reduce(
      (sum, e) => sum + (e.kind === 'regen' && e.resource === resource ? e.perSecond : 0),
      0,
    )
  const hpPerSecond = perSecond('hp')
  const mpPerSecond = perSecond('mp')
  if (
    stats.length === 0 &&
    !stun &&
    !state &&
    !mpChange &&
    poison <= 0 &&
    hpPerSecond <= 0 &&
    mpPerSecond <= 0
  )
    return
  // Assist.cpp:103–109: remain − remain × option 101 / 10000, in the source's 1/10 s units.
  const shorter = skill.reducibleDebuff ? (effectiveStats(f).debuffTimeReduction ?? 0) : 0
  const tenths = Math.round(skill.duration * 10)
  const remaining =
    shorter > 0 ? (tenths - Math.trunc((tenths * shorter) / 10000)) / 10 : skill.duration
  f.effects = [
    ...f.effects.filter((e) => e.skillId !== skill.id && !sharesMagic(e, skill.magics)),
    {
      skillId: skill.id,
      name: skill.name,
      remaining,
      ...(skill.magics?.length ? { magics: skill.magics } : {}),
      stats,
      stun,
      state,
      dotKind: dot?.dotKind,
      ...(mpChange ? { mpChange: { power: mpChange.power, percent: mpChange.percent } } : {}),
      poison,
      nextTick: POISON_TICK,
      hpPerSecond,
      mpPerSecond,
    },
  ]
  if (stun || state === 'stone' || (state === 'silence' && f.casting)) {
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

/** Total HP / MP a potion restores, or its regeneration bonus for recovery potions. */
function potionValue(potion: PotionDef): number {
  return potion.kind === 'hp' || potion.kind === 'mp'
    ? potion.power * potion.duration
    : potion.power
}

/**
 * The potion of a kind to drink now, or null: below the share the slot sets (healing below
 * HP_POTION_BELOW and mana below MP_POTION_BELOW by default, recovery potions while HP / MP is not
 * full) — only when no potion of the kind is working and its cooldown is over. Picks the smallest
 * potion that covers what is missing (the strongest when none does; recovery potions: the strongest).
 */
export function choosePotion(
  f: Fighter,
  kind: PotionKind,
  stats: CombatStats = effectiveStats(f),
): PotionSupply | null {
  if (!f.potions || f.potionCooldowns[kind] || f.effects.some((e) => e.potion === kind)) return null
  const owned = f.potions
    .filter((p) => p.potion.kind === kind && potionsLeft(f, p) > 0)
    .sort((a, b) => potionValue(a.potion) - potionValue(b.potion))
  if (owned.length === 0) return null
  const health = kind === 'hp' || kind === 'hpRegen'
  const max = health ? stats.maxHp : (stats.maxMp ?? 0)
  const value = health ? f.hp : f.mp
  const below =
    owned.find((p) => p.below !== undefined)?.below ??
    (kind === 'hp' ? HP_POTION_BELOW : kind === 'mp' ? MP_POTION_BELOW : 1)
  if (!(value < max * below)) return null
  if (kind === 'hpRegen' || kind === 'mpRegen') return owned[owned.length - 1]!
  const missing = max - value
  return owned.find((p) => potionValue(p.potion) >= missing) ?? owned[owned.length - 1]!
}

const POTION_KINDS: PotionKind[] = ['hp', 'mp', 'hpRegen', 'mpRegen']

/** The hero drinks the potions it needs (not while stunned). */
function drinkPotions(f: Fighter, events: CombatEvent[]): void {
  if (!f.potions || f.potions.length === 0 || isStunned(f)) return
  const stats = effectiveStats(f)
  for (const kind of POTION_KINDS) {
    const supply = choosePotion(f, kind, stats)
    if (supply) applyPotion(f, supply, events)
  }
}

/** A potion takes effect: counted as drunk, its kind's cooldown starts. */
function applyPotion(f: Fighter, { itemId, name, potion }: PotionSupply, events: CombatEvent[]) {
  const kind = potion.kind
  f.potionsUsed[itemId] = (f.potionsUsed[itemId] ?? 0) + 1
  f.potionCooldowns[cooldownKey(potion)] = potion.cooldown
  if (kind === 'boost') {
    // the skill's buff: a second one of the same skill takes the place of the first (AddAssist)
    const effect = boostEffect(itemId, name, potion, potion.duration)
    f.effects = [
      ...f.effects.filter(
        (e) =>
          !(e.potion === 'boost' && e.skillId === potion.skill) && !sharesMagic(e, effect.magics),
      ),
      effect,
    ]
    events.push({ type: 'potion', itemId, name, kind })
    return
  }
  const regenStat = kind === 'hpRegen' ? 'hpRegen' : kind === 'mpRegen' ? 'mpRegen' : null
  f.effects = [
    ...f.effects,
    {
      skillId: 0,
      itemId,
      potion: kind,
      name,
      remaining: potion.duration,
      stats: regenStat
        ? [{ kind: 'stat', stat: regenStat, value: potion.power, percent: false }]
        : [],
      stun: false,
      poison: 0,
      nextTick: POISON_TICK,
      hpPerSecond: kind === 'hp' ? potion.power : 0,
      mpPerSecond: kind === 'mp' ? potion.power : 0,
    },
  ]
  events.push({ type: 'potion', itemId, name, kind })
}

/**
 * Which reuse timer a potion starts: healing and mana potions share one per kind, a boost potion
 * has its skill's own (each item skill keeps its reuse time on the server).
 */
export const cooldownKey = (potion: PotionDef) =>
  potion.kind === 'boost' ? `boost:${potion.skill ?? 0}` : potion.kind

/** The effect a boost potion gives, with `remaining` seconds of it left. */
export function boostEffect(
  itemId: number,
  name: string,
  potion: PotionDef,
  remaining: number,
): ActiveEffect {
  return {
    skillId: potion.skill ?? 0,
    itemId,
    potion: 'boost',
    name,
    remaining,
    stats: [
      ...(potion.effects ?? []).flatMap((e) => {
        // MST_STAT_STR / DEX / INT / CON: COption::ApplyOptionValue like a worn option
        const attribute = e.type === 0 ? POTION_ATTRIBUTES[e.subtype] : undefined
        if (attribute)
          return [{ kind: 'stat' as const, stat: attribute, value: e.power, percent: false }]
        const effect = interpretEffect(e)
        // no cooldown at all supersedes the potion's own cooldown reduction
        if (potion.noCooldown && effect?.kind === 'stat' && effect.stat === 'cooldownReduction')
          return []
        return effect?.kind === 'stat' ? [effect] : []
      }),
      ...(potion.noCooldown
        ? [{ kind: 'stat' as const, stat: 'cooldownFree' as const, value: 1, percent: false }]
        : []),
    ],
    stun: false,
    poison: 0,
    nextTick: POISON_TICK,
    ...(potion.keepOnDeath ? { keepOnDeath: true } : {}),
    ...(potion.rewards ? { rewards: { ...potion.rewards } } : {}),
    ...(potion.steal ? { steal: potion.steal } : {}),
    ...(potion.berserker ? { berserker: true as const } : {}),
    ...magicsOf(potion.effects),
  }
}

/**
 * Skill.h MST_STAT_STR / DEX / INT / CON (29–32). Read for potions only: the dungeon blessings
 * carrying them (161, 1620, 1806) keep their current behaviour until Codex decides.
 */
const POTION_ATTRIBUTES: Partial<
  Record<number, 'strength' | 'dexterity' | 'intelligence' | 'constitution'>
> = { 29: 'strength', 30: 'dexterity', 31: 'intelligence', 32: 'constitution' }

/** EXP / SP / gold / drop multipliers of the working effects (successive, as in the source). */
export function effectRewardMultipliers(effects: readonly ActiveEffect[]) {
  const rates = { exp: 1, sp: 1, gold: 1, drop: 1 }
  for (const e of effects)
    if (e.remaining > 0 && e.rewards)
      for (const key of ['exp', 'sp', 'gold', 'drop'] as const)
        rates[key] *= 1 + e.rewards[key] / 100
  return rates
}

function magicsOf(effects: readonly { magic?: number; magicLevel?: number }[] | undefined) {
  const magics = (effects ?? []).flatMap((e) =>
    e.magic !== undefined && e.magicLevel !== undefined
      ? [{ magic: e.magic, level: e.magicLevel }]
      : [],
  )
  return magics.length ? { magics } : {}
}

/**
 * Why the hero can't drink a potion now: dead, level too low, none left, its kind cooling down or
 * still working.
 */
export type DrinkProblem =
  | 'dead'
  | 'level-too-low'
  | 'none-left'
  | 'cooldown'
  | 'working'
  /** A stronger effect of the same magic works (CAssistList::CanApply). */
  | 'stronger'

/**
 * The player has the hero drink a potion from the bag (`supply.count`: how many the bag holds). Same
 * rules as drinking by itself, but at any HP / MP; the state stays as it was when it can't.
 */
export function drinkPotion(
  state: CombatState,
  supply: PotionSupply,
): { state: CombatState; events: CombatEvent[]; problem: DrinkProblem | null } {
  const f = state.player
  const kind = supply.potion.kind
  const problem: DrinkProblem | null =
    f.hp <= 0 || state.phase === 'defeat'
      ? 'dead'
      : potionsLeft(f, supply) <= 0
        ? 'none-left'
        : f.potionCooldowns[cooldownKey(supply.potion)]
          ? 'cooldown'
          : kind === 'boost'
            ? // SF_NOTDUPLICATE: not while the same skill works; others take its place
              supply.potion.exclusive &&
              f.effects.some((e) => e.potion === 'boost' && e.skillId === supply.potion.skill)
              ? 'working'
              : strongerWorking(f, boostEffect(0, '', supply.potion, 0).magics)
                ? 'stronger'
                : null
            : f.effects.some((e) => e.potion === kind)
              ? 'working'
              : null
  if (problem) return { state, events: [], problem }
  const next = copyState(state)
  const events: CombatEvent[] = []
  applyPotion(next.player, supply, events)
  return { state: next, events, problem: null }
}

/** Strongest damage first. */
function damageOf(rank: SkillRank): number {
  const damage = rank.effects.find((e) => e.kind === 'damage')
  return damage?.kind === 'damage' ? damage.percent : 0
}

/** Picks the automatic skill to use now, or null for a normal swing. */
export function chooseSkill(self: Fighter, target: Fighter, rng?: Rng): SkillRank | null {
  if (!self.skills || self.skills.length === 0 || self.effects.some((e) => e.state === 'silence'))
    return null
  const stats = effectiveStats(self)
  const ready = self.skills.filter(
    (r) =>
      r.auto &&
      r.kind !== 'passive' &&
      !self.skillCooldowns[r.id] &&
      canPaySkill(self, r, stats) &&
      !(r.notBoss && target.stats.boss),
  )
  if (ready.length === 0) return null
  if (self.skills.some((s) => s.npcSlot !== undefined)) {
    if (!rng) return null
    for (let slot = 0; slot < 4; slot++) {
      const roll = rollInt(rng, 1, 10000)
      const rank = ready.find((s) => s.npcSlot === slot)
      if (rank && canPaySkill(self, rank, stats) && roll <= (rank.npcProbability ?? 0)) return rank
    }
    return null
  }
  const hurt = self.hp < stats.maxHp * HEAL_BELOW
  const drained = self.mp < (stats.maxMp ?? 0) * MANA_BELOW
  const on = (f: Fighter, id: number) => f.effects.some((e) => e.skillId === id)

  const heal = ready.find(
    (r) =>
      r.kind === 'heal' &&
      r.effects.some(
        (e) =>
          (e.kind === 'heal' && hurt) ||
          (e.kind === 'mana' && drained) ||
          (e.kind === 'cure' && self.effects.some((fx) => fx.poison > 0 && fx.dotKind !== 'blood')),
      ),
  )
  if (heal) return heal
  const summons = (r: SkillRank) => r.effects.some((e) => e.kind === 'summon')
  const summon = ready.find((r) =>
    r.effects.some((e) => e.kind === 'summon' && canSummon(self, e.element)),
  )
  if (summon) return summon
  const buff = ready.find(
    (r) => r.kind === 'buff' && !summons(r) && !on(self, r.id) && !strongerWorking(self, r.magics),
  )
  if (buff) return buff
  // a skill that only cancels another (Charge) waits until the monster readies one (own rule)
  const onlyCancels = (r: SkillRank) =>
    r.effects.some((e) => e.kind === 'interrupt') &&
    !r.effects.some((e) => e.kind !== 'interrupt' && e.kind !== 'taunt')
  const debuff = ready.find(
    (r) =>
      r.kind === 'debuff' &&
      !on(target, r.id) &&
      (!onlyCancels(r) ||
        readyingSkill(target, skillPreparationTime(r, stats) + TIMINGS.impactDelay)),
  )
  if (debuff) return debuff
  const attacks = ready.filter((r) => r.kind === 'attack')
  return attacks.length > 0 ? attacks.reduce((a, b) => (damageOf(b) > damageOf(a) ? b : a)) : null
}
