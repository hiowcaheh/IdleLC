import { describe, expect, it } from 'vitest'
import { getItem } from '../data/items.ts'
import type { CombatStats } from '../data/types.ts'
import { boostEffects, boostsOf, liveBoosts, reportedBoosts } from './boosts.ts'
import {
  combatTick,
  createCombat,
  drinkPotion,
  effectiveStats,
  runSpeed,
  skillCooldownTime,
  type CombatState,
  type PotionSupply,
} from './combat.ts'
import { createRng } from './rng.ts'
import type { SkillRank } from './skills.ts'

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1.5,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

const supply = (itemId: number, count = 3): PotionSupply => ({
  itemId,
  name: getItem(itemId).name,
  count,
  potion: getItem(itemId).potion!,
})

const fight = (): CombatState =>
  createCombat({ level: 30, stats: stats() }, 'm', { level: 1, stats: stats({ attack: 1 }) })

describe('boost potions', () => {
  it('Potion of Haste: +1 m/s run speed for 200 s', () => {
    const client = {
      physicalAttack: 10,
      magicAttack: 10,
      physicalDefense: 5,
      magicDefense: 5,
      physicalHit: 100,
      magicHit: 100,
      physicalEvasion: 100,
      magicEvasion: 100,
      criticalRating: 90,
      deadlyRating: 60,
      runSpeed: 6,
      walkSpeed: 1.5,
    }
    const clientContext = {
      classId: 'knight' as const,
      level: 30,
      physicalAttribute: 'strength' as const,
      physicalChannel: 'melee' as const,
      magicWeapon: false,
      criticalOptionRate: 0,
      deadlyOptionRate: 0,
    }
    const hero = createCombat({ level: 30, stats: stats({ client, clientContext }) }, 'm', {
      level: 1,
      stats: stats(),
    })
    const r = drinkPotion(hero, supply(391))
    expect(r.problem).toBeNull()
    expect(runSpeed(effectiveStats(r.state.player))).toBeCloseTo(7)
    const effect = r.state.player.effects.find((e) => e.itemId === 391)!
    expect(effect.remaining).toBe(200)
    expect(effect.stats).toEqual([{ kind: 'stat', stat: 'runSpeed', value: 10, percent: false }])
  })

  it('Platinum Adrenaline: 15% faster attacks, stays when the hero dies', () => {
    const r = drinkPotion(fight(), supply(2138))
    expect(effectiveStats(r.state.player).attackInterval).toBeCloseTo(1.3)
    let state: CombatState = {
      ...r.state,
      phase: 'fighting',
      player: { ...r.state.player, hp: 1 },
      monster: { ...r.state.monster, stats: stats({ attack: 9999 }), cooldown: 0 },
    }
    for (let i = 0; i < 100 && state.phase !== 'defeat'; i++)
      state = combatTick(state, 0.1, createRng(i)).state
    expect(state.phase).toBe('defeat')
    expect(state.player.effects.some((e) => e.itemId === 2138)).toBe(true)
  })

  it('Potion of Haste ends when the hero dies', () => {
    const r = drinkPotion(fight(), supply(391))
    let state: CombatState = {
      ...r.state,
      phase: 'fighting',
      player: { ...r.state.player, hp: 1 },
      monster: { ...r.state.monster, stats: stats({ attack: 9999 }), cooldown: 0 },
    }
    for (let i = 0; i < 100 && state.phase !== 'defeat'; i++)
      state = combatTick(state, 0.1, createRng(i)).state
    expect(state.player.effects.some((e) => e.itemId === 391)).toBe(false)
  })

  it('the cooldown potion shortens skill reuse by the server formula, one at a time', () => {
    const r = drinkPotion(fight(), supply(6916))
    const rank = { cooldown: 10, fixedCooldown: false } as SkillRank
    // × 150/250 × 100/200 = 0.3
    expect(skillCooldownTime(rank, effectiveStats(r.state.player))).toBe(3)
    const cooled = { ...r.state, player: { ...r.state.player, potionCooldowns: {} } }
    expect(drinkPotion(cooled, supply(6916)).problem).toBe('working')
  })

  it('keeps what is left in the save: game time, or the clock for SF_ABSTIME', () => {
    const now = 1_000_000
    // each boost has its own reuse timer: both go in one after the other
    let state = drinkPotion(fight(), supply(2138)).state
    state = drinkPotion(state, supply(6916)).state
    state = combatTick(state, 100, createRng(1)).state
    const saved = boostsOf(state.player.effects, now)
    expect(saved).toEqual([
      { itemId: 2138, remaining: 3500 },
      { itemId: 6916, remaining: 3500, until: now + 3_500_000 },
    ])
    // an hour later: Adrenaline waited (relative time), the cooldown potion ran out by the clock
    const later = now + 3_600_000
    expect(liveBoosts(saved, later)).toEqual([{ itemId: 2138, remaining: 3500 }])
    expect(boostEffects(saved, later).map((e) => [e.itemId, e.remaining])).toEqual([[2138, 3500]])
  })

  it('a report keeps only boosts the hero had or drank, never longer than the potion', () => {
    const now = 5_000
    const kept = reportedBoosts(
      [{ itemId: 391, remaining: 50 }],
      [2138],
      [
        { itemId: 391, remaining: 40 },
        { itemId: 2138, remaining: 99_999 },
        { itemId: 6916, remaining: 100 },
        { itemId: 44, remaining: 10 },
      ],
      now,
    )
    expect(kept).toEqual([
      { itemId: 391, remaining: 40 },
      { itemId: 2138, remaining: 3600 },
    ])
  })
})

describe('the same magic at another level (CAssistList::CanApply / DelDuplicate)', () => {
  it('Super Haste keeps the Potion of Haste out', () => {
    const fast = drinkPotion(fight(), supply(2845)).state
    const r = drinkPotion(fast, supply(391))
    expect(r.problem).toBe('stronger')
    expect(r.state.player.effects.map((e) => e.itemId)).toEqual([2845])
  })

  it('Super Haste takes the place of a working Potion of Haste', () => {
    const slow = drinkPotion(fight(), supply(391)).state
    const r = drinkPotion(slow, supply(2845))
    expect(r.problem).toBeNull()
    expect(r.state.player.effects.map((e) => e.itemId)).toEqual([2845])
  })

  it('saved boosts keep their magic levels', () => {
    const [effect] = boostEffects([{ itemId: 2845, remaining: 60, until: 61_000 }], 1000)
    expect(effect!.magics).toEqual([{ magic: 119, level: 7 }])
  })
})
