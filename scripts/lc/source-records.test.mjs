import { describe, expect, it } from 'vitest'
import { sourceFields, sourceMagic, sourceNpc } from './source-records.mjs'
import { buildSkills } from './import-db.mjs'

describe('lossless source combat fields', () => {
  it('distinguishes missing data from source zero, negatives and independent hitrate', () => {
    expect(
      sourceFields(
        { a_zero: '0', a_negative: '-1' },
        { zero: 'a_zero', negative: 'a_negative', absent: 'a_absent' },
      ),
    ).toEqual({ zero: 0, negative: -1 })
    expect(sourceMagic({ a_hittype: 0 }, { a_hitrate: 7500, a_power: 20 }, 3)).toEqual({
      magicLevel: 3,
      hitType: 0,
      hitrate: 7500,
    })
    expect(sourceMagic({}, { a_power: 20 }, 1)).not.toHaveProperty('hitrate')
  })
  it('preserves all twenty drop slots and the four independent NPC skill definitions', () => {
    const slots = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        [`a_item_${i}`, i === 3 ? 43 : -1],
        [`a_item_percent_${i}`, i === 3 ? 5000 : 0],
      ]).flat(),
    )
    const npc = sourceNpc({
      ...slots,
      a_con: 99,
      a_attackType: 2,
      a_skill0: '123 2 7500',
      a_skill1: '-1 0 0',
    })
    expect(npc.constitution).toBe(99)
    expect(npc.dropSlots).toHaveLength(20)
    expect(npc.dropSlots[3]).toEqual({ item: 43, chance: 0.5 })
    expect(npc.skills).toEqual([{ slot: 0, id: 123, level: 2, prob: 7500 }])
    expect(sourceNpc({ a_item_0: 43 }).dropSlots).toBeUndefined()
  })
  it('joins a skill effect to its actual magic rank without deleting hitrate or flags', () => {
    const [skill] = buildSkills({
      t_skill: [
        {
          a_index: 43,
          a_job: 0,
          a_job2: 0,
          a_name_usa: 'Body Crasher',
          a_type: 0,
          a_flag: 512,
          a_appState: 128,
          a_stillTime: 7,
        },
      ],
      t_skilllevel: [
        { a_index: 43, a_level: 1, a_learnLevel: 1, a_magicIndex1: 1405, a_magicLevel1: 3 },
      ],
      t_magic: [{ a_index: 1405, a_type: 2, a_subtype: 5, a_damagetype: 1, a_hittype: 0 }],
      t_magiclevel: [{ a_index: 1405, a_level: 3, a_power: 20, a_hitrate: 7000 }],
    })
    expect(skill).toMatchObject({ flag: 512, applyState: 128, stillTime: 7 })
    expect(skill.levels[0].effects[0]).toMatchObject({
      magic: 1405,
      magicLevel: 3,
      power: 20,
      hitrate: 7000,
      hitType: 0,
    })
  })
})
