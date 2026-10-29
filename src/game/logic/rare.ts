/**
 * Rare items (LC t_rareoption): weapons and armor from level ~70 drop unidentified. A magnifying
 * glass identifies one: it picks one of the item's rare sets by the item's weights
 * (t_item.a_rare_index / a_rare_prob) and gives each option of the set with its chance
 * (t_rareoption.a_option_prob, 1/10 000) — all 1:1 from the database. The set adds a name prefix,
 * a grade (A best … E) and flat attack / defense. Pure — the server will run the same code.
 */
import { getItem, getRareSet } from '../data/items.ts'
import type { EquipSlot, RareSetDef } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import type { GearPiece } from './equipment.ts'
import { GameError } from './errors.ts'
import { newId } from './id.ts'
import type { ItemOption } from './options.ts'
import { chance, type Rng } from './rng.ts'

/** Grade letters, index = t_rareoption.a_grade. */
export const GRADES = ['A', 'B', 'C', 'D', 'E'] as const

export function isRare(itemId: number): boolean {
  return (getItem(itemId).rare?.length ?? 0) > 0
}

/** A rare piece no magnifying glass has identified yet (its options are unknown). */
export function isUnidentified(piece: Pick<GearPiece, 'itemId' | 'rare'>): boolean {
  return isRare(piece.itemId) && piece.rare === undefined
}

/** The rare set of an identified piece. */
export function rareSetOf(piece: Pick<GearPiece, 'rare'>): RareSetDef | undefined {
  return piece.rare === undefined ? undefined : getRareSet(piece.rare)
}

/** Index of a pick by weight (at least one weight > 0). */
function pick(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]!)
    if (roll < 0) return i
  }
  return weights.length - 1
}

/** The rare set and options an identification gives the item. */
export function rollRare(itemId: number, rng: Rng): { rare: number; options: ItemOption[] } {
  const sets = (getItem(itemId).rare ?? []).filter((s) => getRareSet(s.set))
  if (sets.length === 0) throw new GameError('not-rare', `item ${itemId}`)
  const { set } =
    sets[
      pick(
        sets.map((s) => s.weight),
        rng,
      )
    ]!
  const options = getRareSet(set)!
    .options.filter((o) => chance(rng, o.chance / 10000))
    .map(({ type, level }) => ({ type, level }))
  return { rare: set, options }
}

/** What to identify: rare items in the bag (stack or single piece) or a worn piece. */
export type IdentifyTarget =
  { itemId: number; count: number } | { uid: string } | { slot: EquipSlot }

export interface Identification {
  itemId: number
  /** The glass worked (a plain one may fail; the item stays unidentified). */
  success: boolean
  /** The piece after the identification (bag pieces and worn ones). */
  piece: GearPiece
  /** Where a worn piece is. */
  slot?: EquipSlot
}

export interface IdentifyResult {
  character: CharacterData
  results: Identification[]
  /** Glasses spent (one per try). */
  used: number
}

/**
 * Identifies the targets in order with magnifying glasses of one kind, one glass per piece, until the
 * glasses run out. Identified bag pieces leave their stack and become single pieces.
 */
export function applyIdentify(
  character: CharacterData,
  magnifierId: number,
  targets: readonly IdentifyTarget[],
  rng: Rng,
  makeId: () => string = newId,
): IdentifyResult {
  const glass = getItem(magnifierId).magnifier
  if (!glass) throw new GameError('not-a-magnifier', `item ${magnifierId}`)
  let inventory = character.inventory.map((s) => ({ ...s }))
  const owned = () => inventory.find((s) => s.itemId === magnifierId)?.count ?? 0
  if (owned() < 1) throw new GameError('no-magnifier', `item ${magnifierId}`)
  let gear = [...character.gear]
  const equipment = { ...character.equipment }
  const results: Identification[] = []
  let used = 0

  const take = (itemId: number) => {
    const stack = inventory.find((s) => s.itemId === itemId)
    if (stack) stack.count -= 1
    inventory = inventory.filter((s) => s.count > 0)
  }
  /** Spends a glass on the piece; the identified piece, or null when the glass failed. */
  const identify = (piece: GearPiece): GearPiece | null => {
    take(magnifierId)
    used += 1
    if (!chance(rng, glass.chance)) return null
    return { ...piece, ...rollRare(piece.itemId, rng) }
  }

  for (const target of targets) {
    if ('itemId' in target) {
      for (let k = 0; k < target.count && owned() > 0; k++) {
        const stack = inventory.find((s) => s.itemId === target.itemId)
        if (!stack || stack.count < 1 || !isRare(target.itemId)) break
        const plain: GearPiece = { uid: makeId(), itemId: target.itemId, plus: 0 }
        const done = identify(plain)
        if (done) {
          take(target.itemId)
          gear = [...gear, done]
        }
        results.push({ itemId: target.itemId, success: done !== null, piece: done ?? plain })
      }
    } else if ('uid' in target) {
      const piece = gear.find((p) => p.uid === target.uid)
      if (!piece || !isUnidentified(piece) || owned() < 1) continue
      const done = identify(piece)
      if (done) gear = gear.map((p) => (p.uid === piece.uid ? done : p))
      results.push({ itemId: piece.itemId, success: done !== null, piece: done ?? piece })
    } else {
      const piece = equipment[target.slot]
      if (!piece || !isUnidentified(piece) || owned() < 1) continue
      const done = identify(piece)
      if (done) equipment[target.slot] = done
      results.push({
        itemId: piece.itemId,
        success: done !== null,
        piece: done ?? piece,
        slot: target.slot,
      })
    }
  }
  return { character: { ...character, inventory, gear, equipment }, results, used }
}
