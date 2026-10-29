import { hasModel } from '../assets/manifest.ts'
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
  return {
    id: m.id,
    name: m.name,
    zoneId: m.zones[0] ?? '',
    level: m.level,
    stats: {
      maxHp: m.hp,
      attack: m.attack,
      defense: m.defense,
      attackInterval: Math.max(0.6, m.attackSpeed / 10),
      critChance: 0.05,
      critMultiplier: 1.5,
    },
    exp: m.exp,
    gold: m.gold,
    modelId: hasModel(m.model) ? m.model : FALLBACK_MODEL,
    scale: m.scale,
    elite: m.elite,
    drops: m.drops.map((d) => ({ itemId: d.item, chance: d.chance })),
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
