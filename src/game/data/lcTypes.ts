import type { OptionDef, PotionDef, RareSetDef, SkillEffectDef, TitleDef } from './types.ts'

/** Shape of the files written by scripts/lc/import-db.mjs (src/game/data/generated/). */

export interface LcDrop {
  item: number
  /** Probability 0..1 (database stores 1/10000). */
  chance: number
}

export interface LcMonster {
  id: string
  npcIndex: number
  name: string
  level: number
  hp: number
  mp: number
  attack: number
  magic: number
  defense: number
  resist: number
  hit: number
  dodge: number
  flag?: number
  attackType?: number
  strength?: number
  dexterity?: number
  intelligence?: number
  constitution?: number
  recoverHp?: number
  recoverMp?: number
  magicAvoid?: number
  attackLevel?: number
  defenseLevel?: number
  /** t_npc.a_attribute: attack element in bits 8–15, defense in 0–7, each (level << 4) | element. */
  attribute?: number
  /** t_npc.a_attack_area: how far it hits from (metres). */
  attackArea?: number
  /** t_npc.a_walk_speed / a_run_speed (metres a second). */
  walkSpeed?: number
  runSpeed?: number
  dropSlots?: LcDrop[]
  skills?: { slot: number; id: number; level: number; prob: number }[]
  /** t_npc.a_attackSpeed — most likely tenths of a second between attacks. */
  attackSpeed: number
  exp: number
  gold: number
  scale: number
  elite: boolean
  /** Model id = .smc file name, lower case (e.g. "fox"). */
  model: string
  smc: string
  /** t_npc.a_skill_point (1/10 000 SP per kill). */
  sp: number
  /** t_npc.a_motion_* clip names; `attack` holds a_motion_attack and a_motion_attack2. */
  animations: Record<string, string | string[] | undefined>
  zones: string[]
  /** Where it hunts in each zone: the middle of its biggest group of spawns (t_npc_regen), [x, z]. */
  spawns?: Record<string, [number, number]>
  drops: LcDrop[]
}

export interface LcZone {
  id: string
  index: number
  name: string
  minLevel: number
  monsterIds: string[]
}

export interface LcItem {
  id: number
  name: string
  type: number
  subtype: number
  slot: number
  level: number
  jobFlag: number
  flag?: number
  price: number
  stats: number[]
  icon: { atlas: number; row: number; col: number }
  potion?: PotionDef
  /** Rare items: [t_rareoption index, weight] pairs. */
  rare?: [number, number][]
  /** Title items: the t_title index the item gives. */
  title?: number
  /** IdleLC's own item, not in the database (import-db OWN_ITEMS). */
  own?: true
}

export interface LcDungeonSuperBuff {
  id: number
  name: string
  description: string
  level: number
  itemId?: number
  skillId?: number
  sourceDuration: number
  effects: SkillEffectDef[]
  sourceEffects?: SkillEffectDef[]
  icon?: { atlas: number; row: number; col: number }
  attributes?: number
  visual?: 'Angel_wing03'
  rewards?: { exp: number; sp: number; gold: number; drop: number }
}

export interface LcData {
  version: 1
  generatedAt: string
  monsters: LcMonster[]
  zones: LcZone[]
  items: LcItem[]
  /** Exp needed to reach the next level, index 0 = level 1. */
  expTable: number[]
  /** NPC shop rates in % of t_item.a_price (t_shop: a_sell_rate — what the shop pays, a_buy_rate). */
  shop?: { sellRate: number; buyRate: number }
  /** Class skills (base classes), see scripts/lc/import-db.mjs buildSkills. */
  skills?: LcSkill[]
  /** Active class buffs, including advanced classes; used only for dungeon blessings. */
  dungeonBuffs?: LcSkill[]
  dungeonSuperBuffs?: LcDungeonSuperBuff[]
  npcSkills?: Omit<LcSkill, 'classId' | 'icon'>[]
  /** Item ids the NPC shops of each field zone sell (gear and the upgrade stone), by zone id. */
  shops?: Record<string, number[]>
  /** Gear the IdleLC shop sells a class: by t_item.a_wearing, the tiers (level → item ids). */
  shopGear?: Record<string, Record<string, { level: number; items: number[] }[]>>
  /** Plain accessories the IdleLC shop sells (their options are rolled when bought). */
  accessories?: number[]
  /** Item options (t_option); weight 0 everywhere = only in rare sets. */
  options?: OptionDef[]
  /** Rare option sets (t_rareoption) the rare items use. */
  rareSets?: RareSetDef[]
  /** Magnifying glasses (normal, golden). */
  magnifiers?: number[]
  /** Titles (t_title) with the client effect's name. */
  titles?: TitleDef[]
  /** The free level-1 set of each class, by class id. */
  starterGear?: Record<string, number[]>
  /** Typical gear power of each class per level (index 0 = level 1), see import-db buildGearReference. */
  gearReference?: Record<string, { weapon: number[]; armor: number[] }>
}

export interface LcSkill {
  id: number
  classId: string
  name: string
  description: string
  type: number
  targetType: number
  readyTime: number
  fireTime: number
  reuseTime: number
  flag?: number
  useState?: number
  applyState?: number
  sorcerer?: number
  stillTime?: number
  appRange?: number
  fireRange?: number
  fireRange2?: number
  icon: { atlas: number; row: number; col: number }
  levels: {
    level: number
    mp: number
    hp: number
    duration: number
    learnLevel: number
    learnSp: number
    requires: { skill: number; level: number }[]
    effects: SkillEffectDef[]
    targetMax?: number
  }[]
}

export interface LcModelEntry {
  id: string
  file: string
  scale: number
  animations: Record<string, string | string[]>
  attackImpact: number
  height: number
  radius: number
  tint: Record<string, string>
}

export interface LcModelManifest {
  /** Relative to the app base URL, e.g. "models/lc/". */
  baseUrl: string
  models: LcModelEntry[]
}

/** An icon sprite sheet written by `npm run convert-lc` (scripts/lc/icons.mjs). */
export interface LcIconSheet {
  /** Sheet image, relative to the app base URL. */
  file: string
  revision?: string
  /** Icon size in pixels. */
  size: number
  columns: number
  width: number
  height: number
  /** Item / skill id → cell index in the sheet. */
  icons: Record<string, number>
}

/**
 * The hero's clips for a skill (lc-skill-anims.json, from the client's skills.lod): one clip, or a
 * spell's wind-up, held pose and release.
 */
export interface LcSkillAnim {
  ready?: string
  still?: string
  fire: string
}

/**
 * A class skill's release (lc-skill-motion.json, scripts/lc/skill-motion.mjs): the length of its
 * fire clip and, when the client has one, the moment in it its blow lands (skills.lod
 * fireobjDelay), both in seconds before the cast speed.
 */
export interface LcSkillMotion {
  fire: number
  impact?: number
}

/** Weapon and armor models written by `npm run convert-lc` (lc-gear.json). */
export interface LcGearManifest {
  /** Relative to the app base URL, e.g. "models/lc/gear/". */
  baseUrl: string
  /** Model name → GLB file (with a content hash) and the items that show it. */
  models: Record<string, { file: string; items: number[] }>
}

export interface LcIconManifest {
  items?: LcIconSheet
  skills?: LcIconSheet
  /** Round class faces from TopUI.tex, keyed by class id. */
  portraits?: LcIconSheet
}
