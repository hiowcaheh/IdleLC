import { describe, expect, it } from 'vitest'
import { classResources } from './attributes.ts'
import { createCharacterData } from './character.ts'
import { playerFighter } from './fighters.ts'
import { gainExp } from './progression.ts'
import { expToNextLevel } from './progression.ts'
import { simulateAfk } from './afk.ts'
import { createRng } from './rng.ts'
import { createDefaultSave, loadSave, serializeSave } from './save.ts'
import { allocateStatPoint, availableStatPoints, sanitizeAllocatedStats } from './statPoints.ts'

const hero = () => createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 1000)

describe('distributable attributes', () => {
  it('earns one point on every level, including several levels in one reward', () => {
    const first = hero()
    expect(availableStatPoints(first)).toBe(0)
    const progress = gainExp(1, 0, expToNextLevel(1) + expToNextLevel(2))
    const third = { ...first, ...progress }
    expect(availableStatPoints(third)).toBe(2)
    const spent = allocateStatPoint(third, 'strength')
    expect(availableStatPoints(spent)).toBe(1)
    expect(third.allocatedStats.strength).toBe(0)
    const last = allocateStatPoint(spent, 'constitution')
    expect(() => allocateStatPoint(last, 'intelligence')).toThrow('no-stat-points')
  })

  it('awards points for AFK levels without resetting previously spent points', () => {
    const before = allocateStatPoint({ ...hero(), level: 2 }, 'constitution')
    const result = simulateAfk(before, 3600, createRng(7))
    expect(result.levelsGained).toBeGreaterThan(1)
    expect(result.character.allocatedStats).toEqual(before.allocatedStats)
    expect(availableStatPoints(result.character)).toBe(result.levelsGained)
  })

  it('changes live resources and combat attributes using the source class coefficients', () => {
    const before = { ...hero(), level: 10 }
    const after = allocateStatPoint(before, 'constitution')
    const oldStats = playerFighter(before).stats
    const newStats = playerFighter(after).stats
    expect(newStats.constitution).toBe(oldStats.constitution! + 1)
    expect(newStats.maxHp).toBe(oldStats.maxHp + 11)
    expect(newStats.maxMp).toBe(oldStats.maxMp! + 2)
    const intelligence = allocateStatPoint(after, 'intelligence')
    expect(playerFighter(intelligence).stats.client!.magicAttack).toBeGreaterThan(
      newStats.client!.magicAttack,
    )
    expect(
      classResources('mage', 10, { intelligence: 1 }).maxMp - classResources('mage', 10).maxMp,
    ).toBe(10)
  })

  it('migrates v13 without losing inventory, progress or the level point entitlement', () => {
    const character = { ...hero(), level: 25, gold: 123456, inventory: [{ itemId: 43, count: 8 }] }
    const legacy = {
      ...createDefaultSave(1000),
      saveVersion: 13,
      characters: [character],
      activeCharacterId: character.id,
    }
    const raw = JSON.parse(JSON.stringify(legacy))
    delete raw.characters[0].allocatedStats
    const migrated = loadSave(JSON.stringify(raw), 2000)
    expect(migrated.status).toBe('migrated')
    expect(migrated.save.characters[0]).toEqual(character)
    expect(availableStatPoints(migrated.save.characters[0]!)).toBe(24)
    const spent = allocateStatPoint(character, 'dexterity')
    const current = { ...migrated.save, characters: [spent] }
    expect(loadSave(serializeSave(current), 3000).save.characters[0]!.allocatedStats).toEqual(
      spent.allocatedStats,
    )
  })

  it('rejects malformed and overspent saves while retaining valid allocations', () => {
    expect(
      sanitizeAllocatedStats(
        { strength: 2.9, dexterity: -8, intelligence: Infinity, constitution: 7 },
        5,
      ),
    ).toEqual({ strength: 2, dexterity: 0, intelligence: 0, constitution: 2 })
    expect(sanitizeAllocatedStats(null, 50)).toEqual(hero().allocatedStats)
  })
})
