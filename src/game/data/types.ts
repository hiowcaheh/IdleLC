/** Stats that drive auto-combat. Shared by player classes and monsters. */
export interface CombatStats {
  maxHp: number
  attack: number
  defense: number
  /** Seconds between the start of two consecutive attacks. */
  attackInterval: number
  /** Probability (0..1) that a landed hit is critical. */
  critChance: number
  /** Damage multiplier applied to critical hits. */
  critMultiplier: number
}

export type ClassId = 'titan' | 'knight' | 'healer' | 'mage' | 'rogue' | 'sorcerer'

export interface ClassDef {
  id: ClassId
  name: string
  /** Weapon and fighting style in a few words (character creation). */
  role: string
  description: string
  modelId: string
  /** Stats at level 1. */
  base: CombatStats
  /** Flat increase per level above 1 (only growing stats). */
  perLevel: Pick<CombatStats, 'maxHp' | 'attack' | 'defense'>
}

export interface ZoneDef {
  id: string
  name: string
  minLevel: number
  monsterIds: string[]
  environment: {
    skyTop: string
    skyBottom: string
    fog: string
    groundLow: string
    groundHigh: string
  }
}

export interface MonsterDef {
  id: string
  name: string
  zoneId: string
  level: number
  stats: CombatStats
  exp: number
  gold: number
  modelId: string
  /** Extra model scale on top of the manifest scale (LC: t_npc.a_scale). */
  scale?: number
  elite?: boolean
}
