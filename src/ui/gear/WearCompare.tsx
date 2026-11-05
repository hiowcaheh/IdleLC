import type { CharacterData } from '../../game/logic/character.ts'
import type { GearPiece } from '../../game/logic/equipment.ts'
import { wearChanges } from './format.ts'

/**
 * "If you wear it": every stat of the Character window the piece would change, one per line,
 * better in green and worse in red.
 */
export function WearCompare({
  character,
  piece,
  note,
}: {
  character: CharacterData
  piece: Pick<GearPiece, 'itemId' | 'plus' | 'options' | 'rare'>
  /** A line under the changes (an unidentified rare piece's options). */
  note?: string
}) {
  const changes = wearChanges(character, piece)
  return (
    <div className="wear-compare">
      <span className="wear-compare__title">If you wear it</span>
      {changes.length === 0 ? (
        <span className="wear-compare__none">No change to your stats</span>
      ) : (
        <dl className="wear-compare__list">
          {changes.map((c) => (
            <div key={c.label} className={`wear-compare__row ${c.good ? 'is-up' : 'is-down'}`}>
              <dt>{c.label}</dt>
              <dd>{c.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <span className="wear-compare__note">{note}</span>}
    </div>
  )
}
