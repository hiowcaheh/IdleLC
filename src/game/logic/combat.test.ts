import { describe, expect, it } from 'vitest'
import type { CombatStats } from '../data/types.ts'
import {
  HP_POTION_BELOW,
  MP_POTION_BELOW,
  TIMINGS,
  approachTime,
  changeMonster,
  choosePotion,
  combatTick,
  createCombat,
  healPlayer,
  killMonster,
  effectiveStats,
  potionsLeft,
  takePotionsUsed,
  updatePlayer,
  type CombatEvent,
  type CombatState,
  type FighterInit,
  type PotionSupply,
} from './combat.ts'
import { createRng, type Rng } from './rng.ts'
import type { SkillRank } from './skills.ts'

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

describe('dev helpers', () => {
  it('killMonster ends the fight as a victory, only while the monster is out', () => {
    const rng = createRng(3)
    const start = createCombat(strongPlayer, 'm', weakMonster)
    expect(killMonster(start).events).toEqual([]) // still spawning

    const fighting = run(start, TIMINGS.spawning + 0.1, rng).state
    expect(fighting.phase).toBe('approach')
    const { state, events } = killMonster(fighting)
    expect(events).toEqual([{ type: 'death', who: 'monster' }])
    expect(state).toMatchObject({ phase: 'victory', kills: 1 })
    expect(state.monster.hp).toBe(0)
  })

  it('healPlayer restores HP unless the player is down', () => {
    const start = createCombat(strongPlayer, 'm', weakMonster)
    const hurt = { ...start, player: { ...start.player, hp: 5 } }
    expect(healPlayer(hurt).player.hp).toBe(strongPlayer.stats.maxHp)
    const down = { ...hurt, phase: 'defeat' as const }
    expect(healPlayer(down)).toBe(down)
  })
})

const rank = (over: Partial<SkillRank> = {}): SkillRank => ({
  id: 1,
  name: 'Strike',
  level: 1,
  kind: 'attack',
  offensive: true,
  mpCost: 10,
  hpCost: 0,
  castTime: 0,
  fireTime: 0,
  cooldown: 3,
  duration: 0,
  effects: [{ kind: 'damage', percent: 200 }],
  auto: true,
  ...over,
})

const caster = (skills: SkillRank[], over: Partial<CombatStats> = {}): FighterInit => ({
  level: 10,
  stats: stats({ attack: 20, maxMp: 100, ...over }),
  skills,
})
const tank = { level: 1, stats: stats({ maxHp: 5000, attack: 1, defense: 0 }) }

/** A fight that has just started (nobody has acted yet). */
const engaged = (player: FighterInit, monster = tank): CombatState => {
  const s = createCombat(player, 'm', monster)
  const initiative = monster.stats.attackInterval * TIMINGS.monsterInitiative
  return { ...s, phase: 'fighting', monster: { ...s.monster, cooldown: initiative } }
}

describe('skills in combat', () => {
  it('a skill without a wind-up lands like a swing, and the hero acts again after one interval', () => {
    const instant = caster([rank({ castTime: 0, fireTime: 2.6, cooldown: 30 })])
    const early = run(engaged(instant), TIMINGS.impactDelay + 0.05, createRng(2))
    expect(early.events.filter((e) => e.type === 'cast')).toHaveLength(1)
    expect(early.events.some((e) => e.type === 'hit' && e.target === 'monster' && e.skill)).toBe(
      true,
    )
    // attackInterval is 1 s: the next swing starts then, not after the 2.6 s fire animation
    const next = run(early.state, 1 - TIMINGS.impactDelay, createRng(3))
    expect(next.events).toContainEqual({ type: 'attack', source: 'player' })
  })

  it('a wind-up (t_skill readyTime) delays the hit', () => {
    const chant = caster([rank({ castTime: 1, cooldown: 30 })])
    const during = run(engaged(chant), 1, createRng(4))
    expect(during.events.some((e) => e.type === 'hit' && e.target === 'monster')).toBe(false)
    const after = run(during.state, TIMINGS.impactDelay + 0.05, createRng(5))
    expect(after.events.some((e) => e.type === 'hit' && e.target === 'monster' && e.skill)).toBe(
      true,
    )
  })

  it('casts a ready skill for its MP, then waits for the cooldown', () => {
    const { state, events } = run(engaged(caster([rank()])), 2.9, createRng(2))
    const casts = events.filter((e) => e.type === 'cast')
    expect(casts).toHaveLength(1)
    expect(casts[0]).toMatchObject({
      source: 'player',
      skillId: 1,
      name: 'Strike',
      castTime: TIMINGS.impactDelay,
    })
    expect(events.some((e) => e.type === 'hit' && e.skill)).toBe(true)
    expect(state.player.mp).toBeLessThan(100)
    expect(state.player.mp).toBeGreaterThan(90)
    expect(
      events.filter((e) => e.type === 'attack' && e.source === 'player').length,
    ).toBeGreaterThan(0)
    expect(run(state, 1.2, createRng(3)).events.some((e) => e.type === 'cast')).toBe(true)
  })

  it('a skill hit does more damage than a normal one', () => {
    const { events } = run(engaged(caster([rank({ cooldown: 0.5 })])), 30, createRng(4))
    const hits = events.filter((e) => e.type === 'hit' && e.target === 'monster' && !e.crit)
    const avg = (list: typeof hits) =>
      list.reduce((sum, e) => sum + (e.type === 'hit' ? e.amount : 0), 0) / list.length
    const skillHits = hits.filter((e) => e.type === 'hit' && e.skill)
    const plainHits = hits.filter((e) => e.type === 'hit' && !e.skill)
    expect(skillHits.length).toBeGreaterThan(0)
    expect(plainHits.length).toBeGreaterThan(0)
    expect(avg(skillHits) / avg(plainHits)).toBeCloseTo(3, 0)
  })

  it('does not cast without MP or when automatic use is off', () => {
    for (const player of [caster([rank({ mpCost: 500 })]), caster([rank({ auto: false })])]) {
      const { events } = run(engaged(player), 5, createRng(5))
      expect(events.some((e) => e.type === 'cast')).toBe(false)
    }
  })

  it('keeps a buff up and its stats apply while it lasts', () => {
    const shield = rank({
      id: 2,
      kind: 'buff',
      offensive: false,
      duration: 4,
      cooldown: 1,
      effects: [{ kind: 'stat', stat: 'defense', value: 100, percent: false }],
    })
    const start = engaged(caster([shield]))
    const first = run(start, 0.6, createRng(6))
    expect(first.events).toContainEqual({
      type: 'effect',
      target: 'player',
      skillId: 2,
      name: 'Strike',
      kind: 'buff',
    })
    expect(effectiveStats(first.state.player).defense).toBe(105)
    // the buff is not recast while it is on, but again once it ran out
    const later = run(first.state, 5, createRng(7))
    expect(later.events.filter((e) => e.type === 'cast')).toHaveLength(1)
  })

  it('heals when hurt and not when healthy', () => {
    const heal = rank({
      id: 3,
      kind: 'heal',
      offensive: false,
      effects: [{ kind: 'heal', amount: 30 }],
    })
    const start = engaged(caster([heal]))
    expect(run(start, 1, createRng(8)).events.some((e) => e.type === 'cast')).toBe(false)
    const hurt = { ...start, player: { ...start.player, hp: 40 } }
    const { events, state } = run(hurt, 0.6, createRng(8))
    expect(events).toContainEqual({ type: 'heal', target: 'player', amount: 30 })
    expect(state.player.hp).toBeGreaterThanOrEqual(70)
  })

  it('a stunned monster does not attack until the stun ends', () => {
    const bash = rank({
      id: 4,
      kind: 'debuff',
      duration: 3,
      cooldown: 30,
      effects: [{ kind: 'stun', chance: 1 }],
    })
    const brute = { level: 1, stats: stats({ maxHp: 5000, attack: 30, attackInterval: 0.5 }) }
    const { events } = run(engaged(caster([bash], { maxHp: 1000 }), brute), 4, createRng(9))
    const stunAt = events.findIndex((e) => e.type === 'effect' && e.kind === 'stun')
    expect(stunAt).toBeGreaterThanOrEqual(0)
    // ~3 s of stun at 0.5 s per swing: the monster swings far less often than without it
    const monsterSwings = events
      .slice(stunAt)
      .filter((e) => e.type === 'attack' && e.source === 'monster')
    expect(monsterSwings.length).toBeLessThanOrEqual(2)
  })

  it('poison ticks every second and can finish the monster', () => {
    const capsule = rank({
      id: 5,
      kind: 'debuff',
      duration: 5,
      cooldown: 60,
      effects: [{ kind: 'poison', perSecond: 7 }],
    })
    const frail = { level: 1, stats: stats({ maxHp: 30, attack: 1, defense: 1000 }) }
    const { events } = run(engaged(caster([capsule], { attack: 1 }), frail), 6, createRng(10))
    const ticks = events.filter((e) => e.type === 'hit' && e.poison)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks[0]).toMatchObject({ target: 'monster', amount: 7 })
    expect(events).toContainEqual({ type: 'death', who: 'monster' })
  })

  it('curses and poison end with the monster', () => {
    const start = engaged(caster([rank()]))
    const cursed: CombatState = {
      ...start,
      monster: {
        ...start.monster,
        effects: [
          {
            skillId: 7,
            name: 'Curse',
            remaining: 20,
            stats: [{ kind: 'stat', stat: 'defense', value: -5, percent: false }],
            stun: false,
            poison: 3,
            nextTick: 1,
          },
        ],
      },
    }
    expect(killMonster(cursed).state.monster.effects).toEqual([])
  })

  it('a defeat clears buffs; the hero comes back with full HP and MP', () => {
    const start = engaged(caster([rank()]))
    const buffed: CombatState = {
      ...start,
      player: {
        ...start.player,
        hp: 1,
        mp: 3,
        effects: [
          {
            skillId: 9,
            name: 'Buff',
            remaining: 100,
            stats: [],
            stun: false,
            poison: 0,
            nextTick: 1,
          },
        ],
      },
      monster: { ...start.monster, stats: stats({ maxHp: 5000, attack: 500 }) },
    }
    const { state, events } = run(buffed, TIMINGS.defeat + 2, createRng(11))
    expect(events).toContainEqual({ type: 'death', who: 'player' })
    expect(events.map((e) => e.type)).toContain('revive')
    expect(state.player.effects).toEqual([])
    expect(state.player.mp).toBe(100)
  })

  it('does not mutate the input state while skills run', () => {
    const s = run(engaged(caster([rank()])), 1, createRng(12)).state
    const copy = structuredClone(s)
    combatTick(s, 3, createRng(13))
    expect(s).toEqual(copy)
  })
})

const potion = (
  itemId: number,
  kind: PotionSupply['potion']['kind'],
  power: number,
  count = 5,
  duration = 15,
): PotionSupply => ({
  itemId,
  name: `Potion ${itemId}`,
  count,
  potion: { kind, power, duration, cooldown: 5 },
})

/** A hero at `hp` HP (of 1000) and `mp` MP (of 100) in a fight that has just started. */
const drinker = (potions: PotionSupply[], hp = 1000, mp = 100): CombatState => {
  const s = engaged({ level: 10, stats: stats({ maxHp: 1000, maxMp: 100 }), potions })
  return { ...s, player: { ...s.player, hp, mp } }
}

describe('potions in combat', () => {
  it('drinks a healing potion below the HP threshold; it heals every second while it lasts', () => {
    const small = potion(43, 'hp', 16)
    expect(combatTick(drinker([small], 600), 0.01, createRng(1)).events).not.toContainEqual(
      expect.objectContaining({ type: 'potion' }),
    )
    const low = 1000 * HP_POTION_BELOW - 100
    const r = combatTick(drinker([small], low), 0.01, createRng(1))
    expect(r.events).toContainEqual({ type: 'potion', itemId: 43, name: 'Potion 43', kind: 'hp' })
    expect(r.state.player.potionsUsed).toEqual({ 43: 1 })
    expect(potionsLeft(r.state.player, small)).toBe(4)
    expect(r.state.player.effects[0]).toMatchObject({ itemId: 43, potion: 'hp', hpPerSecond: 16 })

    // no monster damage: the hero gains 16 HP per second
    const calm = { ...r.state, monster: { ...r.state.monster, cooldown: 99, stats: stats() } }
    const later = combatTick(calm, 2, createRng(1)).state
    expect(later.player.hp).toBeCloseTo(r.state.player.hp + 32, 0)
  })

  it('does not drink another of the kind while one works or during its cooldown', () => {
    const small = potion(43, 'hp', 16, 5, 1)
    const r = combatTick(drinker([small], 100), 0.01, createRng(1))
    expect(r.state.player.potionCooldowns.hp).toBe(5)
    expect(choosePotion(r.state.player, 'hp')).toBeNull()
    // the effect is over after 1 s, the cooldown is not
    const after = { ...r.state.player, effects: [], hp: 100 }
    expect(choosePotion(after, 'hp')).toBeNull()
    expect(choosePotion({ ...after, potionCooldowns: {} }, 'hp')).toBe(small)
  })

  it('picks the smallest potion that covers the missing HP, else the strongest', () => {
    const small = potion(43, 'hp', 16) // 240 HP
    const great = potion(45, 'hp', 50) // 750 HP
    const s = drinker([great, small], 400)
    expect(choosePotion(s.player, 'hp')).toBe(great) // 600 missing
    expect(choosePotion({ ...s.player, hp: 790 }, 'hp')).toBeNull() // not low enough
    expect(choosePotion({ ...s.player, hp: 480 }, 'hp')).toBe(great) // 520 missing
    expect(choosePotion({ ...s.player, potionsUsed: { 45: 5 } }, 'hp')).toBe(small) // none left
    const frail = { ...s.player, stats: stats({ maxHp: 400 }), hp: 190 } // 210 missing
    expect(choosePotion(frail, 'hp')).toBe(small)
  })

  it('drinks a mana potion below the MP threshold and recovery potions while hurt', () => {
    const mana = potion(484, 'mp', 8)
    const recovery = potion(490, 'hpRegen', 2, 5, 600)
    const full = combatTick(drinker([mana, recovery]), 0.01, createRng(1))
    expect(full.events.filter((e) => e.type === 'potion')).toEqual([])

    const low = combatTick(
      drinker([mana, recovery], 900, 100 * MP_POTION_BELOW - 1),
      0.01,
      createRng(1),
    )
    const drunk = low.events.filter((e) => e.type === 'potion').map((e) => e.itemId)
    expect(drunk).toEqual([484, 490])
    expect(effectiveStats(low.state.player).hpRegen).toBe(2)
  })

  it('a stunned hero drinks nothing; monsters carry no potions', () => {
    const s = drinker([potion(43, 'hp', 16)], 100)
    s.player.effects = [
      { skillId: 9, name: 'Stun', remaining: 2, stats: [], stun: true, poison: 0, nextTick: 1 },
    ]
    expect(combatTick(s, 0.01, createRng(1)).state.player.potionsUsed).toEqual({})
  })

  it('takePotionsUsed moves the drunk potions off the supply; updatePlayer keeps the pending ones', () => {
    const small = potion(43, 'hp', 16)
    const r = combatTick(drinker([small], 100), 0.01, createRng(1))
    const taken = takePotionsUsed(r.state)
    expect(taken.used).toEqual([{ itemId: 43, count: 1 }])
    expect(taken.state.player.potionsUsed).toEqual({})
    expect(taken.state.player.potions).toEqual([{ ...small, count: 4 }])
    expect(takePotionsUsed(taken.state).used).toEqual([])

    // potions bought while one is still pending: 10 in the bag, 1 drunk → 9 left
    const bought = updatePlayer(r.state, {
      level: 10,
      stats: stats({ maxHp: 1000, maxMp: 100 }),
      potions: [{ ...small, count: 10 }],
    })
    expect(potionsLeft(bought.player, bought.player.potions![0]!)).toBe(9)
  })

  it('updatePlayer keeps a fallen hero at 0 HP', () => {
    const s = drinker([], 0)
    const next = updatePlayer({ ...s, phase: 'defeat' }, { level: 11, stats: stats() })
    expect(next.player.hp).toBe(0)
  })
})

describe('rare options in combat', () => {
  it('shorter skill cooldowns and cheaper skills', () => {
    const start = engaged(caster([rank()], { cooldownReduction: 40, mpCostReduction: 50 }))
    const r = combatTick(start, 0.01, createRng(1))
    expect(r.events.some((e) => e.type === 'cast')).toBe(true)
    expect(r.state.player.skillCooldowns[1]).toBeCloseTo(3 * 0.6, 1)
    expect(r.state.player.mp).toBeCloseTo(100 - 5, 0)
    // capped: never below half the cooldown
    const capped = engaged(caster([rank()], { cooldownReduction: 90 }))
    expect(combatTick(capped, 0.01, createRng(1)).state.player.skillCooldowns[1]).toBeCloseTo(
      1.5,
      1,
    )
  })

  it('HP steal heals the hero by a share of the damage it deals', () => {
    const thief = engaged({ level: 10, stats: stats({ attack: 40, hpSteal: 50 }) })
    const hurt = { ...thief, player: { ...thief.player, hp: 10 } }
    const { state, events } = run(hurt, 1, createRng(5))
    const dealt = events
      .filter((e) => e.type === 'hit' && e.target === 'monster')
      .reduce((sum, e) => sum + (e.type === 'hit' ? e.amount : 0), 0)
    const taken = events
      .filter((e) => e.type === 'hit' && e.target === 'player')
      .reduce((sum, e) => sum + (e.type === 'hit' ? e.amount : 0), 0)
    expect(dealt).toBeGreaterThan(0)
    expect(state.player.hp).toBeCloseTo(Math.min(100, 10 + dealt / 2) - taken, 0)
  })

  it('move speed shortens the run to the monster', () => {
    const plain = createCombat(strongPlayer, 'm', weakMonster)
    const quick = createCombat(
      { ...strongPlayer, stats: { ...strongPlayer.stats, moveSpeed: 30 } },
      'm',
      weakMonster,
    )
    expect(approachTime(plain)).toBe(TIMINGS.approach)
    expect(approachTime(quick)).toBeCloseTo(TIMINGS.approach / 1.3)
    const step = TIMINGS.spawning + TIMINGS.approach / 1.3 + 0.02
    expect(combatTick(quick, step, createRng(1)).state.phase).toBe('fighting')
    expect(combatTick(plain, step, createRng(1)).state.phase).toBe('approach')
  })
})
