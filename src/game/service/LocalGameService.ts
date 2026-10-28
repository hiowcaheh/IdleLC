import { CLASSES } from '../data/classes.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { ZONES } from '../data/zones.ts'
import { statsForLevel } from '../logic/balance.ts'
import {
  changeMonster,
  combatTick,
  createCombat,
  type CombatEvent,
  type CombatState,
  type FighterInit,
} from '../logic/combat.ts'
import { createRng, type Rng } from '../logic/rng.ts'
import {
  createDefaultSave,
  loadSave,
  serializeSave,
  type LoadResult,
  type SaveData,
  type Settings,
} from '../logic/save.ts'
import type { GameService, KeyValueStorage } from './GameService.ts'

export const SAVE_KEY = 'idlelc.save'

/** Until character creation (M2) everyone plays a level 1 knight. */
const DEFAULT_PLAYER: { classId: ClassId; level: number } = { classId: 'knight', level: 1 }

function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  return { level: monster.level, stats: monster.stats }
}

function playerFighter(): FighterInit {
  return {
    level: DEFAULT_PLAYER.level,
    stats: statsForLevel(CLASSES[DEFAULT_PLAYER.classId], DEFAULT_PLAYER.level),
  }
}

export class LocalGameService implements GameService {
  private save: SaveData
  private combat: CombatState
  private readonly storage: KeyValueStorage
  private readonly rng: Rng
  private readonly now: () => number

  constructor(storage: KeyValueStorage, options: { rng?: Rng; now?: () => number } = {}) {
    this.storage = storage
    this.now = options.now ?? Date.now
    this.rng = options.rng ?? createRng(this.now())
    this.save = createDefaultSave(this.now())
    this.combat = this.createCombatFor(this.save)
  }

  load(): LoadResult['status'] {
    const { save, status } = loadSave(this.read(), this.now())
    this.save = save
    this.combat = this.createCombatFor(save)
    if (status !== 'loaded') this.persist()
    return status
  }

  getSave(): SaveData {
    return this.save
  }

  getCombat(): CombatState {
    return this.combat
  }

  combatTick(dt: number): CombatEvent[] {
    const { state, events } = combatTick(this.combat, dt, this.rng)
    this.combat = state
    if (events.some((e) => e.type === 'death')) {
      this.save = { ...this.save, stats: { kills: state.kills, deaths: state.deaths } }
      this.persist()
    }
    return events
  }

  selectMonster(monsterId: string): CombatEvent[] {
    const zone = ZONES[this.save.location.zoneId]
    if (!zone?.monsterIds.includes(monsterId)) {
      throw new Error(`Monster ${monsterId} is not in zone ${this.save.location.zoneId}`)
    }
    if (monsterId === this.combat.monsterId) return []
    const { state, events } = changeMonster(this.combat, monsterId, monsterFighter(monsterId))
    this.combat = state
    this.save = { ...this.save, location: { ...this.save.location, monsterId } }
    this.persist()
    return events
  }

  updateSettings(patch: Partial<Settings>): SaveData {
    this.save = { ...this.save, settings: { ...this.save.settings, ...patch } }
    this.persist()
    return this.save
  }

  resetSave(): SaveData {
    try {
      this.storage.removeItem(SAVE_KEY)
    } catch {
      // storage unavailable — nothing to remove
    }
    this.save = createDefaultSave(this.now())
    this.combat = this.createCombatFor(this.save)
    this.persist()
    return this.save
  }

  private createCombatFor(save: SaveData): CombatState {
    const { monsterId } = save.location
    const combat = createCombat(playerFighter(), monsterId, monsterFighter(monsterId))
    return { ...combat, kills: save.stats.kills, deaths: save.stats.deaths }
  }

  private read(): string | null {
    try {
      return this.storage.getItem(SAVE_KEY)
    } catch {
      return null
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(SAVE_KEY, serializeSave(this.save))
    } catch {
      // private mode / quota exceeded — the game keeps running without saving
    }
  }
}
