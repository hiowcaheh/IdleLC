import type { MonsterDef } from './types.ts'

export const MONSTERS: Record<string, MonsterDef> = {
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
  },
}

export function getMonster(id: string): MonsterDef {
  const monster = MONSTERS[id]
  if (!monster) throw new Error(`Unknown monster: ${id}`)
  return monster
}
