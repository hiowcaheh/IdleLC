import { describe, expect, it } from 'vitest'
import { getMonster } from '../data/monsters.ts'
import { createCharacterData } from './character.ts'
import { KILL_BURST, MIN_KILL_CYCLE, applyCombatReport, maxKills } from './rewards.ts'

describe('rewards', () => {
  it('limits kills by elapsed time and game speed', () => {
    expect(maxKills(0)).toBe(KILL_BURST)
    expect(maxKills(MIN_KILL_CYCLE * 10)).toBe(10 + KILL_BURST)
    expect(maxKills(MIN_KILL_CYCLE * 10, 5)).toBe(50 + KILL_BURST)
    expect(maxKills(-5)).toBe(KILL_BURST)
  })

  it('pays the monster exp and gold per accepted kill', () => {
    const monster = getMonster('rust-golem')
    const hero = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)
    const r = applyCombatReport(hero, monster, { monsterId: monster.id, kills: 5, deaths: 2 }, 3)
    expect(r.kills).toBe(3)
    expect(r.exp).toBe(3 * monster.exp)
    expect(r.gold).toBe(3 * monster.gold)
    expect(r.character.stats).toEqual({ kills: 3, deaths: 2 })
    expect(r.character.gold).toBe(3 * monster.gold)
  })
})
