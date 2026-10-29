import { CLASSES } from '../../game/data/classes.ts'
import { getItem, getOption, gearClasses, slotsFor } from '../../game/data/items.ts'
import type { CombatStats, EquipSlot } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { PLUS_BONUS, checkWear, type GearPiece } from '../../game/logic/equipment.ts'
import { playerFighter } from '../../game/logic/fighters.ts'
import {
  OPTION_EFFECTS,
  optionHelps,
  optionValue,
  type ItemOption,
} from '../../game/logic/options.ts'

export const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  shield: 'Shield',
  helmet: 'Helmet',
  armor: 'Armor',
  pants: 'Pants',
  gloves: 'Gloves',
  boots: 'Boots',
  accessory1: 'Accessory',
  accessory2: 'Accessory',
  accessory3: 'Accessory',
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

/** "Strength +6", "Hit Rate +3.7%" (hit and evasion are in 1/10 %). */
export function optionText(option: ItemOption): string {
  const name = getOption(option.type)?.name ?? `Option ${option.type}`
  const value = optionValue(option)
  const stat = OPTION_EFFECTS[option.type]?.stat
  return stat === 'hit' || stat === 'dodge'
    ? `${name} +${Number((value / 10).toFixed(1))}%`
    : `${name} +${fmt(value)}`
}

/** The options of a piece with whether they help the class. */
export function optionLines(
  options: readonly ItemOption[] | undefined,
  classId: CharacterData['classId'],
): { text: string; helps: boolean }[] {
  return (options ?? []).map((o) => ({ text: optionText(o), helps: optionHelps(o, classId) }))
}

/** How the hero's attack, defense and speed would change by wearing a piece ("Attack +12"). */
export function compareText(
  character: CharacterData,
  piece: Pick<GearPiece, 'itemId' | 'plus' | 'options'>,
): string {
  const gear = getItem(piece.itemId).gear
  if (!gear) return ''
  const slots = slotsFor(gear)
  const slot = slots.find((s) => !character.equipment[s]) ?? slots[0]!
  const before = heroStats(character)
  const after = playerFighter({
    ...character,
    equipment: { ...character.equipment, [slot]: { uid: 'preview', ...piece } },
  }).stats
  const parts: string[] = []
  const delta = (label: string, a: number, b: number) => {
    const d = Math.round(b - a)
    if (d !== 0) parts.push(`${label} ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`)
  }
  delta('Attack', before.attack, after.attack)
  delta('Defense', before.defense, after.defense)
  delta('HP', before.maxHp, after.maxHp)
  delta('MP', before.maxMp ?? 0, after.maxMp ?? 0)
  const pct = (label: string, a = 0, b = 0) => {
    const d = Math.round((b - a) * 10) / 10
    if (d !== 0) parts.push(`${label} ${d > 0 ? '+' : '−'}${Math.abs(d)}%`)
  }
  pct('Accuracy', before.hit, after.hit)
  pct('Evasion', before.dodge, after.dodge)
  if (Math.abs(after.attackInterval - before.attackInterval) > 0.001) {
    parts.push(
      `${after.attackInterval.toFixed(1)} s per hit (now ${before.attackInterval.toFixed(1)})`,
    )
  }
  return parts.length ? parts.join(' · ') : 'No change'
}
