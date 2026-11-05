import type { ClassId } from '../../game/data/types.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import { optionLines } from './format.ts'

/**
 * A piece's options one under another, in the colour of the piece's grade (`tone`: a nameTone class;
 * plain options are blue). A hover note says when one does nothing for the class.
 */
export function OptionList({
  options,
  classId,
  tone = '',
  title = false,
}: {
  options: readonly ItemOption[] | undefined
  classId: ClassId
  tone?: string
  /** The options of a title (CPC::ApplyTitle differs from gear for 50 and 99). */
  title?: boolean
}) {
  const lines = optionLines(options, classId, title)
  if (lines.length === 0) return null
  return (
    <span className={`option-list${tone}`}>
      {lines.map((line, i) => (
        <span key={i} className="option-list__item" title={line.note}>
          <span>{line.name}</span>
          <span className="option-list__amount">{line.amount}</span>
        </span>
      ))}
    </span>
  )
}
