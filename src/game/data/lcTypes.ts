import type { OptionDef, PotionDef } from './types.ts'

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
  /** Item ids the NPC shops of each field zone sell (gear and the upgrade stone), by zone id. */
  shops?: Record<string, number[]>
  /** Gear the IdleLC shop sells a class: by t_item.a_wearing, the tiers (level → item ids). */
  shopGear?: Record<string, Record<string, { level: number; items: number[] }[]>>
  /** Plain accessories the IdleLC shop sells (their options are rolled when bought). */
  accessories?: number[]
  /** Item options (t_option) that can roll. */
  options?: OptionDef[]
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
  icon: { atlas: number; row: number; col: number }
  levels: {
    level: number
    mp: number
    hp: number
    duration: number
    learnLevel: number
    learnSp: number
    requires: { skill: number; level: number }[]
    effects: { magic: number; type: number; subtype: number; damageType: number; power: number }[]
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
  /** Icon size in pixels. */
  size: number
  columns: number
  width: number
  height: number
  /** Item / skill id → cell index in the sheet. */
  icons: Record<string, number>
}

export interface LcIconManifest {
  items?: LcIconSheet
  skills?: LcIconSheet
}
