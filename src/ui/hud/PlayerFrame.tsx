import { CLASSES } from '../../game/data/classes.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Bar } from './Bar.tsx'

const formatGold = (gold: number) => gold.toLocaleString('en-US')

export function PlayerFrame() {
  const hp = useGameStore((s) => s.hud.playerHp)
  const maxHp = useGameStore((s) => s.hud.playerMaxHp)
  const character = useGameStore((s) => s.character)
  if (!character) return null
  const { level, gold } = character

  return (
    <section className="unit-frame unit-frame--player" aria-label="Your character">
      <div className="unit-frame__portrait" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <path d="M20 4 L32 9 V19 C32 27 26 33 20 36 C14 33 8 27 8 19 V9 Z" />
          <path d="M20 10 V30 M13 17 H27" className="crest-line" />
        </svg>
        <span className="unit-frame__level" title={`Level ${level}`}>
          {level}
        </span>
      </div>
      <div className="unit-frame__body">
        <div className="unit-frame__name">
          <span className="unit-frame__title">{character.name}</span>
          <span className="unit-frame__sub">{CLASSES[character.classId].name}</span>
        </div>
        <Bar value={hp} max={maxHp} variant="hp" label="Health" />
        <p className="unit-frame__gold" aria-label={`${formatGold(gold)} gold`}>
          <span className="coin" aria-hidden="true" />
          {formatGold(gold)}
        </p>
      </div>
    </section>
  )
}
