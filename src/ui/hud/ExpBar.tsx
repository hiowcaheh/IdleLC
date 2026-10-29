import { expToNextLevel } from '../../game/logic/progression.ts'
import { useGameStore } from '../../state/gameStore.ts'

const fmt = (n: number) => n.toLocaleString('en-US')

/** Experience towards the next level, across the bottom of the screen (classic MMO style). */
export function ExpBar() {
  const character = useGameStore((s) => s.character)
  if (!character) return null
  const needed = expToNextLevel(character.level)
  const ratio = needed > 0 ? Math.min(1, character.exp / needed) : 1
  const text =
    needed > 0
      ? `EXP ${fmt(character.exp)} / ${fmt(needed)} (${(Math.min(0.9999, ratio) * 100).toFixed(2)}%)`
      : 'MAX LEVEL'

  return (
    <div
      className="exp-bar"
      role="meter"
      aria-label={`Experience, level ${character.level}`}
      aria-valuemin={0}
      aria-valuemax={needed}
      aria-valuenow={character.exp}
    >
      <div className="exp-bar__fill" style={{ transform: `scaleX(${ratio})` }} />
      <div className="exp-bar__ticks" aria-hidden="true" />
      <span className="exp-bar__text">
        <span className="exp-bar__level">Lv {character.level}</span>
        {text}
      </span>
    </div>
  )
}
