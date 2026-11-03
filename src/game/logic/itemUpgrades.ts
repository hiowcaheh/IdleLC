/** Item bonus calculations: PC.cpp:3509–3720,7048–7098; the stone workflow is independent. */
import { getItem, getRareSet } from '../data/items.ts'
import type { GearPiece } from './equipment.ts'
import { levelReduction } from './options.ts'

export type UpgradePiece = Pick<GearPiece, 'itemId' | 'plus' | 'rare' | 'options'>
export const MAGIC_WEAPON_TYPES = new Set([2, 5, 12, 13, 14, 15])
const PHYSICAL_WEAPON_TYPES = new Set([0, 1, 3, 4, 6, 7, 11])

/** The server returns the total; the client tooltip returns this minus the original value. */
export function upgradedValue(base: number, plus: number, level: number): number {
  if (plus <= 0) return base
  const factor = level >= 146 ? 1.188 : plus > 10 ? 1.07 : 1.06
  const growth =
    plus <= 17 ? factor ** plus : factor ** 17 + (plus - 17) * (factor ** 17 - factor ** 16)
  return Math.trunc(level >= 146 ? base + (base * growth) / 10 : base * growth)
}

export function upgradeBonuses(piece: UpgradePiece) {
  const item = getItem(piece.itemId)
  const gear = item.gear
  const plus = piece.plus
  const level = Math.max(0, item.level - levelReduction(piece.options))
  const bonus = {
    attack: 0,
    magicAttack: 0,
    defense: 0,
    magicDefense: 0,
    hitRate: 0,
  }
  if (!gear || !item.upgradeable) return bonus
  if (gear.slot === 'weapon') {
    const magic = MAGIC_WEAPON_TYPES.has(gear.subtype)
    if (level >= 146) {
      const value =
        plus < 6 ? 0 : plus <= 15 ? (plus - 5) * 45 : plus <= 19 ? 450 : plus <= 24 ? 550 : 700
      bonus[magic ? 'magicAttack' : 'attack'] = value
    } else {
      if (plus >= 6) {
        if (magic) bonus.magicAttack += 4
        else if (PHYSICAL_WEAPON_TYPES.has(gear.subtype)) bonus.attack += 6
      }
      if (plus >= 8) {
        if ([0, 3, 4, 7, 11, 13, 14].includes(gear.subtype)) bonus.hitRate = 3
      }
      if (plus >= 15) {
        if (magic) bonus.magicAttack += 50
        else if (PHYSICAL_WEAPON_TYPES.has(gear.subtype)) bonus.attack += 75
      }
    }
  } else if (item.type === 'armor') {
    if (level >= 146)
      bonus.defense =
        plus < 6 ? 0 : plus <= 14 ? (plus - 5) * 25 : plus <= 19 ? 250 : plus <= 24 ? 300 : 400
    else {
      if (gear.slot !== 'shield') {
        if (plus >= 8) bonus.defense += 10
        if (plus >= 10) bonus.magicDefense += 10
      }
      if (plus >= 15) {
        bonus.defense += 100
        bonus.magicDefense += 50
      }
    }
  }
  return bonus
}

/** Same +0 baseline as existing saves; upgrade increments follow the source, including rare bases. */
export function pieceStats(piece: UpgradePiece) {
  const item = getItem(piece.itemId)
  const gear = item.gear
  const rare = piece.rare === undefined ? undefined : getRareSet(piece.rare)
  const bonus = upgradeBonuses(piece)
  const level = Math.max(0, item.level - levelReduction(piece.options))
  const plus = item.upgradeable ? piece.plus : 0
  const base = {
    attack: (gear?.attack ?? 0) + (rare?.attack ?? 0),
    magicAttack: (gear?.magicAttack ?? 0) + (rare?.magic ?? 0),
    defense: (gear?.defense ?? 0) + (rare?.defense ?? 0),
    magicDefense: (gear?.magicDefense ?? 0) + (rare?.resist ?? 0),
  }
  // Server scales rare damage with weapons; armor rare defense is added after scaling.
  const scaled = {
    attack: upgradedValue(base.attack, plus, level),
    magicAttack: upgradedValue(base.magicAttack, plus, level),
    defense: upgradedValue(gear?.defense ?? 0, plus, level) + (rare?.defense ?? 0),
    magicDefense: upgradedValue(gear?.magicDefense ?? 0, plus, level) + (rare?.resist ?? 0),
  }
  const total = {
    attack: scaled.attack + bonus.attack,
    magicAttack: scaled.magicAttack + bonus.magicAttack,
    defense: scaled.defense + bonus.defense,
    magicDefense: scaled.magicDefense + bonus.magicDefense,
  }
  return { base, scaled, bonus, total }
}
