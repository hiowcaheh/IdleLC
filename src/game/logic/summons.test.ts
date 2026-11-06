import { describe, expect, it } from 'vitest'
import type { CombatStats } from '../data/types.ts'
import { createCharacterData } from './character.ts'
import {
  TIMINGS,
  canSummon,
  chooseSkill,
  combatTick,
  createCombat,
  type CombatEvent,
  type CombatState,
  type FighterInit,
} from './combat.ts'
import { playerFighter } from './fighters.ts'
import type { Rng } from './rng.ts'
import type { SkillRank } from './skills.ts'
import {
  SUMMON_DELAY,
  SUMMON_DURATION,
  elementalBlocks,
  elementalStats,
  passiveAppliesTo,
} from './summons.ts'

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

function run(state: CombatState, seconds: number, rng: Rng, frame = 1 / 20) {
  let s = state
  const events: CombatEvent[] = []
  for (let t = 0; t < seconds; t += frame) {
    const r = combatTick(s, frame, rng)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}

const summonRank = (element: 0 | 1 | 2 | 3, id = 294): SkillRank => ({
  id,
  name: 'Summon',
  level: 1,
  kind: 'buff',
  offensive: false,
  mpCost: 10,
  hpCost: 0,
  castTime: 0,
  fireTime: 0,
  cooldown: 5,
  duration: 0,
  effects: [{ kind: 'summon', element }],
  auto: true,
})

const sorcerer = (level = 30) =>
  playerFighter(
    { ...createCharacterData({ name: 'Caller', classId: 'sorcerer' }, 'c', 0), level },
    0,
  )

describe('elemental stats (CElemental::CElemental)', () => {
  it('take HP from the summoner STR and CON, a share of its magic and armor, its level as resist', () => {
    const hero = sorcerer(30).stats
    const fire = elementalStats(0, 30, hero, hero, [])!
    const strength = hero.strength!,
      constitution = hero.constitution!
    expect(fire.maxHp).toBe(50 + 5 * (strength - 20) + 5 * (constitution - 28))
    expect(elementalStats(1, 30, hero, hero, [])!.maxHp).toBe(fire.maxHp - 20)
    const part = Math.trunc((hero.intelligence! * 10) / 15)
    const eq = hero.clientContext!.equipmentMagic!
    const op = hero.client!.magicAttack - part - eq
    expect(fire.client!.magicAttack).toBe(
      part + Math.trunc((eq * 8) / 10) + Math.trunc((op * 8) / 10),
    )
    expect(fire).toMatchObject({
      attackType: 'magic',
      attackInterval: 2,
      attackRange: 2,
      defenseChannels: { magic: 30 },
    })
    expect(fire.hit).toBe(hero.magicHit)
    expect(fire.clientContext).toMatchObject({ elemental: true, criticalOptionRate: 0 })
  })

  it('get the passives meant for them (Empowered…), the hero only its own', () => {
    expect(passiveAppliesTo(297, 2)).toBe(true)
    expect(passiveAppliesTo(297, 0)).toBe(false)
    expect(passiveAppliesTo(297, 'hero')).toBe(false)
    expect(passiveAppliesTo(304, 'hero')).toBe(true)
    expect(passiveAppliesTo(304, 3)).toBe(true)
    expect(passiveAppliesTo(1, 'hero')).toBe(true)
    expect(passiveAppliesTo(1, 0)).toBe(false)
    const hero = sorcerer(30).stats
    const plain = elementalStats(0, 30, hero, hero, [])!
    const empowered = elementalStats(0, 30, hero, hero, [
      { kind: 'stat', stat: 'magicAttack', value: 20, percent: false },
    ])!
    expect(empowered.client!.magicAttack).toBe(plain.client!.magicAttack + 20)
  })

  it('fire and wind never stand with earth or water, nor two of a kind', () => {
    expect(elementalBlocks(0, 1)).toBe(false)
    expect(elementalBlocks(2, 3)).toBe(false)
    expect(elementalBlocks(0, 2)).toBe(true)
    expect(elementalBlocks(1, 3)).toBe(true)
    expect(elementalBlocks(3, 3)).toBe(true)
  })
})

describe('elementals in a fight', () => {
  const elemental = (over: Partial<CombatStats> = {}) =>
    stats({ maxHp: 300, attack: 40, attackInterval: 2, attackType: 'magic', ...over })
  const hero = (
    summonStats: FighterInit['summonStats'],
    skills = [summonRank(0)],
    over: Partial<CombatStats> = {},
  ): FighterInit => ({
    level: 20,
    stats: stats({ maxHp: 5000, maxMp: 500, attack: 1, ...over }),
    skills,
    summonStats,
  })
  const fight = (player: FighterInit, monster: FighterInit): CombatState => {
    const s = createCombat(player, 'm', monster)
    return { ...s, phase: 'fighting', monster: { ...s.monster, cooldown: 0.5 } }
  }
  const monster = { level: 20, stats: stats({ maxHp: 100000, attack: 30, defense: 0 }) }

  it('the hero calls one, which swings every 2 s at the monster', () => {
    const { state, events } = run(fight(hero({ 0: elemental() }), monster), 5, () => 0.01)
    expect(events).toContainEqual({ type: 'summon', element: 0, name: 'Fire Elemental' })
    expect(state.player.summons).toHaveLength(1)
    const swings = events.filter((e) => e.type === 'summonAttack')
    expect(swings.length).toBeGreaterThanOrEqual(2)
    expect(swings.length).toBeLessThanOrEqual(3)
    expect(events.some((e) => e.type === 'hit' && e.target === 'monster' && e.by === 0)).toBe(true)
  })

  it('the monster turns on whoever it hates most, and a fallen elemental waits 5 s to come back', () => {
    const strong = elemental({ attack: 5000, maxHp: 50 })
    const { state, events } = run(fight(hero({ 0: strong }), monster), 12, () => 0.01)
    expect(events.some((e) => e.type === 'attack' && e.source === 'monster' && e.at === 0)).toBe(
      true,
    )
    const gone = events.findIndex((e) => e.type === 'summonGone' && e.died)
    expect(gone).toBeGreaterThan(-1)
    expect(events.some((e) => e.type === 'summonHit')).toBe(true)
    // it came back once its 5 s were over
    const again = events.findIndex((e, i) => i > gone && e.type === 'summon')
    expect(again).toBeGreaterThan(gone)
    expect(state.player.summons?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('cannot be called while one of a blocking kind is there or its delay runs', () => {
    const s = fight(hero({ 0: elemental(), 2: elemental() }), monster)
    expect(canSummon(s.player, 2)).toBe(true)
    const after = run(s, 0.5, () => 0.01).state
    expect(after.player.summons?.map((x) => x.element)).toEqual([0])
    expect(canSummon(after.player, 2)).toBe(false)
    expect(canSummon(after.player, 1)).toBe(false) // not learned
    after.player.summonDelay = { 2: SUMMON_DELAY }
    after.player.summons = []
    expect(canSummon(after.player, 2)).toBe(false)
  })

  it('leaves after 20 minutes, and with the hero when the hero falls', () => {
    const s = fight(hero({ 0: elemental() }, [summonRank(0)]), monster)
    const called = run(s, 0.5, () => 0.01).state
    expect(called.player.summons).toHaveLength(1)
    called.player.summons![0]!.remaining = 0.1
    called.player.skills = []
    const later = run(called, 0.3, () => 0.01)
    expect(later.events).toContainEqual({ type: 'summonGone', element: 0, died: false })
    expect(SUMMON_DURATION).toBe(1200)

    const weak = fight(hero({ 0: elemental() }, [summonRank(0)], { maxHp: 50 }), {
      level: 20,
      stats: stats({ maxHp: 100000, attack: 400, defense: 0 }),
    })
    const fallen = run(weak, 6, () => 0.01)
    expect(fallen.events).toContainEqual({ type: 'death', who: 'player' })
    const death = fallen.events.findIndex((e) => e.type === 'death')
    expect(fallen.events[death + 1]).toMatchObject({ type: 'summonGone', died: false })
  })

  it('a taunt turns the monster back to the hero', () => {
    const taunt: SkillRank = {
      ...summonRank(0, 1348),
      kind: 'debuff',
      offensive: true,
      cooldown: 1800,
      duration: 120,
      effects: [
        { kind: 'stat', stat: 'defense', value: -10, percent: true },
        { kind: 'taunt', power: 1000 },
      ],
    }
    const s = fight(hero({ 0: elemental({ attack: 5000, maxHp: 100000 }) }), monster)
    const hated = run(s, 4, () => 0.01).state
    expect(hated.player.summons![0]!.hate).toBeGreaterThan(hated.player.hate ?? 0)
    hated.player.skills = [taunt]
    hated.player.cooldown = 0
    hated.player.impactIn = null
    const { state } = run(hated, TIMINGS.impactDelay + 0.1, () => 0.01)
    expect(state.player.hate).toBeGreaterThan(state.player.summons![0]!.hate)
  })

  it('auto use calls each kind once while it stays', () => {
    const s = fight(hero({ 0: elemental() }), monster)
    expect(chooseSkill(s.player, s.monster)?.id).toBe(294)
    const after = run(s, 0.5, () => 0.01).state
    after.player.skillCooldowns = {}
    expect(chooseSkill(after.player, after.monster)).toBeNull()
  })
})
