import { CLASSES } from '../../game/data/classes.ts'
import { getItem, getOption, getRareSet, gearClasses, slotsFor } from '../../game/data/items.ts'
import type { CombatStats, EquipSlot } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { PLUS_BONUS, checkWear, requiredLevel, type GearPiece } from '../../game/logic/equipment.ts'
import { playerFighter } from '../../game/logic/fighters.ts'
import { GRADES, isRare } from '../../game/logic/rare.ts'
import {
  LEVEL_OPTION,
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

/** "Mighty Perion Sword +3": the rare set's prefix, the item, its upgrades. */
export function pieceName(itemId: number, plus = 0, rare?: number): string {
  const prefix = rare === undefined ? '' : (getRareSet(rare)?.prefix ?? '')
  const name = prefix ? `${prefix} ${getItem(itemId).name}` : getItem(itemId).name
  return plus > 0 ? `${name} +${plus}` : name
}

/**
 * Name colour class of a piece (owner's choice): unidentified rare items red; identified ones by
 * grade — A blue, B green, C light blue, D yellow, E white.
 */
export function nameTone(piece: { itemId: number; rare?: number }): string {
  if (!isRare(piece.itemId)) return ''
  const set = piece.rare === undefined ? undefined : getRareSet(piece.rare)
  return set ? ` name--grade-${GRADES[set.grade] ?? 'E'}` : ' name--unidentified'
}

/** "Grade C" of an identified rare piece, "Unidentified" before. */
export function rareLabel(piece: { itemId: number; rare?: number }): string | null {
  if (!isRare(piece.itemId)) return null
  const set = piece.rare === undefined ? undefined : getRareSet(piece.rare)
  return set ? `Grade ${GRADES[set.grade] ?? '?'}` : 'Unidentified'
}

/** What a piece gives, row by row, with its upgrades ([["Attack", "16 (+3)"], ["Attack speed", "1.0 s per hit"]]). */
export function gearStats(itemId: number, plus = 0, rare?: number): [string, string][] {
  const gear = getItem(itemId).gear
  if (!gear) return []
  // the rare set's flat bonuses count like the item's own stats
  const set = rare === undefined ? undefined : getRareSet(rare)
  const attack = gear.attack + (set?.attack ?? 0)
  const magicAttack = gear.magicAttack + (set?.magic ?? 0)
  const defense = gear.defense + (set?.defense ?? 0)
  const magicDefense = gear.magicDefense + (set?.resist ?? 0)
  const withPlus = (value: number) => {
    const bonus = Math.round(value * PLUS_BONUS * plus)
    return bonus > 0 ? `${fmt(value)} (+${fmt(bonus)})` : fmt(value)
  }
  const rows: [string, string][] = []
  if (attack > 0) rows.push(['Attack', withPlus(attack)])
  if (magicAttack > 0) rows.push(['Magic attack', withPlus(magicAttack)])
  if (defense > 0) rows.push(['Defense', withPlus(defense)])
  if (magicDefense > 0) rows.push(['Magic defense', withPlus(magicDefense)])
  if (gear.attackInterval)
    rows.push(['Attack speed', `${gear.attackInterval.toFixed(1)} s per hit`])
  return rows
}

/** What a piece gives on one line ("Attack 16 (+3) · 1.0 s per hit"). */
export function gearLine(itemId: number, plus = 0, rare?: number): string {
  return gearStats(itemId, plus, rare)
    .map(([label, value]) => (label === 'Attack speed' ? value : `${label} ${value}`))
    .join(' · ')
}

/** Why the character can't wear an item, or null. */
export function wearProblem(
  character: CharacterData,
  itemId: number,
  options?: readonly ItemOption[],
): string | null {
  switch (checkWear(character, itemId, options)) {
    case null:
      return null
    case 'wrong-class': {
      const gear = getItem(itemId).gear
      const classes = gear ? gearClasses(gear).map((c) => CLASSES[c].name) : []
      return classes.length ? `For ${classes.join(', ')}` : 'Not for your class'
    }
    case 'level-too-low':
      return `Requires level ${requiredLevel(itemId, options)}`
    case 'hands-full':
      return 'Dual swords leave no hand for a shield'
    default:
      return 'Cannot be worn'
  }
}

export function heroStats(character: CharacterData): CombatStats {
  return playerFighter(character).stats
}

/** "Strength +6", "Hit Rate +3.7%" (hit and evasion are in 1/10 %). */
export function optionText(option: ItemOption): string {
  return optionAmount(option.type, optionValue(option))
}

/** Stats whose option values are percent. */
const PERCENT_STATS = new Set([
  'cooldownReduction',
  'mpCostReduction',
  'hpSteal',
  'mpSteal',
  'moveSpeed',
  'critMultiplier',
])

function optionAmount(type: number, value: number): string {
  const [name, amount] = optionParts(type, value)
  return `${name} ${amount}`
}

/** An option's name and amount apart: ["Hit Rate", "+3.7%"]. */
function optionParts(type: number, value: number): [string, string] {
  const name = getOption(type)?.name ?? `Option ${type}`
  const effect = OPTION_EFFECTS[type]
  const tenths = (v: number) => `${Number((v / 10).toFixed(1))}%`
  if (type === LEVEL_OPTION) return [name, `−${fmt(value)}`]
  if (effect?.percent || (effect && PERCENT_STATS.has(effect.stat)))
    return [name, `+${fmt(value)}%`]
  if (effect?.stat === 'hit' || effect?.stat === 'dodge' || effect?.stat === 'critChance') {
    return [name, `+${tenths(value)}`]
  }
  return [name, `+${fmt(value)}`]
}

/** The options of a piece with whether they help the class (and why not). */
export function optionLines(
  options: readonly ItemOption[] | undefined,
  classId: CharacterData['classId'],
): { text: string; name: string; amount: string; helps: boolean; note?: string }[] {
  return (options ?? []).map((o) => {
    const helps = optionHelps(o, classId)
    const works = o.type === LEVEL_OPTION || OPTION_EFFECTS[o.type] !== undefined
    const [name, amount] = optionParts(o.type, optionValue(o))
    return {
      text: `${name} ${amount}`,
      name,
      amount,
      helps,
      ...(helps ? {} : { note: works ? 'No effect for your class' : 'No effect in IdleLC yet' }),
    }
  })
}

/** How the hero's attack, defense and speed would change by wearing a piece ("Attack +12"). */
export function compareText(
  character: CharacterData,
  piece: Pick<GearPiece, 'itemId' | 'plus' | 'options' | 'rare'>,
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
  pct('Hit Rate', before.hit, after.hit)
  pct('Evasion', before.dodge, after.dodge)
  if (Math.abs(after.attackInterval - before.attackInterval) > 0.001) {
    parts.push(
      `${after.attackInterval.toFixed(1)} s per hit (now ${before.attackInterval.toFixed(1)})`,
    )
  }
  return parts.length ? parts.join(' · ') : 'No change'
}
