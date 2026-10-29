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
  /** Mana for skills (monsters have none). */
  maxMp?: number
  /** HP and MP regenerated per second on top of the base regeneration (skills). */
  hpRegen?: number
  mpRegen?: number
  /** Percentage points added to the hit chance of this fighter / taken off the attacker's. */
  hit?: number
  dodge?: number
  /** Seconds added to every skill's cast time (negative = faster casting). */
  castTime?: number
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
  /** Mana at level 1 and its increase per level. */
  mana: { base: number; perLevel: number }
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
  /** Loot table: each entry is rolled separately on every kill. */
  drops?: MonsterDrop[]
  /** Skill points for a kill, in 1/10 000 SP (LC t_npc.a_skill_point). */
  sp?: number
}

export interface MonsterDrop {
  itemId: number
  /** Probability 0..1 per kill (LC: a_item_percent / 10000). */
  chance: number
}

export type ItemType = 'weapon' | 'armor' | 'scroll' | 'material' | 'accessory' | 'potion' | 'other'

export interface ItemDef {
  id: number
  name: string
  type: ItemType
  /** Required level. */
  level: number
  /** Shop price in gold. */
  price: number
}

/** One effect of a skill level: t_magic (type, subtype, damage type) + t_magiclevel.a_power. */
export interface SkillEffectDef {
  type: number
  subtype: number
  /** 1 = flat value, 2 = percent (as used by the LC data). */
  damageType: number
  power: number
}

export interface SkillLevelDef {
  level: number
  mp: number
  hp: number
  /** Effect duration in 1/10 s. */
  duration: number
  /** Character level needed to learn this skill level. */
  learnLevel: number
  /** Skill points needed (whole SP). */
  learnSp: number
  requires: { skill: number; level: number }[]
  effects: SkillEffectDef[]
}

/** A class skill, 1:1 from t_skill + t_skilllevel. Interpreted by src/game/logic/skills.ts. */
export interface SkillDef {
  id: number
  classId: ClassId
  name: string
  description: string
  /** t_skill.a_type: 0 melee, 1 ranged, 2 magic, 3 passive. */
  type: number
  targetType: number
  /** Timings in 1/10 s. */
  readyTime: number
  fireTime: number
  reuseTime: number
  levels: SkillLevelDef[]
}
