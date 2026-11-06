/** Preserve optional SQL fields without turning missing data into an invented zero. */
export function sourceFields(row, fields) {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([name, key]) => {
      const value = row?.[key]
      if (value === undefined || value === null || value === '') return []
      const number = Number(value)
      if (!Number.isFinite(number)) throw new Error(`invalid source field ${key}`)
      return [[name, number]]
    }),
  )
}

export function sourceMagic(magic, rank, level) {
  return {
    magicLevel: level,
    ...sourceFields(rank, { hitrate: 'a_hitrate' }),
    ...sourceFields(magic, {
      hitType: 'a_hittype',
      attribute: 'a_attribute',
      toggle: 'a_togle',
      powerSource: 'a_psp',
      powerTarget: 'a_ptp',
      hitSource: 'a_hsp',
      hitTarget: 'a_htp',
    }),
  }
}

export function sourceNpc(row) {
  const fields = sourceFields(row, {
    flag: 'a_flag',
    attackType: 'a_attackType',
    strength: 'a_str',
    dexterity: 'a_dex',
    intelligence: 'a_int',
    constitution: 'a_con',
    recoverHp: 'a_recover_hp',
    recoverMp: 'a_recover_mp',
    magicAvoid: 'a_magicavoid',
    attackLevel: 'a_attacklevel',
    defenseLevel: 'a_defenselevel',
    // elements: attack in bits 8-15, defense in bits 0-7, each (level << 4) | element (Skill.h)
    attribute: 'a_attribute',
    // metres: how far it hits from (m_attackArea) and how fast it walks / runs (m/s)
    attackArea: 'a_attack_area',
    walkSpeed: 'a_walk_speed',
    runSpeed: 'a_run_speed',
  })
  const slots = Array.from({ length: 20 }, (_, i) => {
    const item = row[`a_item_${i}`],
      chance = row[`a_item_percent_${i}`]
    if (item == null || chance == null) return undefined
    return { item: Number(item), chance: Number(chance) / 10000 }
  })
  const skills = Array.from({ length: 4 }, (_, slot) => ({ slot, value: row[`a_skill${slot}`] }))
    .filter(({ value }) => value !== undefined)
    .map(({ slot, value }) => {
      const [id, level, prob] = String(value).trim().split(/\s+/).map(Number)
      return id > 0 && Number.isFinite(level) && Number.isFinite(prob)
        ? { slot, id, level, prob }
        : null
    })
    .filter(Boolean)
  return { ...fields, ...(slots.every((s) => s !== undefined) ? { dropSlots: slots } : {}), skills }
}
