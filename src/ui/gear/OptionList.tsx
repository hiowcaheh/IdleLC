import type { ClassId } from '../../game/data/types.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import { optionLines } from './format.ts'

/** A piece's options; ones that do nothing for the class are dimmed. */
export function OptionList({
  options,
  classId,
}: {
  options: readonly ItemOption[] | undefined
  classId: ClassId
}) {
  const lines = optionLines(options, classId)
  if (lines.length === 0) return null
  return (
    <span className="option-list">
      {lines.map((line, i) => (
        <span
          key={i}
          className={`option-list__item${line.helps ? '' : ' is-useless'}`}
          title={line.note}
        >
          {line.text}
        </span>
      ))}
    </span>
  )
}
