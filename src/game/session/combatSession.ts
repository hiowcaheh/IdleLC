/**
 * The fight on screen. It runs in the browser only (it is the animation of the hunt);
 * its outcome is reported to the GameService, which decides the rewards.
 */
import { boostEffects, boostsOf, type OwnedBoost } from '../logic/boosts.ts'
import {
  carryVitals,
  changeMonster,
  combatTick,
  createCombat,
  drinkPotion,
  healPlayer,
  killMonster,
  removeEffect,
  takePotionsUsed,
  updatePlayer,
  type CombatEvent,
  type CombatState,
  type DrinkProblem,
  type FighterInit,
} from '../logic/combat.ts'
import { activeTitleId } from '../logic/titles.ts'
import { getItem } from '../data/items.ts'
import { monsterFighter, playerFighter, type Hero } from '../logic/fighters.ts'
import type { ItemStack } from '../logic/loot.ts'
import { countOwned } from '../logic/potions.ts'
import { createRng, type Rng } from '../logic/rng.ts'

/** Stand-in fighter before a character enters the game. */
const NOBODY: FighterInit = {
  level: 1,
  stats: { maxHp: 1, attack: 0, defense: 0, attackInterval: 1, critChance: 0, critMultiplier: 1 },
}

export class CombatSession {
  private combat: CombatState
  private readonly rng: Rng
  private hero: Hero | null = null
  private titleId: number | null = null
  private singleEncounter = false
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
    this.singleEncounter = false
    this.trackTitle(hero)
    this.combat = withBoosts(
      createCombat(this.fighter(hero), monsterId, monsterFighter(monsterId)),
      hero,
    )
  }

  /** A fresh fight after `awaySeconds` away (expedition), keeping the hero's HP and MP. */
  resume(hero: Hero, monsterId: string, awaySeconds: number): void {
    this.singleEncounter = false
    this.trackTitle(hero)
    const next = createCombat(this.fighter(hero), monsterId, monsterFighter(monsterId))
    this.combat = withBoosts(carryVitals(this.combat, next, awaySeconds), hero)
  }

  /** The boost potions working on the hero now, for the save (logic/boosts.ts). */
  boosts(): OwnedBoost[] {
    return boostsOf(this.combat.player.effects, Date.now())
  }

  tick(dt: number): CombatEvent[] {
    if (this.hero && activeTitleId(this.hero, Date.now()) !== this.titleId)
      this.setPlayer(this.hero)
    const { state, events } = combatTick(this.combat, dt, this.rng, this.singleEncounter)
    this.combat = state
    return events
  }

  /** Sets off for another monster, `distance` metres away (its route over the map) when known. */
  setMonster(monsterId: string, distance?: number, singleEncounter = false): CombatEvent[] {
    this.singleEncounter = singleEncounter
    if (monsterId === this.combat.monsterId) return []
    const { state, events } = changeMonster(
      this.combat,
      monsterId,
      monsterFighter(monsterId),
      distance,
    )
    this.combat = state
    return events
  }

  /** New level, skills, gear or potions, keeping the HP and MP ratios. */
  setPlayer(hero: Hero): void {
    this.trackTitle(hero)
    this.combat = updatePlayer(this.combat, this.fighter(hero))
  }

  private trackTitle(hero: Hero): void {
    this.hero = hero
    this.titleId = activeTitleId(hero, Date.now())
  }

  /**
   * The player has the hero drink a potion from the bag (any potion it owns, slot or not); it is
   * reported like the ones drunk by itself. Events for the scene, or why it can't.
   */
  drink(hero: Hero, itemId: number): { events: CombatEvent[]; problem: DrinkProblem | null } {
    const item = getItem(itemId)
    if (!item.potion) return { events: [], problem: 'none-left' }
    if (hero.level < item.level) return { events: [], problem: 'level-too-low' }
    // the bag still holds the potions reported but not settled
    const count = countOwned(hero.inventory ?? [], itemId) - (this.reported.get(itemId) ?? 0)
    const supply = { itemId, name: item.name, count, potion: item.potion }
    const { state, events, problem } = drinkPotion(this.combat, supply)
    this.combat = state
    return { events, problem }
  }

  /** The potions drunk since the last call, to report; they stay off the supply until settled. */
  /** The player takes a buff or potion effect off the hero; false when it can't be. */
  removeEffect(which: { skillId: number; itemId?: number }): boolean {
    const next = removeEffect(this.combat, 'player', which)
    if (!next) return false
    this.combat = next
    return true
  }

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

/** A fresh fight with the boost potions the save keeps working on the hero. */
function withBoosts(state: CombatState, hero: Hero): CombatState {
  const effects = boostEffects(hero.boosts, Date.now())
  if (effects.length === 0) return state
  return { ...state, player: { ...state.player, effects: [...state.player.effects, ...effects] } }
}
