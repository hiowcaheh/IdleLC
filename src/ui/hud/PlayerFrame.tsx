import { classPortrait } from '../../game/data/classes.ts'
import { expToNextLevel } from '../../game/logic/progression.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { EffectRow } from '../skills/EffectRow.tsx'
import { Bar } from './Bar.tsx'
import { ClassPortrait } from './ClassPortrait.tsx'

/**
 * The hero's frame from the client's interface (TopUI): portrait in the ring, level in the small
 * ring, name in the name box, HP, MP and EXP in the three bar slots; buffs right under it.
 */
export function PlayerFrame() {
  const hp = useGameStore((s) => s.hud.playerHp)
  const maxHp = useGameStore((s) => s.hud.playerMaxHp)
  const mp = useGameStore((s) => s.hud.playerMp)
  const maxMp = useGameStore((s) => s.hud.playerMaxMp)
  const character = useGameStore((s) => s.character)
  if (!character) return null
  const { level, exp } = character
  const needed = expToNextLevel(level)
  const expShare = needed > 0 ? (exp / needed) * 100 : 100

  return (
    <section className="unit-frame unit-frame--player" aria-label="Your character">
      <div className="player-frame">
        <div className="player-frame__portrait" aria-hidden="true">
          {classPortrait(character.classId) ? (
            <ClassPortrait classId={character.classId} size={72} />
          ) : (
            <svg viewBox="0 0 40 40">
              <path d="M20 4 L32 9 V19 C32 27 26 33 20 36 C14 33 8 27 8 19 V9 Z" />
            </svg>
          )}
        </div>
        <span className="player-frame__level" title={`Level ${level}`}>
          {level}
        </span>
        <span className="player-frame__name">{character.name}</span>
        <div className="player-frame__bar player-frame__bar--hp">
          <Bar value={hp} max={maxHp} variant="hp" label="Health" />
        </div>
        {maxMp > 0 && (
          <div className="player-frame__bar player-frame__bar--mp">
            <Bar value={mp} max={maxMp} variant="mp" label="Mana" />
          </div>
        )}
        <div className="player-frame__bar player-frame__bar--exp">
          <Bar
            value={Math.floor(expShare)}
            max={100}
            variant="exp"
            label="Experience"
            text={`${expShare.toFixed(1)}%`}
          />
        </div>
      </div>
      <div className="player-frame__effects">
        {!character.expedition && <EffectRow side="player" />}
      </div>
    </section>
  )
}
