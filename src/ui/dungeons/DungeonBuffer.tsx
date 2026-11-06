import { useState } from 'react'
import {
  DUNGEON_BUFFS,
  dungeonBuffDefinition,
  dungeonBuffUpgradeCost,
  dungeonBuffLevel,
  dungeonBuffRank,
} from '../../game/logic/dungeons.ts'
import type { SkillRank } from '../../game/logic/skills.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { SkillIcon } from '../skills/SkillIcon.tsx'
import { statLine, statParts } from '../skills/format.ts'

export function BlessingEffects({ rank }: { rank: Pick<SkillRank, 'effects'> }) {
  return (
    <span className="dungeon-blessing-card__effects">
      {rank.effects.map((e, i) =>
        e.kind === 'stat' ? (
          <span
            key={i}
            className={
              (e.stat === 'castTime' || e.stat === 'reuseTime' ? e.value > 0 : e.value < 0)
                ? 'is-bad'
                : undefined
            }
          >
            {statLine(e)}
          </span>
        ) : e.kind === 'regen' ? (
          <span key={i}>
            +{e.perSecond} {e.resource.toUpperCase()} / s
          </span>
        ) : null,
      )}
    </span>
  )
}

/** A drawback (Devotion's defense, Tyrant's MP drain) reads red, like the client's minus. */
const negative = (value: string) => /^[-−–]/.test(value.trim())
/** One line per effect: its name and value (stats, recovery and Tyrant's MP drain). */
function effectRows(rank: Pick<SkillRank, 'effects'>): [string, string][] {
  return rank.effects.flatMap((e): [string, string][] =>
    e.kind === 'stat'
      ? [statParts(e)]
      : e.kind === 'regen'
        ? [[`${e.resource.toUpperCase()} per second`, `+${e.perSecond}`]]
        : e.kind === 'mpChange'
          ? [['MP per second', `${e.power}${e.percent ? '%' : ''}`]]
          : [],
  )
}

export function DungeonBuffer() {
  const character = useGameStore((s) => s.character)!
  const upgrade = useGameStore((s) => s.upgradeDungeonBuff)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const points = character.dungeons?.points ?? 0
  const locked = !!character.expedition || !!character.dungeons?.active
  return (
    <section className="dungeon-buffer" aria-label="Buffs">
      <p className="sheet__meta">
        Buffs start at level 1. An upgrade costs 100 points for level 2, 200 for level 3, and 100
        more for each level after. Upgrades count in all three dungeons, for this character only. A
        completed 10-minute run awards 1 point per kill; spending points never lowers your ranking.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="dungeon-buffer__list">
        {DUNGEON_BUFFS.map((id) => {
          const skill = dungeonBuffDefinition(id)!
          const level = dungeonBuffLevel(character.dungeons, id)
          const max = skill.levels.at(-1)!.level
          const rank = dungeonBuffRank(id, level)
          const next = skill.levels.some((r) => r.level === level + 1)
            ? dungeonBuffRank(id, level + 1)
            : null
          const cost = dungeonBuffUpgradeCost(level)
          const affordable = points >= cost
          const now = effectRows(rank)
          const later = next ? effectRows(next) : []
          return (
            <li key={id} className={`dungeon-buffer__row${next ? '' : ' is-mastered'}`}>
              <div className="dungeon-buffer__head">
                <SkillIcon id={id} kind="buff" size={40} />
                <span className="dungeon-buffer__name">
                  <strong>{skill.name}</strong>
                  <small>{skill.classId}</small>
                </span>
                <span className="dungeon-buffer__level" aria-label={`Level ${level} of ${max}`}>
                  <span className="dungeon-buffer__pips" aria-hidden="true">
                    {Array.from({ length: max }, (_, i) => (
                      <i key={i} className={i < level ? 'is-on' : undefined} />
                    ))}
                  </span>
                  Lv {level} / {max}
                </span>
              </div>
              {/* each effect now, and what the next level makes of it */}
              <dl className="dungeon-buffer__effects">
                {now.map(([label, value], i) => (
                  <div key={label + i}>
                    <dt>{label}</dt>
                    <dd>
                      <span className={negative(value) ? 'is-bad' : undefined}>{value}</span>
                      {next && later[i] && later[i]![1] !== value && (
                        <>
                          <span className="dungeon-buffer__arrow" aria-label="next level">
                            →
                          </span>
                          <span
                            className={`dungeon-buffer__next${negative(later[i]![1]) ? ' is-bad' : ''}`}
                          >
                            {later[i]![1]}
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="button button--gold dungeon-buffer__buy"
                disabled={busy !== null || !next || !affordable || locked}
                onClick={async () => {
                  setBusy(id)
                  setError('')
                  try {
                    await upgrade(id)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'The buff could not be upgraded.')
                  } finally {
                    setBusy(null)
                  }
                }}
                aria-label={
                  next
                    ? `Upgrade ${skill.name} to level ${next.level} for ${cost} points`
                    : `${skill.name} mastered`
                }
              >
                {!next ? (
                  'Mastered'
                ) : busy === id ? (
                  'Upgrading…'
                ) : (
                  <>
                    <span>Upgrade to Lv {next.level}</span>
                    <span className={`dungeon-buffer__cost${affordable ? '' : ' is-short'}`}>
                      {cost.toLocaleString('en-US')} points
                    </span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
