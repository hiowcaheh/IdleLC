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
  animations: Record<string, string>
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
  price: number
  stats: number[]
  icon: { atlas: number; row: number; col: number }
}

export interface LcData {
  version: 1
  generatedAt: string
  monsters: LcMonster[]
  zones: LcZone[]
  items: LcItem[]
  /** Exp needed to reach the next level, index 0 = level 1. */
  expTable: number[]
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
  /** Relative to the app base URL, e.g. "assets-local/models/lc/". */
  baseUrl: string
  models: LcModelEntry[]
}
