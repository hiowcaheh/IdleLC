import { describe, expect, it } from 'vitest'
import type { CombatStats, SkillDef, SkillEffectDef } from '../data/types.ts'
import {
  TIMINGS,
  chooseSkill,
  combatTick,
  createCombat,
  type CombatEvent,
  type CombatState,
  type FighterInit,
} from './combat.ts'
import type { Rng } from './rng.ts'
import {
  applyStats,
  interpretEffect,
  passiveReflect,
  skillRank,
  unavailableReason,
  type SkillRank,
} from './skills.ts'

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1,
  critChance: 0,
  critMultiplier: 1.5,
  ...over,
})

const effect = (over: Partial<SkillEffectDef>): SkillEffectDef => ({
  magic: 1,
  type: 0,
  subtype: 0,
  damageType: 1,
  power: 0,
  ...over,
})

const definition = (over: Partial<SkillDef> & { effects: SkillEffectDef[] }): SkillDef => {
  const { effects, ...rest } = over
  return {
    id: 900,
    classId: 'titan',
    name: 'Fixture',
    description: '',
    type: 0,
    targetType: 2,
    readyTime: 0,
    fireTime: 0,
    reuseTime: 300,
    levels: [
      {
        level: 1,
        mp: 10,
        hp: 0,
        duration: 0,
        learnLevel: 1,
        learnSp: 0,
        requires: [],
        effects,
      },
    ],
    ...rest,
  }
}

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

const engaged = (player: FighterInit, monster: FighterInit): CombatState => {
  const s = createCombat(player, 'm', monster)
  return {
    ...s,
    phase: 'fighting',
    monster: { ...s.monster, cooldown: monster.stats.attackInterval * TIMINGS.monsterInitiative },
  }
}

describe('Far Seeing (MST_STAT_ATTACKDIST)', () => {
  it('adds metres, then the rate, to the attack range (Character.cpp:459–460)', () => {
    const far = interpretEffect(effect({ subtype: 17, damageType: 1, power: 3 }))
    expect(far).toEqual({ kind: 'stat', stat: 'attackRange', value: 3, percent: false })
    const longer = applyStats(stats({ attackRange: 15 }), [
      far as Extract<typeof far, { kind: 'stat' }>,
      { kind: 'stat', stat: 'attackRange', value: 10, percent: true },
    ])
    expect(longer.attackRange).toBeCloseTo(19.8)
  })
})

describe('Combat Reflection (MST_OTHER_REFLEX)', () => {
  const reflection = skillRank(
    definition({
      type: 3,
      targetType: 0,
      effects: [
        effect({ magic: 2, type: 6, subtype: 4, damageType: 2, power: 20, hitrate: 2500 }),
        effect({ magic: 3, type: 0, subtype: 5, damageType: 1, power: 30, hitrate: 10000 }),
      ],
    }),
    1,
  )

  it('is a passive with the hit rate as its chance; evasion still counts', () => {
    expect(reflection.kind).toBe('passive')
    expect(passiveReflect([reflection])).toEqual({ chance: 0.25, flat: 0, rate: 20 })
  })

  it('sends a share of a survived hit back to the monster', () => {
    const hero = {
      level: 10,
      stats: stats({ maxHp: 5000, reflect: { chance: 1, flat: 0, rate: 50 } }),
    }
    const monster = { level: 10, stats: stats({ maxHp: 5000, attack: 60, defense: 0 }) }
    const { events } = run(engaged(hero, monster), 3, () => 0.01)
    const taken = events.filter(
      (e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit' && e.target === 'player',
    )
    expect(taken.length).toBeGreaterThan(0)
    for (const hit of taken) {
      const back = events[events.indexOf(hit) + 1]
      expect(back).toMatchObject({
        type: 'hit',
        target: 'monster',
        amount: Math.trunc((hit.amount * 50) / 100),
        reflected: true,
      })
    }
  })

  it('can finish the monster, which counts as a kill', () => {
    const hero = {
      level: 10,
      stats: stats({ maxHp: 5000, attack: 1, reflect: { chance: 1, flat: 200, rate: 0 } }),
    }
    const monster = { level: 10, stats: stats({ maxHp: 150, attack: 60, defense: 50 }) }
    const { state, events } = run(engaged(hero, monster), 3, () => 0.01)
    expect(events).toContainEqual({ type: 'death', who: 'monster' })
    expect(state.kills).toBe(1)
  })
})

describe('Charge (MST_OTHER_SKILLCANCEL)', () => {
  const charge = skillRank(
    definition({
      flag: 4,
      effects: [effect({ type: 6, subtype: 1, damageType: 1, power: 0, hitrate: 10000 })],
    }),
    1,
  )
  const monsterSkill: SkillRank = {
    ...charge,
    id: 77,
    name: 'Big Swing',
    kind: 'attack',
    effects: [{ kind: 'damage', percent: 300 }],
  }
  const hero = { level: 10, stats: stats({ maxMp: 100, attack: 20 }), skills: [charge] }
  const monster = { level: 10, stats: stats({ maxHp: 5000, attack: 1, defense: 0 }) }

  it('is a curse that cancels a skill the monster is still readying', () => {
    expect(charge).toMatchObject({ kind: 'debuff', offensive: true })
    const state = engaged(hero, monster)
    state.monster.casting = monsterSkill
    state.monster.impactIn = 2
    state.monster.cooldown = 2
    const { state: after, events } = run(state, 0.6, () => 0.01)
    expect(events).toContainEqual({ type: 'interrupt', target: 'monster', skillId: 77 })
    expect(after.monster.casting).toBeNull()
    expect(after.monster.impactIn).toBeNull()
  })

  it('waits for a skill to cancel instead of being spent on nothing (own rule)', () => {
    const state = engaged(hero, monster)
    expect(chooseSkill(state.player, state.monster)).toBeNull()
    state.monster.casting = monsterSkill
    state.monster.impactIn = TIMINGS.impactDelay + 0.1
    expect(chooseSkill(state.player, state.monster)).toBeNull()
    state.monster.impactIn = 2
    expect(chooseSkill(state.player, state.monster)?.id).toBe(charge.id)
  })
})

describe("Veteran's Composure", () => {
  const rank = skillRank(
    {
      ...definition({ targetType: 3, flag: 32772, reuseTime: 18000, effects: [] }),
      levels: [
        {
          level: 1,
          mp: 0,
          hp: 0,
          duration: 1200,
          learnLevel: 100,
          learnSp: 0,
          requires: [],
          effects: [
            effect({ magic: 1, subtype: 1, damageType: 2, power: -10 }),
            effect({ magic: 2, subtype: 7, damageType: 2, power: -10 }),
            effect({ magic: 3, type: 6, subtype: 8, damageType: 0, power: 1000 }),
          ],
        },
      ],
    },
    1,
  )

  it('weakens the monster for its duration; the taunt changes nothing one on one', () => {
    expect(rank).toMatchObject({ kind: 'debuff', offensive: true, notBoss: true, duration: 120 })
    expect(rank.effects).toContainEqual({ kind: 'taunt', power: 1000 })
  })

  it('is never used on a boss (SF_NOT_BOSS)', () => {
    const hero = { level: 100, stats: stats({ maxMp: 100 }), skills: [rank] }
    const plain = createCombat(hero, 'm', { level: 100, stats: stats() })
    expect(chooseSkill(plain.player, plain.monster)?.id).toBe(rank.id)
    const boss = createCombat(hero, 'm', { level: 100, stats: stats({ boss: true }) })
    expect(chooseSkill(boss.player, boss.monster)).toBeNull()
  })
})

describe('skills that still have no counterpart', () => {
  it('say why in the Skills window', () => {
    expect(
      unavailableReason(
        definition({ effects: [effect({ type: 5, subtype: 6, damageType: 2, power: 30 })] }),
      ),
    ).toMatch(/party member/)
    expect(
      unavailableReason(definition({ effects: [effect({ type: 2, subtype: 15, power: 0 })] })),
    ).toMatch(/Invisibility/)
  })
})
