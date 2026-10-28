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
  updateSettings(patch: Partial<Settings>): SaveData
  /** Wipes the save and starts over. */
  resetSave(): SaveData
}

/** Subset of the Web Storage API — lets tests use an in-memory store. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
