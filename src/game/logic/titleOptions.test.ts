import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OPTIONS } from '../data/items.ts'
import { TITLES } from '../data/titles.ts'
import type { CombatStats, OptionDef } from '../data/types.ts'
import { createCharacterData } from './character.ts'
import { playerFighter } from './fighters.ts'
import { naturalRecovery } from './recovery.ts'
import { skillRank } from './skills.ts'
import { sourceHitWeights } from './sourceHitTypes.ts'

// t_option values of the database (level 1), as fixtures for the placeholder data the tests run on
const FIXTURES: Record<number, number> = {
  50: 40,
  55: 150,
  99: 2,
  101: 30,
  102: 4,
  103: 1,
  104: 15,
  105: 8,
  106: 600,
}
const TITLE_ID = 9300
const saved = new Map<number, OptionDef | undefined>()

beforeEach(() => {
  for (const [type, value] of Object.entries(FIXTURES)) {
    saved.set(Number(type), OPTIONS[Number(type)])
    OPTIONS[Number(type)] = {
      type: Number(type),
      name: `Option ${type}`,
      values: [value],
      weights: [0],
      weaponMask: 0,
      armorMask: 0,
      accessoryMask: 0,
    }
  }
})

afterEach(() => {
  for (const [type, option] of saved) {
    if (option) OPTIONS[type] = option
    else delete OPTIONS[type]
  }
  delete TITLES[TITLE_ID]
})

/** A level 30 knight wearing a title with the given options. */
function titled(...types: number[]) {
  TITLES[TITLE_ID] = {
    id: TITLE_ID,
    item: 0,
    name: 'Fixture',
    description: '',
    days: null,
    color: '#fff',
    outline: '#000',
    options: types.map((type) => ({ type, level: 1 })),
  }
  return playerFighter(
    {
      ...createCharacterData({ name: 'Titled', classId: 'knight' }, 'titled', 0),
      level: 30,
      equipment: {},
      titles: [{ id: TITLE_ID, expiresAt: null }],
      activeTitle: TITLE_ID,
    },
    0,
  ).stats
}

const plain = () => titled()

describe('title options as CPC::ApplyTitle applies them', () => {
  it('All Stats (99) is shown on the attributes but changes no combat stat', () => {
    const stats = titled(99)
    const before = plain()
    expect(stats.shownAttributeBonus).toBe(2)
    expect(stats.strength).toBe(before.strength)
    expect(stats.maxHp).toBe(before.maxHp)
    expect(stats.client).toEqual(before.client)
  })

  it('option 50 does nothing on a title (m_opIncreaseInven is never read)', () => {
    expect(titled(50).recoveryOptions).toEqual(plain().recoveryOptions)
  })

  it('102 and 103 add flat HP / MP recovery after the rates', () => {
    const stats = titled(102, 103)
    expect(stats.recoveryOptions).toMatchObject({ hpFlat: 4, mpFlat: 1 })
    const with_ = naturalRecovery(stats, false)
    const without = naturalRecovery(plain(), false)
    expect(with_.hp - without.hp).toBe(4)
    expect(with_.mp - without.mp).toBe(1)
  })

  it('105 adds to the hard hit weight and 106 to maximum HP', () => {
    expect(titled(105).hardBonus).toBe(plain().hardBonus! + 8)
    expect(titled(106).maxHp).toBe(plain().maxHp + 600)
  })

  it('a critical title raises the Critical rating by its percent (CmdMsg.cpp:837)', () => {
    const rating = plain().client!.criticalRating
    expect(titled(55).client!.criticalRating).toBe(rating + Math.trunc((rating * 150) / 100))
  })

  it('101 is kept for harmful effects and 104 toughens the hero against monster hits', () => {
    expect(titled(101).debuffTimeReduction).toBe(30)
    const monster = {
      level: 20,
      stats: {
        maxHp: 100,
        attack: 10,
        defense: 5,
        attackInterval: 2,
        critChance: 0,
        critMultiplier: 1,
        strength: 50,
        dexterity: 40,
        intelligence: 30,
      } satisfies CombatStats,
    }
    const tough = sourceHitWeights(monster, { stats: titled(104) })!
    const soft = sourceHitWeights(monster, { stats: plain() })!
    expect(tough[0]! - soft[0]!).toBe(15)
    expect(tough[1]! - soft[1]!).toBe(15)
    expect(tough.slice(2)).toEqual(soft.slice(2))
  })
})

describe('monster normal attacks use the source hit types', () => {
  const monster = (boss: boolean) => ({
    level: 21,
    stats: {
      maxHp: 100,
      attack: 10,
      defense: 5,
      attackInterval: 2,
      critChance: 0.05,
      critMultiplier: 1.5,
      strength: 58,
      dexterity: 48,
      intelligence: 28,
      ...(boss ? { boss: true } : {}),
    } satisfies CombatStats,
  })
  const hero = { stats: { ...plain(), constitution: 30 } }

  it('ordinary monsters never land critical or deadly hits (Battle_GetDamage.cpp:1983)', () => {
    // 38 STR / 28 DEX base; durability = 30 / 3
    expect(sourceHitWeights(monster(false), hero)).toEqual([70, 605, 150, 120, 0, 0])
  })

  it('bosses and mid-bosses can', () => {
    expect(sourceHitWeights(monster(true), hero)).toEqual([70, 605, 150, 120, 108, 72])
  })
})

describe('debuff time option', () => {
  it('only skills whose sole flag is SF_NOTHELP can be shortened', () => {
    const base = {
      id: 1,
      name: 'Curse',
      description: '',
      type: 0,
      targetType: 2,
      readyTime: 0,
      fireTime: 0,
      reuseTime: 10,
      useState: 0,
      applyState: 0,
      stillTime: 0,
      appRange: 0,
      fireRange: 10,
      fireRange2: 10,
      levels: [
        {
          level: 1,
          mp: 0,
          hp: 0,
          duration: 100,
          learnLevel: 0,
          learnSp: 0,
          requires: [],
          effects: [],
          targetMax: 1,
        },
      ],
    }
    expect(skillRank({ ...base, flag: 4 }, 1).reducibleDebuff).toBe(true)
    expect(skillRank({ ...base, flag: 4 | 32 }, 1).reducibleDebuff).toBeUndefined()
  })
})
