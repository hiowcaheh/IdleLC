/**
 * The fight on screen. It runs in the browser only (it is the animation of the hunt);
 * its outcome is reported to the GameService, which decides the rewards.
 */
import { boostEffects, boostsOf, type OwnedBoost } from '../logic/boosts.ts'
import {
  carryVitals,
  changeMonster,
  replaceMonsterHere,
  combatTick,
  createCombat,
  drinkPotion,
  healPlayer,
  killMonster,
  potionAtLevel,
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
/** The key of potions drunk and reported: the item and its flag (a mineral's level). */
const usedKey = (itemId: number, flag?: number) => `${itemId}:${flag ?? 0}`

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
  /**
   * Potions reported to the service and not yet settled (not off the character's inventory yet),
   * by item and flag (`itemId:flag`; a mineral's level is its flag).
   */
  private readonly reported = new Map<string, number>()
  /** Leveled potions (minerals) drunk and not reported yet, by `itemId:flag`. */
  private readonly leveledUsed = new Map<string, number>()

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

  tick(dt: number, assisted = false): CombatEvent[] {
    if (assisted) this.markEncounterAssisted()
    if (this.hero && activeTitleId(this.hero, Date.now()) !== this.titleId)
      this.setPlayer(this.hero)
    const { state, events } = combatTick(this.combat, dt, this.rng, this.singleEncounter)
    this.combat = state
    return events
  }

  markEncounterAssisted(): void {
    if (this.combat.encounterClock)
      this.combat = {
        ...this.combat,
        encounterClock: { ...this.combat.encounterClock, assisted: true },
      }
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
    if (singleEncounter)
      this.combat.encounterClock = { started: false, seconds: 0, assisted: false }
    else delete this.combat.encounterClock
    return events
  }

  /** A summon or the next ordinary target appears on this same hunting ground. */
  replaceMonsterHere(monsterId: string, singleEncounter = false): CombatEvent[] {
    this.singleEncounter = singleEncounter
    const { state, events } = replaceMonsterHere(this.combat, monsterId, monsterFighter(monsterId))
    this.combat = state
    if (singleEncounter)
      this.combat.encounterClock = { started: false, seconds: 0, assisted: false }
    else delete this.combat.encounterClock
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
  drink(
    hero: Hero,
    itemId: number,
    flag?: number,
  ): { events: CombatEvent[]; problem: DrinkProblem | null } {
    const item = getItem(itemId)
    if (!item.potion) return { events: [], problem: 'none-left' }
    if (hero.level < item.level) return { events: [], problem: 'level-too-low' }
    // a mineral is drunk at the level of its stack (the flag); other potions have none
    const level = item.potion.levels && flag ? flag : undefined
    const key = usedKey(itemId, level)
    // the bag still holds the potions reported but not settled
    const count =
      countOwned(hero.inventory ?? [], itemId, level ?? (item.potion.levels ? 0 : undefined)) -
      (this.reported.get(key) ?? 0) -
      (this.leveledUsed.get(key) ?? 0)
    const supply = {
      itemId,
      name: item.name,
      count,
      potion: potionAtLevel(item.potion, level),
      ...(level ? { flag: level } : {}),
    }
    const { state, events, problem } = drinkPotion(this.combat, supply)
    this.combat = state
    if (!problem && level) this.leveledUsed.set(key, (this.leveledUsed.get(key) ?? 0) + 1)
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
    const all: ItemStack[] = [...used]
    for (const [key, count] of this.leveledUsed) {
      const [itemId, flag] = key.split(':').map(Number) as [number, number]
      all.push({ itemId, count, flag })
    }
    this.leveledUsed.clear()
    for (const stack of all) {
      const key = usedKey(stack.itemId, stack.flag)
      this.reported.set(key, (this.reported.get(key) ?? 0) + stack.count)
    }
    return all
  }

  /**
   * The report with these potions was answered (or failed): from now on the character's inventory
   * tells how many are left. Call setPlayer with the updated character afterwards.
   */
  settlePotions(potions: readonly ItemStack[]): void {
    for (const { itemId, count, flag } of potions) {
      const key = usedKey(itemId, flag)
      const left = (this.reported.get(key) ?? 0) - count
      if (left > 0) this.reported.set(key, left)
      else this.reported.delete(key)
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
        count: Math.max(0, p.count - (this.reported.get(usedKey(p.itemId)) ?? 0)),
      })),
    }
  }

  /** Dev tool. */
  killTarget(): CombatEvent[] {
    this.markEncounterAssisted()
    const { state, events } = killMonster(this.combat)
    this.combat = state
    return events
  }

  /** Dev tool. */
  heal(): void {
    this.markEncounterAssisted()
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
