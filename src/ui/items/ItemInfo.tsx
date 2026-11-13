import { CLASSES } from '../../game/data/classes.ts'
import { WEAPON_KINDS, gearClasses, getItem, getRareSet } from '../../game/data/items.ts'
import type { ItemDef } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { requiredLevel } from '../../game/logic/equipment.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import { GRADES, isRare } from '../../game/logic/rare.ts'
import { getTitle } from '../../game/data/titles.ts'
import { SLOT_LABELS, fmt, gearStats, nameTone, optionLines, pieceName } from '../gear/format.ts'
import { ItemIcon } from './ItemIcon.tsx'
import { TYPE_LABELS } from './itemTypes.ts'
import { potionRows } from './potionText.ts'
import { potionAtLevel } from '../../game/logic/combat.ts'
import { titleDuration, titleStyle } from '../titles/format.ts'
import { cashTicketValue } from '../../game/data/cashTickets.ts'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
// strClient_us.lod 1891–1894: exact client captions for the separate +15 lines.
const ADDITION_CAPTIONS: Record<string, string> = {
  'Additional attack': 'Attack Power',
  'Additional magic attack': 'Magical Attack power',
  'Additional defense': 'Defense power',
  'Additional magic defense': 'Magic Defense power',
}

/** "Sword", "Helmet", "Potion"… */
function kindOf(item: ItemDef): string {
  if (cashTicketValue(item.id)) return 'Cash Ticket'
  const gear = item.gear
  if (!gear) return TYPE_LABELS[item.type]
  if (gear.slot === 'weapon') return capitalize(WEAPON_KINDS[gear.subtype] ?? 'weapon')
  return gear.slot === 'accessory' ? 'Accessory' : SLOT_LABELS[gear.slot]
}

/**
 * An item's card, like the client's item tooltip: icon, name and kind, then its grade, stats and
 * requirements as label / value rows (unmet ones in red), and its options one per line.
 */
export function ItemInfo({
  character,
  itemId,
  plus = 0,
  options,
  rare,
  count = 1,
  flag = 0,
}: {
  character: CharacterData
  itemId: number
  plus?: number
  options?: readonly ItemOption[]
  rare?: number
  count?: number
  flag?: number
}) {
  const item = getItem(itemId)
  const gear = item.gear
  const rows: { label: string; value: string; tone?: string }[] = []
  const cash = cashTicketValue(itemId)
  if (cash) rows.push({ label: 'Cash', value: `+${fmt(cash)}`, tone: 'is-good' })
  if (flag > 0) rows.push({ label: 'Effect level', value: String(flag) })
  if (isRare(itemId)) {
    const set = rare === undefined ? undefined : getRareSet(rare)
    rows.push({
      label: 'Grade',
      value: set ? (GRADES[set.grade] ?? '?') : 'Unidentified',
      tone: nameTone({ itemId, rare }),
    })
  }
  for (const [label, value] of gearStats(itemId, plus, rare)) rows.push({ label, value })
  // a potion's effects one per row, then how long it lasts
  // a mineral's effects at the level of its flag
  if (item.potion)
    for (const [label, value] of potionRows(potionAtLevel(item.potion, flag)))
      rows.push({ label, value, tone: label === 'Lasts' ? '' : ' is-good' })
  const level = gear ? requiredLevel(itemId, options) : item.level
  if (level > 1 && item.type !== 'material') {
    rows.push({
      label: 'Required level',
      value: String(level),
      tone: level > character.level ? ' is-unmet' : '',
    })
  }
  if (gear) {
    const classes = gearClasses(gear)
    rows.push({
      label: 'Class',
      value: classes.length > 0 ? classes.map((c) => CLASSES[c].name).join(', ') : 'N/A',
      tone: classes.includes(character.classId) ? '' : ' is-unmet',
    })
  }
  const title = item.title === undefined ? undefined : getTitle(item.title)
  if (title) rows.push({ label: 'Lasts', value: titleDuration(title.days) })
  const lines = optionLines(options ?? title?.options, character.classId, !options && !!title)

  return (
    <div className="item-info">
      <div className="item-info__head">
        <ItemIcon item={item} />
        <span className="item-info__title">
          <span
            className={`item-info__name${nameTone({ itemId, rare })}`}
            style={title ? titleStyle(title) : undefined}
          >
            {pieceName(itemId, plus, rare)}
            {count > 1 ? ` ×${fmt(count)}` : ''}
          </span>
          <span className="item-info__kind">{title ? 'Title' : kindOf(item)}</span>
        </span>
      </div>
      {rows.length > 0 && (
        <dl className="hero-stats hero-stats--single item-info__stats">
          {rows.map(({ label, value, tone = '' }) => (
            <div
              key={label}
              className={ADDITION_CAPTIONS[label] ? 'item-info__addition' : undefined}
            >
              <dt className={ADDITION_CAPTIONS[label] ? 'visually-hidden' : undefined}>{label}</dt>
              <dd>
                <span className={tone.trim() || undefined}>
                  {ADDITION_CAPTIONS[label] ? `${ADDITION_CAPTIONS[label]} ${value}` : value}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {lines.length > 0 && (
        // in the colour of the piece's grade (plain options: the options' blue)
        <dl className={`item-info__options${nameTone({ itemId, rare })}`} aria-label="Options">
          {lines.map((line, i) => (
            <div key={i} className={line.helps ? undefined : 'is-idle'} title={line.note}>
              <dt>
                {line.name}
                {line.note && <span className="item-info__note">{line.note}</span>}
              </dt>
              <dd>{line.amount}</dd>
            </div>
          ))}
        </dl>
      )}
      {title?.description && <p className="item-row__note">{title.description}</p>}
      {item.description && !item.potion && !title && (
        <p className="item-row__note">{item.description}</p>
      )}
    </div>
  )
}
