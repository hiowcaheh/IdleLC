/**
 * Equipment: wearing weapons, armor and accessories and upgrading weapons and armor (+0…+15).
 * Items, slots, classes, levels and stats are 1:1 from the LC data; how gear turns into IdleLC's
 * combat stats, the upgrade chances and the bonus per "+" are our own until the LC server code is
 * available (docs/balance.md). Pure — the server will run the same code.
 */
import {
  ARMOR_SLOTS,
  UPGRADE_STONE_IDS,
  gearPower,
  gearReference,
  getItem,
  getRareSet,
  slotsFor,
  starterGear,
} from '../data/items.ts'
import type { ClassId, CombatStats, EquipSlot } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { newId } from './id.ts'
import { addToInventory } from './loot.ts'
import { levelReduction, optionEffects, type ItemOption } from './options.ts'
import { chance, type Rng } from './rng.ts'
import { applyStats } from './skills.ts'

export const MAX_PLUS = 15

/** Share of the level's attack / defense a character has without any weapon / armor (own values). */
export const NAKED_ATTACK = 0.6
export const NAKED_DEFENSE = 0.5

/** Each "+" adds this share of the piece's power (own value). */
export const PLUS_BONUS = 0.1

/** Chance that an upgrade from +N succeeds, index N (own values until the LC server code). */
export const UPGRADE_CHANCE = [
  0.95, 0.9, 0.85, 0.75, 0.65, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1,
]

/** From this "+" on, a failed upgrade takes one "+" away (own rule). */
export const UPGRADE_RISK_FROM = 3

/** One weapon, armor piece or accessory with its upgrade level and options. */
export interface GearPiece {
  uid: string
  itemId: number
  plus: number
  /** Options (accessories always have some; rare items get theirs from their rare set). */
  options?: ItemOption[]
  /** Identified rare items: their t_rareoption set (logic/rare.ts). */
  rare?: number
}

export type Equipment = Partial<Record<EquipSlot, GearPiece>>

export type EquipError =
  | 'not-gear'
  | 'wrong-class'
  | 'level-too-low'
  | 'not-owned'
  | 'nothing-equipped'
  | 'wrong-slot'
  | 'not-upgradeable'
  | 'max-plus'
  | 'no-stone'

/**
 * Power of a piece including its upgrades and the flat bonus of its rare set (weapons: attack + magic
 * attack, armor: defense + magic defense, like the item's own stats).
 */
export function piecePower(piece: Pick<GearPiece, 'itemId' | 'plus' | 'rare'>): number {
  const gear = getItem(piece.itemId).gear
  if (!gear) return 0
  const set = piece.rare === undefined ? undefined : getRareSet(piece.rare)
  const bonus = !set
    ? 0
    : gear.slot === 'weapon'
      ? set.attack + set.magic
      : set.defense + set.resist
  return (gearPower(gear) + bonus) * (1 + PLUS_BONUS * piece.plus)
}

/**
 * Combat stats with the worn gear. The weapon and the armor are measured against what a character
 * of the class typically wears at its level (gearReference): typical gear keeps the level's stats,
 * none leaves NAKED_ATTACK / NAKED_DEFENSE of them, better or upgraded gear goes above. The weapon
 * sets the attack speed (t_item.a_num_2). Options (accessories) add their values on top. Without
 * `equipment` the typical gear is assumed.
 */
export function applyGear(
  stats: CombatStats,
  classId: ClassId,
  level: number,
  equipment: Equipment | undefined,
): CombatStats {
  if (!equipment) return stats
  const reference = gearReference(classId, level)
  const ratio = (power: number, typical: number) => (typical > 0 ? power / typical : 1)
  const weapon = equipment.weapon
  const armorPower = ARMOR_SLOTS.reduce((sum, slot) => {
    const piece = equipment[slot]
    return sum + (piece ? piecePower(piece) : 0)
  }, 0)
  const weaponRatio = ratio(weapon ? piecePower(weapon) : 0, reference.weapon)
  const armorRatio = ratio(armorPower, reference.armor)
  const options = Object.values(equipment).flatMap((piece) => piece?.options ?? [])
  const withGear: CombatStats = {
    ...stats,
    attack: Math.max(
      1,
      Math.round(stats.attack * (NAKED_ATTACK + (1 - NAKED_ATTACK) * weaponRatio)),
    ),
    defense: Math.round(stats.defense * (NAKED_DEFENSE + (1 - NAKED_DEFENSE) * armorRatio)),
    attackInterval: (weapon && getItem(weapon.itemId).gear?.attackInterval) || stats.attackInterval,
  }
  return applyStats(withGear, optionEffects(options, classId))
}

/** The class's free starter set, worn. */
export function starterEquipment(classId: ClassId, makeId: () => string = newId): Equipment {
  const equipment: Equipment = {}
  for (const itemId of starterGear(classId)) {
    const gear = getItem(itemId).gear
    const slot = gear && slotsFor(gear).find((s) => !equipment[s])
    if (slot) equipment[slot] = { uid: makeId(), itemId, plus: 0 }
  }
  return equipment
}

/** Level a piece needs: the item's, less what a "Reduced Level Requirement" option takes off. */
export function requiredLevel(itemId: number, options?: readonly ItemOption[]): number {
  return Math.max(0, getItem(itemId).level - levelReduction(options))
}

/** Whether the character could wear the item (class and level), or why not. */
export function checkWear(
  character: Pick<CharacterData, 'classId' | 'level'>,
  itemId: number,
  options?: readonly ItemOption[],
): EquipError | null {
  const item = getItem(itemId)
  if (!item.gear) return 'not-gear'
  if (!item.gear.classes.includes(character.classId)) return 'wrong-class'
  if (character.level < requiredLevel(itemId, options)) return 'level-too-low'
  return null
}

/**
 * Pieces that can't stack: upgraded, with options, identified rare items, or accessories (they
 * always have options). A stack of a rare item holds unidentified pieces.
 */
export function isUnique(piece: Pick<GearPiece, 'itemId' | 'plus' | 'options' | 'rare'>): boolean {
  return (
    piece.plus > 0 ||
    (piece.options?.length ?? 0) > 0 ||
    piece.rare !== undefined ||
    getItem(piece.itemId).gear?.slot === 'accessory'
  )
}

/** Puts a piece that comes off back into the bag: plain pieces stack, the others stay pieces. */
function stow(character: CharacterData, piece: GearPiece): CharacterData {
  return !isUnique(piece)
    ? {
        ...character,
        inventory: addToInventory(character.inventory, [{ itemId: piece.itemId, count: 1 }]),
      }
    : { ...character, gear: [...character.gear, piece] }
}

/** Where a piece to wear comes from: a plain item from the bag, or a single piece by uid. */
export type GearSource = { itemId: number } | { uid: string }

/**
 * Wears a piece from the bag; what was in its slot goes back to the bag. Accessories go to `slot`
 * when given, else to a free accessory slot, else replace the first one.
 */
export function applyEquip(
  character: CharacterData,
  source: GearSource,
  makeId: () => string = newId,
  slot?: EquipSlot,
): CharacterData {
  let piece: GearPiece
  let next: CharacterData
  if ('uid' in source) {
    const found = character.gear.find((p) => p.uid === source.uid)
    if (!found) throw new GameError('not-owned', `piece ${source.uid}`)
    piece = found
    next = { ...character, gear: character.gear.filter((p) => p.uid !== source.uid) }
  } else {
    const stack = character.inventory.find((s) => s.itemId === source.itemId)
    if (!stack || stack.count < 1) throw new GameError('not-owned', `item ${source.itemId}`)
    piece = { uid: makeId(), itemId: source.itemId, plus: 0 }
    next = {
      ...character,
      inventory: character.inventory
        .map((s) => (s.itemId === source.itemId ? { ...s, count: s.count - 1 } : s))
        .filter((s) => s.count > 0),
    }
  }
  const error = checkWear(character, piece.itemId, piece.options)
  if (error) throw new GameError(error, `item ${piece.itemId}`)
  const slots = slotsFor(getItem(piece.itemId).gear!)
  if (slot && !slots.includes(slot)) throw new GameError('wrong-slot', slot)
  const target = slot ?? slots.find((s) => !next.equipment[s]) ?? slots[0]!
  const previous = next.equipment[target]
  next = { ...next, equipment: { ...next.equipment, [target]: piece } }
  return previous ? stow(next, previous) : next
}

export function applyUnequip(character: CharacterData, slot: EquipSlot): CharacterData {
  const piece = character.equipment[slot]
  if (!piece) throw new GameError('nothing-equipped', slot)
  const equipment = { ...character.equipment }
  delete equipment[slot]
  return stow({ ...character, equipment }, piece)
}

export function upgradeChance(plus: number): number {
  return UPGRADE_CHANCE[plus] ?? 0
}

export interface UpgradeResult {
  character: CharacterData
  success: boolean
  plusBefore: number
  plusAfter: number
}

/** Upgrade stones in the bag (Smelting and Heaven Stones). */
export function stonesOwned(character: Pick<CharacterData, 'inventory'>): number {
  return character.inventory
    .filter((s) => UPGRADE_STONE_IDS.includes(s.itemId))
    .reduce((sum, s) => sum + s.count, 0)
}

/**
 * Upgrades a worn piece with one upgrade stone (Smelting Stones first): +1 on success; on failure
 * from +3 on it loses one.
 */
export function applyUpgrade(character: CharacterData, slot: EquipSlot, rng: Rng): UpgradeResult {
  const piece = character.equipment[slot]
  if (!piece) throw new GameError('nothing-equipped', slot)
  if (!getItem(piece.itemId).upgradeable) throw new GameError('not-upgradeable', slot)
  if (piece.plus >= MAX_PLUS) throw new GameError('max-plus', slot)
  const stone = UPGRADE_STONE_IDS.find((id) =>
    character.inventory.some((s) => s.itemId === id && s.count > 0),
  )
  if (stone === undefined) throw new GameError('no-stone')
  const success = chance(rng, upgradeChance(piece.plus))
  const plusAfter = success
    ? piece.plus + 1
    : piece.plus >= UPGRADE_RISK_FROM
      ? piece.plus - 1
      : piece.plus
  return {
    character: {
      ...character,
      inventory: character.inventory
        .map((s) => (s.itemId === stone ? { ...s, count: s.count - 1 } : s))
        .filter((s) => s.count > 0),
      equipment: { ...character.equipment, [slot]: { ...piece, plus: plusAfter } },
    },
    success,
    plusBefore: piece.plus,
    plusAfter,
  }
}
