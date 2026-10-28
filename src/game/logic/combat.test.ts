import { describe, expect, it } from 'vitest'
import type { CombatStats } from '../data/types.ts'
import {
  TIMINGS,
  changeMonster,
  combatTick,
  createCombat,
  updatePlayer,
  type CombatEvent,
  type CombatState,
} from './combat.ts'
import { createRng, type Rng } from './rng.ts'

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

/** Runs the simulation in frame-sized steps, collecting all events. */
function run(state: CombatState, seconds: number, rng: Rng, frame = 1 / 60) {
  let s = state
  const events: CombatEvent[] = []
  for (let t = 0; t < seconds; t += frame) {
    const r = combatTick(s, frame, rng)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}

const strongPlayer = { level: 10, stats: stats({ attack: 50 }) }
const weakMonster = { level: 1, stats: stats({ maxHp: 30, attack: 2 }) }

describe('combatTick', () => {
  it('does not mutate the input state', () => {
    const s = createCombat(strongPlayer, 'm', weakMonster)
    const copy = structuredClone(s)
    combatTick(s, 5, createRng(1))
    expect(s).toEqual(copy)
  })

  it('goes spawning → approach → fighting with spawn and engage events', () => {
    const rng = createRng(1)
    let r = combatTick(createCombat(strongPlayer, 'm', weakMonster), TIMINGS.spawning + 0.01, rng)
    expect(r.state.phase).toBe('approach')
    expect(r.events).toEqual([{ type: 'spawn', monsterId: 'm' }])

    r = combatTick(r.state, TIMINGS.approach + 0.01, rng)
    expect(r.state.phase).toBe('fighting')
    expect(r.events[0]).toEqual({ type: 'engage' })
  })

  it('player swings first; damage lands after the impact delay', () => {
    const rng = createRng(1)
    const start = combatTick(
      createCombat(strongPlayer, 'm', weakMonster),
      TIMINGS.spawning + TIMINGS.approach + 0.02,
      rng,
    )
    const swing = start.events.find((e) => e.type === 'attack')
    expect(swing).toEqual({ type: 'attack', source: 'player' })
    expect(start.events.some((e) => e.type === 'hit' || e.type === 'miss')).toBe(false)

    const impact = combatTick(start.state, TIMINGS.impactDelay, rng)
    expect(impact.events.some((e) => e.type === 'hit' || e.type === 'miss')).toBe(true)
  })

  it('a strong player kills the monster, then a new one respawns at full HP', () => {
    const { state, events } = run(createCombat(strongPlayer, 'm', weakMonster), 15, createRng(4))
    const types = events.map((e) => e.type)
    expect(types).toContain('death')
    expect(events.find((e) => e.type === 'death')).toEqual({ type: 'death', who: 'monster' })
    expect(types.filter((t) => t === 'spawn').length).toBeGreaterThanOrEqual(2)
    expect(state.kills).toBeGreaterThanOrEqual(1)
    expect(state.deaths).toBe(0)

    // order: death → despawn → spawn
    const death = types.indexOf('death')
    const despawn = types.indexOf('despawn', death)
    const spawn = types.indexOf('spawn', despawn)
    expect(despawn).toBeGreaterThan(death)
    expect(spawn).toBeGreaterThan(despawn)
  })

  it('a weak player dies, is revived at full HP and the fight continues', () => {
    const weakPlayer = { level: 1, stats: stats({ maxHp: 20, attack: 1 }) }
    const brute = { level: 10, stats: stats({ maxHp: 500, attack: 40 }) }
    const { state, events } = run(createCombat(weakPlayer, 'm', brute), 20, createRng(5))
    expect(events).toContainEqual({ type: 'death', who: 'player' })
    expect(events.map((e) => e.type)).toContain('revive')
    expect(state.deaths).toBeGreaterThanOrEqual(1)
    expect(state.kills).toBe(0)
  })

  it('dead fighters do not land pending hits', () => {
    const { events } = run(createCombat(strongPlayer, 'm', weakMonster), 30, createRng(6))
    // after every monster death, no hit on the player until the next engage
    let monsterDead = false
    for (const e of events) {
      if (e.type === 'death' && e.who === 'monster') monsterDead = true
      if (e.type === 'engage') monsterDead = false
      if (monsterDead) expect(e).not.toMatchObject({ type: 'hit', target: 'player' })
    }
  })

  it('regenerates player HP out of combat but not above max', () => {
    let s = createCombat(strongPlayer, 'm', weakMonster)
    s = { ...s, player: { ...s.player, hp: 10 } }
    const r = combatTick(s, 0.5, createRng(1))
    expect(r.state.player.hp).toBeGreaterThan(10)
    const full = combatTick({ ...s, player: { ...s.player, hp: 100 } }, 0.5, createRng(1))
    expect(full.state.player.hp).toBe(100)
  })

  it('is deterministic: same seed gives same events', () => {
    const a = run(createCombat(strongPlayer, 'm', weakMonster), 20, createRng(42))
    const b = run(createCombat(strongPlayer, 'm', weakMonster), 20, createRng(42))
    expect(a.events).toEqual(b.events)
  })

  it('a single large dt produces the same outcome as many small ones', () => {
    const big = combatTick(createCombat(strongPlayer, 'm', weakMonster), 20, createRng(9))
    const small = run(createCombat(strongPlayer, 'm', weakMonster), 20, createRng(9), 0.05)
    expect(big.state.kills).toBe(small.state.kills)
  })
})

describe('changeMonster', () => {
  it('resets to spawning with the new monster and emits despawn', () => {
    const fighting = combatTick(createCombat(strongPlayer, 'a', weakMonster), 3, createRng(1))
    const other = { level: 2, stats: stats({ maxHp: 77 }) }
    const r = changeMonster(fighting.state, 'b', other)
    expect(r.state.phase).toBe('spawning')
    expect(r.state.monsterId).toBe('b')
    expect(r.state.monster.hp).toBe(77)
    expect(r.events).toEqual([{ type: 'despawn' }])
  })

  it('revives the player when switching during defeat', () => {
    const s = createCombat(strongPlayer, 'a', weakMonster)
    const dead: CombatState = { ...s, phase: 'defeat', player: { ...s.player, hp: 0 } }
    const r = changeMonster(dead, 'b', weakMonster)
    expect(r.state.player.hp).toBe(strongPlayer.stats.maxHp)
    expect(r.events).toEqual([{ type: 'revive' }, { type: 'despawn' }])
  })
})

describe('updatePlayer', () => {
  it('keeps the HP ratio when max HP changes', () => {
    const s = createCombat(strongPlayer, 'a', weakMonster)
    const half = { ...s, player: { ...s.player, hp: 50 } }
    const r = updatePlayer(half, { level: 11, stats: stats({ maxHp: 200 }) })
    expect(r.player.hp).toBe(100)
    expect(r.player.level).toBe(11)
  })
})
