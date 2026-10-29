import { classPortrait } from '../../game/data/classes.ts'
import type { ClassId } from '../../game/data/types.ts'

/** The class's face from the LC interface atlas, at `size` px; nothing without the converted sheet. */
export function ClassPortrait({ classId, size }: { classId: ClassId; size: number }) {
  const sprite = classPortrait(classId)
  if (!sprite) return null
  const k = size / sprite.size
  return (
    <span
      className="class-portrait"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${sprite.url})`,
        backgroundPosition: `-${sprite.x * k}px -${sprite.y * k}px`,
        backgroundSize: `${sprite.sheetWidth * k}px ${sprite.sheetHeight * k}px`,
      }}
    />
  )
}
