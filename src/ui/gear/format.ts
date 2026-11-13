import { pieceStats } from '../../game/logic/itemUpgrades.ts'
import { CLASSES } from '../../game/data/classes.ts'
import {
  DUAL_SWORDS,
  getItem,
  getOption,
  getRareSet,
  gearClasses,
  slotsFor,
} from '../../game/data/items.ts'
import type { CombatStats, EquipSlot } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { checkWear, requiredLevel, type GearPiece } from '../../game/logic/equipment.ts'
import { playerFighter } from '../../game/logic/fighters.ts'
import { statChanges, type StatChange } from '../statChanges.tsx'
import { GRADES, isRare } from '../../game/logic/rare.ts'
import {
  LEVEL_OPTION,
  OPTION_EFFECTS,
  SPECIAL_OPTIONS,
  TITLE_RULES,
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
  const values = pieceStats({ itemId, plus, rare })
  const rows: [string, string][] = []
  for (const [key, label] of [
    ['attack', 'Attack'],
    ['magicAttack', 'Magic attack'],
    ['defense', 'Defense'],
    ['magicDefense', 'Magic defense'],
  ] as const) {
    const base = values.base[key]
    if (base <= 0 && values.total[key] <= 0) continue
    const gain = values.scaled[key] - base
    rows.push([label, gain > 0 ? `${fmt(base)} (+${fmt(gain)})` : fmt(base)])
    if (plus >= 15 && values.bonus[key] > 0) {
      const extra =
        key === 'attack' ? 75 : key === 'magicAttack' ? 50 : key === 'defense' ? 100 : 50
      rows.push([
        `Additional ${label.toLowerCase()}`,
        `+${fmt(Math.min(extra, values.bonus[key]))}`,
      ])
    }
  }
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

/** "Strength +6", "Hit Rate +75" (hit and evasion are raw rating points). */
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
  'blockChance',
  'stunResistance',
  'stoneResistance',
  'silenceResistance',
])

function optionAmount(type: number, value: number): string {
  const [name, amount] = optionParts(type, value)
  return `${name} ${amount}`
}

/** An option's name and amount apart: ["Hit Rate", "+75"]. */
function optionParts(type: number, value: number): [string, string] {
  const name = getOption(type)?.name ?? `Option ${type}`
  const effect = OPTION_EFFECTS[type]
  if (type === LEVEL_OPTION) return [name, `−${fmt(value)}`]
  // Util_Help.cpp GetPaciveOptionType: critical/deadly are a percent of the rating (CmdMsg.cpp:837),
  // PvP absorption and debuff time are shown in 1/100 %.
  if (type === 55 || type === 66 || type === 82 || type === 83) return [name, `+${fmt(value)}%`]
  if (type === 100 || type === 101) return [name, `+${(value / 100).toFixed(2)}%`]
  if (effect?.percent || (effect && PERCENT_STATS.has(effect.stat)))
    return [name, `+${fmt(value)}%`]
  return [name, `+${fmt(value)}`]
}

/** Options the server reads nowhere (Config.h OPTION_NOT_USED_24 / _25). */
const UNUSED_OPTIONS = new Set([24, 25])

/**
 * The options of a piece (or of a title, `title`) with whether they help the class and why not.
 * A title's option 50 does nothing and its All Stats is only shown (CPC::ApplyTitle).
 */
export function optionLines(
  options: readonly ItemOption[] | undefined,
  classId: CharacterData['classId'],
  title = false,
): { text: string; name: string; amount: string; helps: boolean; note?: string }[] {
  return (options ?? []).map((o) => {
    const [name, amount] = optionParts(o.type, optionValue(o))
    const special = SPECIAL_OPTIONS.has(o.type) || o.type === 82 || o.type === 83
    const note = UNUSED_OPTIONS.has(o.type)
      ? 'Unused by the game'
      : title && TITLE_RULES.noEffect.has(o.type)
        ? 'No effect on a title'
        : title && TITLE_RULES.shownOnly.has(o.type)
          ? 'Shown on the attributes only'
          : o.type === LEVEL_OPTION || special || optionHelps(o, classId)
            ? undefined
            : OPTION_EFFECTS[o.type] !== undefined
              ? 'No effect for your class'
              : 'No effect in IdleLC yet'
    return {
      text: `${name} ${amount}`,
      name,
      amount,
      helps: note === undefined,
      ...(note ? { note } : {}),
    }
  })
}

/** How the hero's stats (as the Character window shows them) would change by wearing a piece. */
export function wearChanges(
  character: CharacterData,
  piece: Pick<GearPiece, 'itemId' | 'plus' | 'options' | 'rare'>,
  /** An accessory's chosen slot; else the first free one, else the first. */
  into?: EquipSlot,
): StatChange[] {
  const gear = getItem(piece.itemId).gear
  if (!gear) return []
  const slots = slotsFor(gear)
  const slot =
    into && slots.includes(into) ? into : (slots.find((s) => !character.equipment[s]) ?? slots[0]!)
  const before = heroStats(character)
  const equipment = { ...character.equipment, [slot]: { uid: 'preview', ...piece } }
  // Equipping dual swords also removes the shield, including its options.
  if (gear.slot === 'weapon' && gear.subtype === DUAL_SWORDS) delete equipment.shield
  return statChanges(before, playerFighter({ ...character, equipment }).stats)
}
