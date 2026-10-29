/**
 * Equipment: wearing weapons and armor, upgrading them (+0…+15) and buying them in the zone's shop.
 * Items, slots, classes, levels, stats and prices are 1:1 from the LC data; how gear turns into
 * IdleLC's combat stats, the upgrade chances and the bonus per "+" are our own until the LC server
 * code is available (docs/balance.md). Pure — the server will run the same code.
 */
import {
  SHOP_BUY_RATE,
  UPGRADE_STONE_IDS,
  gearPower,
  gearReference,
  getItem,
  shopItems,
  starterGear,
} from '../data/items.ts'
import type { ClassId, CombatStats, EquipSlot } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { newId } from './id.ts'
import { addToInventory } from './loot.ts'
import { chance, type Rng } from './rng.ts'
import { sellPrice } from './shop.ts'

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

/** One weapon or armor piece with its upgrade level. */
export interface GearPiece {
  uid: string
  itemId: number
  plus: number
}

export type Equipment = Partial<Record<EquipSlot, GearPiece>>

export type EquipError =
  | 'not-gear'
  | 'wrong-class'
  | 'level-too-low'
  | 'not-owned'
  | 'nothing-equipped'
  | 'max-plus'
  | 'no-stone'
  | 'not-in-shop'
  | 'not-enough-gold'
  | 'bad-count'

/** Power of a piece including its upgrades. */
export function piecePower(piece: Pick<GearPiece, 'itemId' | 'plus'>): number {
  const gear = getItem(piece.itemId).gear
  return gear ? gearPower(gear) * (1 + PLUS_BONUS * piece.plus) : 0
}

/**
 * Combat stats with the worn gear. The weapon and the armor are measured against what a character
 * of the class typically wears at its level (gearReference): typical gear keeps the level's stats,
 * none leaves NAKED_ATTACK / NAKED_DEFENSE of them, better or upgraded gear goes above. The weapon
 * sets the attack speed (t_item.a_num_2). Without `equipment` the typical gear is assumed.
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
  const armorPower = Object.entries(equipment)
    .filter(([slot]) => slot !== 'weapon')
    .reduce((sum, [, piece]) => sum + (piece ? piecePower(piece) : 0), 0)
  const weaponRatio = ratio(weapon ? piecePower(weapon) : 0, reference.weapon)
  const armorRatio = ratio(armorPower, reference.armor)
  return {
    ...stats,
    attack: Math.max(
      1,
      Math.round(stats.attack * (NAKED_ATTACK + (1 - NAKED_ATTACK) * weaponRatio)),
    ),
    defense: Math.round(stats.defense * (NAKED_DEFENSE + (1 - NAKED_DEFENSE) * armorRatio)),
    attackInterval: (weapon && getItem(weapon.itemId).gear?.attackInterval) || stats.attackInterval,
  }
}

/** The class's free starter set, worn. */
export function starterEquipment(classId: ClassId, makeId: () => string = newId): Equipment {
  const equipment: Equipment = {}
  for (const itemId of starterGear(classId)) {
    const gear = getItem(itemId).gear
    if (gear && !equipment[gear.slot]) equipment[gear.slot] = { uid: makeId(), itemId, plus: 0 }
  }
  return equipment
}

/** Whether the character could wear the item (class and level), or why not. */
export function checkWear(
  character: Pick<CharacterData, 'classId' | 'level'>,
  itemId: number,
): EquipError | null {
  const item = getItem(itemId)
  if (!item.gear) return 'not-gear'
  if (!item.gear.classes.includes(character.classId)) return 'wrong-class'
  if (character.level < item.level) return 'level-too-low'
  return null
}

/** Puts a piece that comes off back into the bag: plain pieces stack, upgraded ones stay pieces. */
function stow(character: CharacterData, piece: GearPiece): CharacterData {
  return piece.plus === 0
    ? {
        ...character,
        inventory: addToInventory(character.inventory, [{ itemId: piece.itemId, count: 1 }]),
      }
    : { ...character, gear: [...character.gear, piece] }
}

/** Where a piece to wear comes from: a plain item from the bag, or an upgraded piece by uid. */
export type GearSource = { itemId: number } | { uid: string }

/** Wears a piece from the bag; what was in its slot goes back to the bag. */
export function applyEquip(
  character: CharacterData,
  source: GearSource,
  makeId: () => string = newId,
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
  const error = checkWear(character, piece.itemId)
  if (error) throw new GameError(error, `item ${piece.itemId}`)
  const slot = getItem(piece.itemId).gear!.slot
  const previous = next.equipment[slot]
  next = { ...next, equipment: { ...next.equipment, [slot]: piece } }
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

/** What the shop asks for one piece: t_item.a_price × t_shop.a_buy_rate %. */
export function buyPrice(itemId: number): number {
  return Math.ceil((getItem(itemId).price * SHOP_BUY_RATE) / 100)
}

/** Buys items from the shop of the zone the character hunts in. */
export function applyBuy(character: CharacterData, itemId: number, count: number): CharacterData {
  if (!Number.isInteger(count) || count < 1 || count > 999)
    throw new GameError('bad-count', `${count}`)
  if (!shopItems(character.location.zoneId).includes(itemId)) {
    throw new GameError('not-in-shop', `item ${itemId}`)
  }
  const cost = buyPrice(itemId) * count
  if (character.gold < cost) throw new GameError('not-enough-gold', `${cost}`)
  return {
    ...character,
    gold: character.gold - cost,
    inventory: addToInventory(character.inventory, [{ itemId, count }]),
  }
}

/** Sells an upgraded piece from the bag (the "+" adds nothing to the price). */
export function applySellPiece(
  character: CharacterData,
  uid: string,
): { character: CharacterData; gold: number } {
  const piece = character.gear.find((p) => p.uid === uid)
  if (!piece) throw new GameError('not-owned', `piece ${uid}`)
  const gold = sellPrice(piece.itemId)
  return {
    character: {
      ...character,
      gold: character.gold + gold,
      gear: character.gear.filter((p) => p.uid !== uid),
    },
    gold,
  }
}
