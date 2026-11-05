import { hasModel } from '../assets/manifest.ts'
import { getItem } from './items.ts'
import { lcData } from './lcSource.ts'
import type { LcMonster } from './lcTypes.ts'
import type { MonsterDef } from './types.ts'

const PLACEHOLDER_MONSTERS: Record<string, MonsterDef> = {
  'rust-golem': {
    id: 'rust-golem',
    name: 'Rust Golem',
    zoneId: 'glade',
    level: 1,
    stats: {
      maxHp: 45,
      attack: 7,
      defense: 3,
      attackInterval: 1.8,
      critChance: 0.05,
      critMultiplier: 1.5,
    },
    exp: 12,
    gold: 5,
    modelId: 'golem-rust',
    sp: 2000,
    drops: [
      { itemId: 1, chance: 0.4 },
      { itemId: 2, chance: 0.05 },
    ],
  },
  'stone-sentinel': {
    id: 'stone-sentinel',
    name: 'Stone Sentinel',
    zoneId: 'glade',
    level: 3,
    stats: {
      maxHp: 90,
      attack: 10,
      defense: 6,
      attackInterval: 2.0,
      critChance: 0.05,
      critMultiplier: 1.5,
    },
    exp: 25,
    gold: 11,
    modelId: 'golem-stone',
    sp: 3500,
    drops: [
      { itemId: 3, chance: 0.3 },
      { itemId: 2, chance: 0.1 },
      { itemId: 4, chance: 0.02 },
    ],
  },
}

/** Model used for LC monsters whose model hasn't been converted yet. */
const FALLBACK_MODEL = 'golem-rust'

/** LC database row → game monster. Crit values are not in the database (own values). */
export function fromLc(m: LcMonster): MonsterDef {
  let terminated = false
  return {
    id: m.id,
    name: m.name,
    zoneId: m.zones[0] ?? '',
    level: m.level,
    stats: {
      maxHp: m.hp,
      maxMp: m.mp,
      hit: m.hit,
      dodge: m.dodge,
      magicEvasion: m.magicAvoid,
      avoidPerLevel: 1,
      attack: m.attackType === 2 ? m.magic : m.attack,
      physicalAttack: m.attack,
      physicalHit: m.hit,
      magicHit: m.hit,
      defense: m.defense,
      magicAttack: m.magic,
      magicDefense: m.resist,
      ...(m.strength === undefined ? {} : { strength: m.strength }),
      ...(m.dexterity === undefined ? {} : { dexterity: m.dexterity }),
      ...(m.intelligence === undefined ? {} : { intelligence: m.intelligence }),
      ...(m.constitution === undefined ? {} : { constitution: m.constitution }),
      ...(m.attackType === undefined
        ? {}
        : { attackType: (['melee', 'ranged', 'magic'] as const)[m.attackType] }),
      attackInterval: Math.max(0.6, m.attackSpeed / 10),
      critChance: 0.05,
      critMultiplier: 1.5,
      ...(m.attackArea === undefined ? {} : { attackRange: m.attackArea }),
      ...(m.runSpeed ? { npcRunSpeed: m.runSpeed } : {}),
    },
    exp: m.exp,
    gold: m.gold,
    modelId: hasModel(m.model) ? m.model : FALLBACK_MODEL,
    scale: m.scale,
    elite: m.elite,
    // gear only classes IdleLC does not have can wear (Night Shadow) never drops
    drops: m.drops
      .filter((d) => getItem(d.item).gear?.classes.length !== 0)
      .map((d) => ({ itemId: d.item, chance: d.chance })),
    ...(m.dropSlots
      ? {
          dropSlots: m.dropSlots.map((d) => {
            if (d.item === -1) terminated = true
            return terminated || d.item <= 0 || getItem(d.item).gear?.classes.length === 0
              ? null
              : { itemId: d.item, chance: d.chance }
          }),
        }
      : {}),
    sp: m.sp ?? 0,
    ...(m.spawns && Object.keys(m.spawns).length > 0 ? { spawns: m.spawns } : {}),
  }
}

export const MONSTERS: Record<string, MonsterDef> = lcData
  ? Object.fromEntries(lcData.monsters.map((m) => [m.id, fromLc(m)]))
  : PLACEHOLDER_MONSTERS

export function getMonster(id: string): MonsterDef {
  const monster = MONSTERS[id]
  if (!monster) throw new Error(`Unknown monster: ${id}`)
  return monster
}
