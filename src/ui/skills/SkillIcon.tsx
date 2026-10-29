import { skillIcon } from '../../game/data/skills.ts'
import type { SkillKind } from '../../game/logic/skills.ts'

/** Glyph per kind, for skills whose icon atlas has not been converted. */
const GLYPHS: Record<SkillKind, string> = {
  attack: 'M5 19 L15 9 M13 7 L17 11 M15 5 L19 9 L17 11 M4 16 L8 20',
  debuff: 'M12 4 L14 10 L20 10 L15 14 L17 20 L12 16 L7 20 L9 14 L4 10 L10 10 Z',
  buff: 'M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z',
  heal: 'M10 5 H14 V10 H19 V14 H14 V19 H10 V14 H5 V10 H10 Z',
  passive: 'M12 4 a8 8 0 1 0 0.01 0 M12 8 V12 L15 14',
}

/** The skill's icon from the LC atlases, drawn at `size` px, or a glyph for its kind. */
export function SkillIcon({ id, kind, size = 32 }: { id: number; kind: SkillKind; size?: number }) {
  const sprite = skillIcon(id)
  if (sprite) {
    const k = size / sprite.size
    return (
      <span className="skill-icon" aria-hidden="true">
        <span
          className="skill-icon__sprite"
          style={{
            width: size,
            height: size,
            backgroundImage: `url(${sprite.url})`,
            backgroundPosition: `-${sprite.x * k}px -${sprite.y * k}px`,
            backgroundSize: `${sprite.sheetWidth * k}px ${sprite.sheetHeight * k}px`,
          }}
        />
      </span>
    )
  }
  return (
    <span className={`skill-icon skill-icon--${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" style={{ width: size * 0.75, height: size * 0.75 }}>
        <path d={GLYPHS[kind]} />
      </svg>
    </span>
  )
}
