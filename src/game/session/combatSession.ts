/**
 * The fight on screen. It runs in the browser only (it is the animation of the hunt);
 * its outcome is reported to the GameService, which decides the rewards.
 */
import type { ClassId } from '../data/types.ts'
import {
  changeMonster,
  combatTick,
  createCombat,
  healPlayer,
  killMonster,
  updatePlayer,
  type CombatEvent,
  type CombatState,
  type FighterInit,
} from '../logic/combat.ts'
import { monsterFighter, playerFighter } from '../logic/fighters.ts'
import { createRng, type Rng } from '../logic/rng.ts'

/** Stand-in fighter before a character enters the game. */
const NOBODY: FighterInit = {
  level: 1,
  stats: { maxHp: 1, attack: 0, defense: 0, attackInterval: 1, critChance: 0, critMultiplier: 1 },
}

export class CombatSession {
  private combat: CombatState
  private readonly rng: Rng

  constructor(rng: Rng = createRng(Date.now())) {
    this.rng = rng
    this.combat = createCombat(NOBODY, '', NOBODY)
  }

  get state(): CombatState {
    return this.combat
  }

  /** Starts a fresh fight for a character against a monster (entering the game). */
  start(classId: ClassId, level: number, monsterId: string): void {
    this.combat = createCombat(playerFighter(classId, level), monsterId, monsterFighter(monsterId))
  }

  tick(dt: number): CombatEvent[] {
    const { state, events } = combatTick(this.combat, dt, this.rng)
    this.combat = state
    return events
  }

  setMonster(monsterId: string): CombatEvent[] {
    if (monsterId === this.combat.monsterId) return []
    const { state, events } = changeMonster(this.combat, monsterId, monsterFighter(monsterId))
    this.combat = state
    return events
  }

  /** New level or class stats (level up), keeping the HP ratio. */
  setPlayer(classId: ClassId, level: number): void {
    this.combat = updatePlayer(this.combat, playerFighter(classId, level))
  }

  /** Dev tool. */
  killTarget(): CombatEvent[] {
    const { state, events } = killMonster(this.combat)
    this.combat = state
    return events
  }

  /** Dev tool. */
  heal(): void {
    this.combat = healPlayer(this.combat)
  }
}

export const combatSession = new CombatSession()
