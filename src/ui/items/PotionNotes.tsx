import type { PotionDef } from '../../game/data/types.ts'
import { potionNotes, potionRows } from './potionText.ts'

/** When the hero drinks a potion and what happens to it, one line each. */
export function PotionNotes({ potion }: { potion: PotionDef }) {
  return (
    <ul className="potion-notes">
      {potionNotes(potion).map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  )
}

/** A potion's effects one per row with how long it lasts, then its notes (shop rows). */
export function PotionInfo({ potion }: { potion: PotionDef }) {
  return (
    <div className="potion-info">
      <dl className="potion-info__rows">
        {potionRows(potion).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <PotionNotes potion={potion} />
    </div>
  )
}
