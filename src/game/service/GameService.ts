import type { AfkResult } from '../logic/afk.ts'
import type { CharacterData, CharacterLocation, NewCharacter } from '../logic/character.ts'
import type { ItemStack } from '../logic/loot.ts'
import type { CombatReport, CombatResult } from '../logic/rewards.ts'
import type { LoadResult, SaveData, Settings } from '../logic/save.ts'
import type { SaleResult } from '../logic/shop.ts'

/**
 * Everything that changes the saved game goes through this contract, and every call is
 * asynchronous — like a request to a server. Stage 1: LocalGameService (browser storage).
 * Stage 2: SupabaseGameService with the same contract, where the server checks each command.
 * The fight itself is animated in the browser (src/game/session/) and only its outcome is
 * reported here.
 *
 * Commands reject with a GameError (src/game/logic/character.ts) when they are not allowed.
 * Returned objects are copies: changing them does not change the saved game.
 */
export interface GameService {
  /** Loads the account (a new, empty one on the first visit). */
  load(): Promise<LoadResult>
  createCharacter(input: NewCharacter): Promise<CharacterData>
  deleteCharacter(characterId: string): Promise<void>
  /** Marks the character as being played (null = back to character selection). */
  setActiveCharacter(characterId: string | null): Promise<void>
  /** Moves the character to another hunting spot. */
  travel(characterId: string, location: CharacterLocation): Promise<CharacterData>
  /** Outcome of the fights since the last report; the service checks it and pays out. */
  reportCombat(characterId: string, report: CombatReport): Promise<CombatResult>
  /** Sends the character on an AFK expedition to its current hunting spot. */
  startAfk(characterId: string): Promise<CharacterData>
  /**
   * Ends the expedition and pays the time it lasted (up to 8 h; under a minute pays nothing).
   */
  claimAfk(characterId: string): Promise<AfkResult>
  /** Sells items from the inventory to the shop for their database price. */
  sellItems(characterId: string, items: ItemStack[]): Promise<SaleResult>
  /** Learns the next level of a class skill for its SP (level and prerequisites checked). */
  learnSkill(characterId: string, skillId: number): Promise<CharacterData>
  /** Turns automatic use of a learned skill in combat on or off. */
  setSkillAuto(characterId: string, skillId: number, auto: boolean): Promise<CharacterData>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  /** Deletes the whole save (all characters) and starts over. */
  resetSave(): Promise<SaveData>
  /** Testing tools. A production backend leaves this out (or refuses the commands). */
  readonly dev?: DevCommands
}

export interface DevCommands {
  /** Sets the level (experience towards the next level goes back to 0). */
  setLevel(characterId: string, level: number): Promise<CharacterData>
  addExp(characterId: string, amount: number): Promise<CharacterData>
  addGold(characterId: string, amount: number): Promise<CharacterData>
  /** Adds whole skill points. */
  addSp(characterId: string, amount: number): Promise<CharacterData>
  /** Game speed — allows proportionally more kills per report. */
  setTimeScale(scale: number): void
  /** Moves the expedition start `seconds` into the past (starting one if needed); claim it after. */
  simulateAfk(characterId: string, seconds: number): Promise<CharacterData>
}

/** Subset of the Web Storage API — lets tests use an in-memory store. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
