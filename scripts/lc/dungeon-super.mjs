import { int } from './sql.mjs'
import { sourceMagic } from './source-records.mjs'

export const DUNGEON_SUPER_ITEMS = [1416, 2453, 10953]

/** Fixed source ranks, never part of the class skill list or the upgradeable Buffer. */
export function buildDungeonSuperBuffs(tables) {
  const effectsOf = (id, rank) => {
    const level = tables.t_skilllevel.find((r) => int(r.a_index) === id && int(r.a_level) === rank)
    if (!level) throw new Error(`Missing dungeon super skill ${id}/${rank}`)
    const effects = [1, 2, 3].flatMap((n) => {
      const magic = tables.t_magic.find((r) => int(r.a_index) === int(level[`a_magicIndex${n}`]))
      if (!magic) return []
      const magicLevel = int(level[`a_magicLevel${n}`])
      const power = tables.t_magiclevel.find(
        (r) => int(r.a_index) === int(magic.a_index) && int(r.a_level) === magicLevel,
      )
      if (!power) throw new Error(`Missing super magic ${magic.a_index}/${magicLevel}`)
      return [
        {
          magic: int(magic.a_index),
          type: int(magic.a_type),
          subtype: int(magic.a_subtype),
          damageType: int(magic.a_damagetype),
          power: int(power.a_power),
          ...sourceMagic(magic, power, magicLevel),
        },
      ]
    })
    return { sourceDuration: int(level.a_durtime) / 10, sourceEffects: effects }
  }
  const item = (id) => {
    const row = tables.t_item.find((r) => int(r.a_index) === id)
    if (!row) throw new Error(`Missing super item ${id}`)
    return {
      id: -id,
      itemId: id,
      name: String(row.a_name_usa),
      description: String(row.a_descr_usa ?? ''),
    }
  }
  const exp = effectsOf(349, 2)
  const sp = effectsOf(468, 1)
  const cube = tables.t_skill.find((r) => int(r.a_index) === 1075)
  if (!cube) throw new Error('Missing blue cube skill 1075')
  return [
    // Assist.cpp cases 348/349 and PC.cpp hcCashExpUp: +200% = 3x total EXP.
    {
      ...item(1416),
      skillId: 349,
      level: 2,
      ...exp,
      effects: [],
      rewards: { exp: exp.sourceEffects[0].power, sp: 0, gold: 0, drop: 0 },
    },
    // Assist.cpp item 2453: hcSPPlusPer100 += 200. Its dummy magic is not attack.
    {
      ...item(2453),
      skillId: 468,
      level: 1,
      ...sp,
      effects: [],
      rewards: { exp: 0, sp: sp.sourceEffects[0].power, gold: 0, drop: 0 },
    },
    {
      id: -1075,
      skillId: 1075,
      name: String(cube.a_name_usa),
      description: String(cube.a_client_description_usa),
      level: 1,
      ...effectsOf(1075, 1),
      effects: effectsOf(1075, 1).sourceEffects,
      icon: {
        atlas: int(cube.a_client_icon_texid),
        row: int(cube.a_client_icon_row),
        col: int(cube.a_client_icon_col),
      },
    },
    // Artifact_Manager.h level 3 = item 10953, ApplyArtifact owner branch (not party).
    // Source attributes/EXP/gold; owner 2026-11-06 adds +1200% SP and +300% drop.
    {
      ...item(10953),
      level: 1,
      sourceDuration: 0,
      effects: [],
      attributes: 1200,
      rewards: { exp: 1200, sp: 1200, gold: 800, drop: 300 },
      visual: 'Angel_wing03',
    },
  ]
}
