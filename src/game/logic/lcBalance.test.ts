import { describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes.ts'
import { baseDamage } from './balance.ts'
import { HITS_TO_KILL, attackForDamage, lcPlayerStats, type MonsterSample } from './lcBalance.ts'

const monster = (level: number, over: Partial<MonsterSample> = {}): MonsterSample => ({
  level,
  hp: 100 + level * 90,
  attack: 5 + level * 3,
  defense: 50 + level * 14,
  elite: false,
  ...over,
})

describe('attackForDamage', () => {
  it('inverts baseDamage', () => {
    for (const [dmg, def] of [
      [20, 54],
      [300, 400],
      [5, 0],
    ] as const) {
      expect(baseDamage(attackForDamage(dmg, def), def)).toBeCloseTo(dmg, 6)
    }
  })
})

describe('lcPlayerStats', () => {
  // one normal monster per level, like a real zone list
  const list = Array.from({ length: 60 }, (_, i) => monster(i + 1))

  it('kills a same-level monster in about HITS_TO_KILL blows', () => {
    for (const level of [8, 20, 50]) {
      const s = lcPlayerStats(level, list, CLASSES.knight.base)
      const m = monster(level)
      const hits = m.hp / baseDamage(s.attack, m.defense)
      expect(hits).toBeGreaterThan(HITS_TO_KILL - 2)
      expect(hits).toBeLessThan(HITS_TO_KILL + 3)
    }
  })

  it('grows with level and keeps class timing and crits', () => {
    const low = lcPlayerStats(2, list, CLASSES.knight.base)
    const high = lcPlayerStats(40, list, CLASSES.knight.base)
    expect(high.attack).toBeGreaterThan(low.attack)
    expect(high.maxHp).toBeGreaterThan(low.maxHp)
    expect(high.attackInterval).toBe(CLASSES.knight.base.attackInterval)
    expect(high.critChance).toBe(CLASSES.knight.base.critChance)
  })

  it('ignores elites when normal monsters exist and falls back to class stats without data', () => {
    const withElite = [...list, monster(8, { hp: 99999, elite: true })]
    expect(lcPlayerStats(8, withElite, CLASSES.knight.base)).toEqual(
      lcPlayerStats(8, list, CLASSES.knight.base),
    )
    expect(lcPlayerStats(5, [], CLASSES.knight.base)).toEqual(CLASSES.knight.base)
  })
})
