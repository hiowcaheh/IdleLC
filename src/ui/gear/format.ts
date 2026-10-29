import { CLASSES } from '../../game/data/classes.ts'
import { getItem, gearClasses } from '../../game/data/items.ts'
import type { CombatStats, EquipSlot } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { PLUS_BONUS, checkWear, type GearPiece } from '../../game/logic/equipment.ts'
import { playerFighter } from '../../game/logic/fighters.ts'

export const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  shield: 'Shield',
  helmet: 'Helmet',
  armor: 'Armor',
  pants: 'Pants',
  gloves: 'Gloves',
  boots: 'Boots',
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** "+3 Lancer Sword". */
export function pieceName(itemId: number, plus = 0): string {
  const name = getItem(itemId).name
  return plus > 0 ? `+${plus} ${name}` : name
}

/** What a piece gives, with its upgrades ("Attack 16 (+3) · 1.0 s per hit"). */
export function gearLine(itemId: number, plus = 0): string {
  const gear = getItem(itemId).gear
  if (!gear) return ''
  const withPlus = (value: number) => {
    const bonus = Math.round(value * PLUS_BONUS * plus)
    return bonus > 0 ? `${fmt(value)} (+${fmt(bonus)})` : fmt(value)
  }
  const parts: string[] = []
  if (gear.attack > 0) parts.push(`Attack ${withPlus(gear.attack)}`)
  if (gear.magicAttack > 0) parts.push(`Magic attack ${withPlus(gear.magicAttack)}`)
  if (gear.defense > 0) parts.push(`Defense ${withPlus(gear.defense)}`)
  if (gear.magicDefense > 0) parts.push(`Magic defense ${withPlus(gear.magicDefense)}`)
  if (gear.attackInterval) parts.push(`${gear.attackInterval.toFixed(1)} s per hit`)
  return parts.join(' · ')
}

/** Why the character can't wear an item, or null. */
export function wearProblem(character: CharacterData, itemId: number): string | null {
  switch (checkWear(character, itemId)) {
    case null:
      return null
    case 'wrong-class': {
      const gear = getItem(itemId).gear
      const classes = gear ? gearClasses(gear).map((c) => CLASSES[c].name) : []
      return classes.length ? `For ${classes.join(', ')}` : 'Not for your class'
    }
    case 'level-too-low':
      return `Requires level ${getItem(itemId).level}`
    default:
      return 'Cannot be worn'
  }
}

export function heroStats(character: CharacterData): CombatStats {
  return playerFighter(character).stats
}

/** How the hero's attack, defense and speed would change by wearing a piece ("Attack +12"). */
export function compareText(
  character: CharacterData,
  piece: Pick<GearPiece, 'itemId' | 'plus'>,
): string {
  const gear = getItem(piece.itemId).gear
  if (!gear) return ''
  const before = heroStats(character)
  const after = playerFighter({
    ...character,
    equipment: { ...character.equipment, [gear.slot]: { uid: 'preview', ...piece } },
  }).stats
  const parts: string[] = []
  const delta = (label: string, a: number, b: number) => {
    const d = Math.round(b - a)
    if (d !== 0) parts.push(`${label} ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`)
  }
  delta('Attack', before.attack, after.attack)
  delta('Defense', before.defense, after.defense)
  if (Math.abs(after.attackInterval - before.attackInterval) > 0.001) {
    parts.push(
      `${after.attackInterval.toFixed(1)} s per hit (now ${before.attackInterval.toFixed(1)})`,
    )
  }
  return parts.length ? parts.join(' · ') : 'No change'
}
