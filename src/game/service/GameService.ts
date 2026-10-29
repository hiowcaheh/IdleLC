import type { CombatEvent, CombatState } from '../logic/combat.ts'
import type { LoadResult, SaveData, Settings } from '../logic/save.ts'

/**
 * The only way the UI talks to the game. Stage 1: LocalGameService (browser only).
 * Stage 2: SupabaseGameService with the same contract.
 */
export interface GameService {
  /** Loads (or creates) the save. Call once at startup. */
  load(): LoadResult['status']
  getSave(): SaveData
  getCombat(): CombatState
  /** Advances auto-combat by dt seconds (already scaled by dev time scale). */
  combatTick(dt: number): CombatEvent[]
  /** Switches the fought monster within the current zone. */
  selectMonster(monsterId: string): CombatEvent[]
  /** Moves to another zone and starts hunting `monsterId` (default: the zone's first monster). */
  selectZone(zoneId: string, monsterId?: string): CombatEvent[]
  updateSettings(patch: Partial<Settings>): SaveData
  /** Wipes the save and starts over. */
  resetSave(): SaveData
  /** Testing tools. A production backend leaves this out (or refuses the commands). */
  readonly dev?: DevCommands
}

export interface DevCommands {
  /** Sets the player's level (until progression, M3). */
  setLevel(level: number): void
  /** The current monster dies at once; counts as a kill. */
  killTarget(): CombatEvent[]
  /** Restores the player's HP. */
  heal(): void
}

/** Subset of the Web Storage API — lets tests use an in-memory store. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
