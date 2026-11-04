import { describe, expect, it } from 'vitest'
import { ITEMS } from '../data/items.ts'
import { MONSTERS } from '../data/monsters.ts'
import type { SkillDef } from '../data/types.ts'
import { simulateAfk } from './afk.ts'
import { sourceSkillDamage } from './balance.ts'
import { createCharacterData } from './character.ts'
import { combatTick, createCombat, effectiveStats, skillCooldownTime } from './combat.ts'
import { playerFighter } from './fighters.ts'
import { classRecovery, naturalRecovery } from './recovery.ts'
import { createRng } from './rng.ts'
import { selectSourceHit, sourceHitWeights } from './sourceHitTypes.ts'
import { TITLES } from '../data/titles.ts'
import { OPTIONS } from '../data/items.ts'
import { rollSourceDrops } from './loot.ts'
import { applyStats, interpretEffect, isAvailable, skillRank, type SkillRank } from './skills.ts'

describe('source audit regressions', () => {
  it('keeps NPC physical and magic buffs separate and selects its declared attack type', () => {
    const base = playerFighter({ classId: 'knight', level: 1, equipment: {}, skills: {} }).stats
    const npc = {
      ...base,
      client: undefined,
      clientContext: undefined,
      attackType: 'magic' as const,
      physicalAttack: 20,
      magicAttack: 200,
      attack: 200,
      physicalHit: 100,
      magicHit: 80,
      hit: 80,
      dodge: 17,
      magicEvasion: 50,
    }
    const changed = applyStats(npc, [
      { kind: 'stat', stat: 'attack', value: 10, percent: false },
      { kind: 'stat', stat: 'magicAttack', value: 50, percent: false },
      { kind: 'stat', stat: 'hit', value: 7, percent: false },
      { kind: 'stat', stat: 'magicHit', value: 11, percent: false },
      { kind: 'stat', stat: 'magicEvasion', value: 20, percent: false },
    ])
    expect(changed).toMatchObject({
      physicalAttack: 30,
      magicAttack: 250,
      attack: 250,
      physicalHit: 107,
      magicHit: 91,
      hit: 91,
      dodge: 17,
      magicEvasion: 70,
    })
  })
  it('selects four times over all twenty drop slots instead of rolling every item', () => {
    const slots = Array.from({ length: 20 }, (_, i) => (i === 0 ? { itemId: 43, chance: 1 } : null))
    expect(rollSourceDrops(slots, 1, () => 0)).toEqual([{ itemId: 43, count: 4 }])
    expect(rollSourceDrops(slots, 1, () => 0.99)).toEqual([])
    const count = rollSourceDrops(slots, 10000, createRng(7))[0]!.count
    expect(count).toBeGreaterThan(1800)
    expect(count).toBeLessThan(2200)
    expect(() => rollSourceDrops(slots.slice(1), 1, createRng(1))).toThrow('20 slots')
  })
  it('rolls Deadly independently and never changes the critical damage multiplier', () => {
    const fighter = playerFighter({ classId: 'knight', level: 1, equipment: {}, skills: {} })
    const boosted = applyStats(fighter.stats, [
      { kind: 'stat', stat: 'deadly', value: 20, percent: true },
    ])
    const defender = { stats: { ...fighter.stats, constitution: 30 } }
    expect(sourceHitWeights(fighter, defender)).toEqual([60, 585, 125, 100, 90, 60])
    expect(sourceHitWeights({ ...fighter, stats: boosted }, defender)).toEqual([
      60, 585, 125, 100, 90, 1260,
    ])
    expect(boosted.critMultiplier).toBe(fighter.stats.critMultiplier)
    expect(selectSourceHit([1, 1, 1, 1, 1, 1], () => 0)).toBe('deadly')
    expect(
      sourceHitWeights(fighter, { stats: { ...defender.stats, constitution: undefined } }),
    ).toBeNull()
  })

  it('pays the title bonus before expiry and keeps its history through an expedition', () => {
    const titleId = 9199,
      original = OPTIONS[82]
    OPTIONS[82] = {
      type: 82,
      name: 'EXP fixture',
      values: [50],
      weights: [0],
      weaponMask: 0,
      armorMask: 0,
      accessoryMask: 0,
    }
    TITLES[titleId] = {
      id: titleId,
      item: 0,
      name: 'Expiry fixture',
      description: '',
      days: 1,
      color: '#fff',
      outline: '#000',
      options: [{ type: 82, level: 1 }],
    }
    try {
      const hero = {
        ...createCharacterData({ name: 'Expiry', classId: 'knight' }, 'expiry', 0),
        level: 50,
        skills: {},
        equipment: {},
        exp: 0,
        titles: [{ id: titleId, expiresAt: 300000 }],
        activeTitle: titleId,
        expedition: { zoneId: 'glade', monsterId: 'rust-golem', startedAt: 0 },
      }
      // Equal-level fixture avoids overlevel penalties without making its HP/attack strong.
      const before = MONSTERS['rust-golem']!
      MONSTERS['rust-golem'] = { ...before, level: 50 }
      try {
        const half = simulateAfk(hero, 600, createRng(4), 600000)
        const plain = simulateAfk({ ...hero, activeTitle: null }, 600, createRng(4), 600000)
        const full = simulateAfk(
          { ...hero, titles: [{ id: titleId, expiresAt: 700000 }] },
          600,
          createRng(4),
          600000,
        )
        expect(half.kills).toBe(plain.kills)
        expect(half.exp).toBeGreaterThan(plain.exp)
        expect(half.exp).toBeLessThan(full.exp)
        expect(half.character.activeTitle).toBeNull()
      } finally {
        MONSTERS['rust-golem'] = before
      }
    } finally {
      delete TITLES[titleId]
      if (original) OPTIONS[82] = original
      else delete OPTIONS[82]
    }
  })
  it('makes Healer INT affect a staff attack, and DEX affect a bow attack', () => {
    const staffId = 91991,
      bowId = 91992
    const common = { level: 1, price: 0, type: 'weapon' as const, name: 'Source channel fixture' }
    const gear = {
      slot: 'weapon' as const,
      classes: ['healer' as const],
      attack: 10,
      magicAttack: 80,
      defense: 0,
      magicDefense: 0,
    }
    ITEMS[staffId] = { ...common, id: staffId, gear: { ...gear, subtype: 12 } }
    ITEMS[bowId] = { ...common, id: bowId, gear: { ...gear, subtype: 6 } }
    try {
      const hero = (itemId: number, allocatedStats = {}) =>
        playerFighter({
          classId: 'healer',
          level: 30,
          skills: {},
          allocatedStats,
          equipment: { weapon: { uid: 'weapon', itemId, plus: 0 } },
        })
      const staff = hero(staffId).stats,
        bow = hero(bowId).stats
      const intelligence = hero(staffId, { intelligence: 15 }).stats
      expect(staff.attack).toBe(staff.client!.magicAttack)
      expect(intelligence.attack - staff.attack).toBe(10)
      expect(hero(staffId, { dexterity: 15 }).stats.attack).toBe(staff.attack)
      expect(hero(bowId, { dexterity: 15 }).stats.attack - bow.attack).toBe(10)
      expect(hero(bowId, { intelligence: 15 }).stats.attack).toBe(bow.attack)
      expect(staff.maxHp).toBe(632)
    } finally {
      delete ITEMS[staffId]
      delete ITEMS[bowId]
    }
  })

  it('uses integer source attack pulses and the nonlinear PC cooldown', () => {
    const stats = playerFighter({ classId: 'knight', level: 30, skills: {}, equipment: {} }).stats
    expect(
      applyStats({ ...stats, attackInterval: 1.5 }, [
        { kind: 'stat', stat: 'attackSpeed', value: -30, percent: true },
      ]).attackInterval,
    ).toBe(1.9)
    expect(
      applyStats({ ...stats, attackInterval: 1 }, [
        { kind: 'stat', stat: 'attackSpeed', value: 20, percent: true },
      ]).attackInterval,
    ).toBe(0.8)
    const rank = { cooldown: 3.5 } as SkillRank
    expect(skillCooldownTime(rank, { ...stats, cooldownReduction: 80 })).toBe(1.3)
    expect(
      skillCooldownTime(
        { ...rank, fixedCooldown: true },
        { ...stats, cooldownReduction: 80, reuseTime: -2 },
      ),
    ).toBe(3.5)
    expect(skillCooldownTime({ ...rank, cooldown: 0 }, stats)).toBe(1)
  })

  it('recovers the bonus +2 five times in 15 seconds, independently from rendering', () => {
    const player = playerFighter({ classId: 'knight', level: 30, skills: {}, equipment: {} })
    expect(classRecovery('knight', 30)).toEqual({ hp: 15, mp: 15 })
    expect(naturalRecovery(player.stats, true)).toEqual({ hp: 1, mp: 1 })
    const boosted = applyStats(player.stats, [
      { kind: 'stat', stat: 'mpRegen', value: 2, percent: false },
    ])
    const target = { ...player, stats: { ...player.stats, maxHp: 1e9, attack: 0 } }
    const run = (stats: typeof boosted) => {
      const state = createCombat({ ...player, stats }, 'fixture', target)
      state.phase = 'fighting'
      state.player.mp = 0
      state.player.cooldown = 100
      state.monster.cooldown = 100
      return combatTick(state, 15, createRng(1)).state.player.mp
    }
    expect(run(boosted) - run(player.stats)).toBe(10)
  })

  it('distinguishes BLOOD from stun and keeps unknown hitrate distinct from power', () => {
    expect(
      interpretEffect({ type: 2, subtype: 5, damageType: 1, power: 20, hitrate: 7000 }),
    ).toMatchObject({ kind: 'poison', dotKind: 'blood', chance: 0.7 })
    expect(
      interpretEffect({ type: 2, subtype: 2, damageType: 0, power: 0, hitrate: 5000 }),
    ).toEqual({ kind: 'state', state: 'confusion', chance: 0.5 })
    expect(interpretEffect({ type: 2, subtype: 7, damageType: 0, power: 99 })).toEqual({
      kind: 'stun',
      chance: undefined,
    })
    expect(interpretEffect({ type: 0, subtype: 14, damageType: 2, power: 20 })).toMatchObject({
      kind: 'stat',
      stat: 'deadly',
    })
  })

  it('ordinary DOT cannot deal the final point of damage', () => {
    const fighter = playerFighter({ classId: 'knight', level: 30, equipment: {}, skills: {} })
    let state = createCombat(fighter, 'fixture', fighter)
    state = {
      ...state,
      phase: 'fighting',
      monster: {
        ...state.monster,
        hp: 5,
        cooldown: 100,
        effects: [
          {
            skillId: 123,
            name: 'Poison',
            remaining: 10,
            stats: [],
            stun: false,
            poison: 6,
            nextTick: 1,
          },
        ],
      },
      player: { ...state.player, cooldown: 100 },
    }
    const result = combatTick(state, 2.1, createRng(1))
    expect(result.state.monster.hp).toBe(1)
    expect(result.events.some((e) => e.type === 'death')).toBe(false)
  })

  it('does not sell a partially implemented or unknown-chance skill for SP', () => {
    const skill: SkillDef = {
      id: 9988,
      classId: 'rogue',
      name: 'Partial',
      description: '',
      type: 3,
      targetType: 0,
      readyTime: 0,
      fireTime: 0,
      reuseTime: 0,
      levels: [
        {
          level: 1,
          hp: 0,
          mp: 0,
          duration: 0,
          learnLevel: 1,
          learnSp: 5,
          requires: [],
          effects: [
            { type: 0, subtype: 5, power: 5, damageType: 1 },
            { type: 6, subtype: 4, damageType: 2, power: 4 },
          ],
        },
      ],
    }
    expect(isAvailable(skill)).toBe(false)
    expect(
      isAvailable({
        ...skill,
        levels: [
          { ...skill.levels[0]!, effects: [{ type: 2, subtype: 7, damageType: 0, power: 100 }] },
        ],
      }),
    ).toBe(false)
  })

  it('keeps source ADDITION and ONLYPOWER distinct from a percent normal hit', () => {
    const attacker = playerFighter({ classId: 'knight', level: 1, equipment: {}, skills: {} })
    const defender = {
      level: 1,
      stats: {
        ...attacker.stats,
        client: undefined,
        clientContext: undefined,
        defense: 50,
        dodge: 130,
      },
    }
    expect(sourceSkillDamage(attacker, defender, { type: 0, power: 150 })).toBe(150)
    // STR38 =>19, (weapon0*1.01 +150)*1.5 =225, DEF50/5=10; 19+225-10=234.
    expect(sourceSkillDamage(attacker, defender, { type: 1, power: 150 })).toBe(234)
    expect(
      skillRank(
        {
          id: 9,
          classId: 'mage',
          name: 'Magic',
          description: '',
          type: 2,
          targetType: 2,
          readyTime: 0,
          fireTime: 0,
          reuseTime: 10,
          levels: [
            {
              level: 1,
              hp: 0,
              mp: 1,
              duration: 0,
              learnLevel: 1,
              learnSp: 0,
              requires: [],
              effects: [{ type: 3, subtype: 0, damageType: 1, power: 150 }],
            },
          ],
        },
        1,
      ).attackType,
    ).toBe('magic')
  })

  it('AFK actually exhausts its last potion during combat rather than at a 600-second boundary', () => {
    const original = MONSTERS['stone-sentinel']!
    MONSTERS['stone-sentinel'] = {
      ...original,
      stats: { ...original.stats, maxHp: 800, attack: 75 },
    }
    try {
      const hero = {
        ...createCharacterData({ name: 'Finite', classId: 'knight' }, 'finite', 0),
        skills: {},
        titles: [],
        activeTitle: null,
        expedition: { zoneId: 'glade', monsterId: original.id, startedAt: 0 },
        inventory: [{ itemId: 43, count: 1 }],
        potionSlots: { hp: { itemId: 43, auto: true }, mp: { itemId: null, auto: true } },
      }
      const one = simulateAfk(hero, 600, createRng(7), 600000)
      const plenty = simulateAfk(
        { ...hero, inventory: [{ itemId: 43, count: 10000 }] },
        600,
        createRng(7),
        600000,
      )
      expect(one.potionsUsed).toEqual([{ itemId: 43, count: 1 }])
      expect(one.deaths).toBeGreaterThan(plenty.deaths)
      expect(one.character.inventory.some((s) => s.itemId === 43)).toBe(false)
    } finally {
      MONSTERS[original.id] = original
    }
  })

  it('Tyrant ends as soon as its one-second MP upkeep becomes unaffordable', () => {
    const player = playerFighter({ classId: 'titan', level: 20, skills: {}, equipment: {} })
    const state = createCombat(player, 'fixture', player)
    state.phase = 'fighting'
    state.player.mp = 0
    state.player.cooldown = 100
    state.monster.cooldown = 100
    state.player.effects = [
      {
        skillId: 42,
        name: 'Tyrant',
        remaining: 100,
        stats: [{ kind: 'stat', stat: 'defense', value: 20, percent: false }],
        stun: false,
        poison: 0,
        nextTick: 1,
        mpChange: { power: -1, percent: false },
      },
    ]
    expect(effectiveStats(state.player).defense).toBe(player.stats.defense + 20)
    const result = combatTick(state, 1.1, createRng(1))
    expect(result.state.player.effects).toEqual([])
    expect(result.state.player.mp).toBe(0)
  })
})
