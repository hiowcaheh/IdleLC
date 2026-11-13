/**
 * Wearing an accessory (owner's request, 2026-11-13): the three accessory slots, what each holds
 * now and what the hero's stats would do with the new piece there; the player picks the slot.
 */
import { getItem } from '../../game/data/items.ts'
import type { AccessorySlot } from '../../game/data/types.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import type { GearPiece } from '../../game/logic/equipment.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, nameTone, pieceName, wearChanges } from './format.ts'

const SLOTS: AccessorySlot[] = ['accessory1', 'accessory2', 'accessory3']

export function AccessorySlotPicker({
  character,
  piece,
  busy,
  onWear,
  onClose,
}: {
  character: CharacterData
  piece: Pick<GearPiece, 'itemId' | 'plus' | 'options' | 'rare'>
  busy: boolean
  onWear(slot: AccessorySlot): void
  onClose(): void
}) {
  const item = getItem(piece.itemId)
  return (
    <Sheet
      centered
      title="Choose a slot"
      titleId="accessory-slot-title"
      className="sheet--client accessory-picker"
      onClose={onClose}
    >
      <div className="accessory-picker__head">
        <ItemIcon item={item} size={40} />
        <span className={`accessory-picker__name${nameTone(piece)}`}>
          {pieceName(piece.itemId, piece.plus, piece.rare)}
        </span>
      </div>
      <ul className="accessory-picker__slots">
        {SLOTS.map((slot, i) => {
          const worn = character.equipment[slot]
          const changes = wearChanges(character, piece, slot)
          return (
            <li key={slot} className={`accessory-picker__slot${worn ? '' : ' is-free'}`}>
              <div className="accessory-picker__now">
                <span className="accessory-picker__label">
                  {SLOT_LABELS[slot]} {i + 1}
                </span>
                {worn ? (
                  <span className="accessory-picker__worn">
                    <ItemIcon item={getItem(worn.itemId)} size={28} />
                    <span className={`accessory-picker__worn-name${nameTone(worn)}`}>
                      {pieceName(worn.itemId, worn.plus, worn.rare)}
                    </span>
                  </span>
                ) : (
                  <span className="accessory-picker__empty">Empty</span>
                )}
              </div>
              {changes.length === 0 ? (
                <p className="accessory-picker__none">No change to your stats</p>
              ) : (
                <dl className="wear-compare__list">
                  {changes.map((c) => (
                    <div
                      key={c.label}
                      className={`wear-compare__row ${c.good ? 'is-up' : 'is-down'}`}
                    >
                      <dt>{c.label}</dt>
                      <dd>{c.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <button
                type="button"
                className="button button--gold button--wide"
                disabled={busy}
                onClick={() => onWear(slot)}
              >
                {worn ? 'Replace' : 'Wear here'}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
