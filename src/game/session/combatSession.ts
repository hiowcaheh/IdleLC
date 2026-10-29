/**
 * The fight on screen. It runs in the browser only (it is the animation of the hunt);
 * its outcome is reported to the GameService, which decides the rewards.
 */
import {
  changeMonster,
  combatTick,
  createCombat,
  healPlayer,
  killMonster,
  takePotionsUsed,
  updatePlayer,
  type CombatEvent,
  type CombatState,
  type FighterInit,
} from '../logic/combat.ts'
import { monsterFighter, playerFighter, type Hero } from '../logic/fighters.ts'
import type { ItemStack } from '../logic/loot.ts'
import { createRng, type Rng } from '../logic/rng.ts'

/** Stand-in fighter before a character enters the game. */
const NOBODY: FighterInit = {
  level: 1,
  stats: { maxHp: 1, attack: 0, defense: 0, attackInterval: 1, critChance: 0, critMultiplier: 1 },
}

export class CombatSession {
  private combat: CombatState
  private readonly rng: Rng
  /** Potions reported to the service and not yet settled (not off the character's inventory yet). */
  private readonly reported = new Map<number, number>()

  constructor(rng: Rng = createRng(Date.now())) {
    this.rng = rng
    this.combat = createCombat(NOBODY, '', NOBODY)
  }

  get state(): CombatState {
    return this.combat
  }

  /** Starts a fresh fight for a character against a monster (entering the game). */
  start(hero: Hero, monsterId: string): void {
    this.combat = createCombat(this.fighter(hero), monsterId, monsterFighter(monsterId))
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

  /** New level, skills, gear or potions, keeping the HP and MP ratios. */
  setPlayer(hero: Hero): void {
    this.combat = updatePlayer(this.combat, this.fighter(hero))
  }

  /** The potions drunk since the last call, to report; they stay off the supply until settled. */
  takePotionsUsed(): ItemStack[] {
    const { state, used } = takePotionsUsed(this.combat)
    this.combat = state
    for (const { itemId, count } of used) {
      this.reported.set(itemId, (this.reported.get(itemId) ?? 0) + count)
    }
    return used
  }

  /**
   * The report with these potions was answered (or failed): from now on the character's inventory
   * tells how many are left. Call setPlayer with the updated character afterwards.
   */
  settlePotions(potions: readonly ItemStack[]): void {
    for (const { itemId, count } of potions) {
      const left = (this.reported.get(itemId) ?? 0) - count
      if (left > 0) this.reported.set(itemId, left)
      else this.reported.delete(itemId)
    }
  }

  /** The hero's fighter; potions reported but not settled are not in the bag any more. */
  private fighter(hero: Hero): FighterInit {
    const fighter = playerFighter(hero)
    if (this.reported.size === 0 || !fighter.potions) return fighter
    return {
      ...fighter,
      potions: fighter.potions.map((p) => ({
        ...p,
        count: Math.max(0, p.count - (this.reported.get(p.itemId) ?? 0)),
      })),
    }
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
