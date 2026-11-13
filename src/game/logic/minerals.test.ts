import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { getItem } from '../data/items.ts'
import type { CombatStats } from '../data/types.ts'
import { boostEffects, boostsOf, reportedBoosts } from './boosts.ts'
import { createCharacterData } from './character.ts'
import { createCombat, drinkPotion, effectiveStats, potionAtLevel } from './combat.ts'
import { createDefaultSave, loadSave, serializeSave } from './save.ts'
import { LocalGameService } from '../service/LocalGameService.ts'
import type { KeyValueStorage } from '../service/GameService.ts'
import { createRng } from './rng.ts'

const NOW = Date.UTC(2026, 10, 13, 12)
const stats = (): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1.5,
  critChance: 0,
  critMultiplier: 1.5,
})
const mineral = (itemId: number, flag: number) => ({
  itemId,
  name: getItem(itemId).name,
  count: 1,
  potion: potionAtLevel(getItem(itemId).potion!, flag),
  flag,
})

describe('minerals (doFuncItem.cpp IPOTION_UP: the skill at the level in the item flag)', () => {
  it('cast skills 104 to 107 at every level the skills have', () => {
    for (const [id, skill, levels] of [
      [498, 104, 15],
      [499, 105, 15],
      [500, 106, 15],
      [501, 107, 14],
    ] as const) {
      const potion = getItem(id).potion!
      expect(potion.kind).toBe('boost')
      expect(potion.skill).toBe(skill)
      expect(Object.keys(potion.levels!)).toHaveLength(levels)
    }
    // t_skill 104: Physical Attack +15 at Lv 1, +95 at Lv 9, +155 at Lv 15; five minutes each
    expect(potionAtLevel(getItem(498).potion!, 9).effects![0]!.power).toBe(95)
    expect(potionAtLevel(getItem(498).potion!, 15).effects![0]!.power).toBe(155)
    expect(potionAtLevel(getItem(498).potion!, 9).duration).toBe(300)
  })

  it('a stronger level replaces a weaker one; a weaker one is refused while it works', () => {
    const fight = createCombat({ level: 30, stats: stats() }, 'm', { level: 1, stats: stats() })
    const base = effectiveStats(fight.player)
    const nine = drinkPotion(fight, mineral(498, 9))
    expect(nine.problem).toBeNull()
    const effect = nine.state.player.effects.find((e) => e.itemId === 498)!
    expect(effect.name).toBe('Physical Attack Mineral Lv 9')
    expect(effect.flag).toBe(9)
    expect(effectiveStats(nine.state.player).attack).toBeGreaterThan(base.attack)
    nine.state.player.potionCooldowns = {}
    expect(drinkPotion(nine.state, mineral(498, 3)).problem).toBe('stronger')
    const fourteen = drinkPotion(nine.state, mineral(498, 14)).state
    expect(fourteen.player.effects.filter((e) => e.itemId === 498).map((e) => e.flag)).toEqual([14])
    // the leveled stack is taken by whoever drank it, not counted with the plain potions
    expect(fourteen.player.potionsUsed[498]).toBeUndefined()
  })

  it('keeps its level in the save and back in the fight; a report cannot raise it', () => {
    const fight = createCombat({ level: 30, stats: stats() }, 'm', { level: 1, stats: stats() })
    const drunk = drinkPotion(fight, mineral(500, 12)).state
    const saved = boostsOf(drunk.player.effects, NOW)
    expect(saved).toEqual([{ itemId: 500, remaining: 300, flag: 12 }])
    const back = boostEffects(saved, NOW)[0]!
    expect(back.flag).toBe(12)
    expect(back.name).toBe('Magical Attack Mineral Lv 12')
    // drank Lv 3: a report of Lv 14 is not accepted
    expect(
      reportedBoosts(undefined, [{ itemId: 500, flag: 3 }], [{ ...saved[0]!, flag: 14 }], NOW),
    ).toEqual([])
    expect(reportedBoosts(undefined, [{ itemId: 500, flag: 12 }], saved, NOW)).toEqual(saved)
    // the save keeps the level
    const hero = {
      ...createCharacterData({ name: 'Ore', classId: 'mage' }, 'o', NOW),
      boosts: saved,
    }
    const save = { ...createDefaultSave(NOW), characters: [hero] }
    expect(loadSave(serializeSave(save)).save.characters[0]!.boosts).toEqual(saved)
  })

  it('drinks in a dungeon from the stack of its level', async () => {
    const hero = {
      ...createCharacterData({ name: 'Ore', classId: 'knight' }, 'd', NOW),
      level: 30,
      inventory: [
        { itemId: 499, count: 2, flag: 6 },
        { itemId: 499, count: 1, flag: 12 },
      ],
    }
    let value: string | null = serializeSave({
      ...createDefaultSave(NOW),
      activeCharacterId: 'd',
      characters: [hero],
    })
    const storage: KeyValueStorage = {
      getItem: () => value,
      setItem: (_, next) => {
        value = next
      },
      removeItem: () => {
        value = null
      },
    }
    const service = new LocalGameService(storage, { now: () => NOW, rng: createRng(3) })
    await service.load()
    await service.startDungeon('d', 'belfist')
    const used = await service.drinkDungeonPotion('d', 499, 12)
    expect(used.run!.player.effects.find((e) => e.itemId === 499)!.flag).toBe(12)
    expect(used.character.inventory.filter((s) => s.itemId === 499)).toEqual([
      { itemId: 499, count: 2, flag: 6 },
    ])
    expect(used.character.boosts).toEqual([{ itemId: 499, remaining: 300, flag: 12 }])
    await expect(service.drinkDungeonPotion('d', 499, 12)).rejects.toThrow()
  })
})
