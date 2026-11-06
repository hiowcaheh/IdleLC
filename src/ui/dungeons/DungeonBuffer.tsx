import { useState } from 'react'
import {
  DUNGEON_BUFFS,
  DUNGEON_BUFF_UPGRADE_COST,
  dungeonBuffDefinition,
  dungeonBuffLevel,
  dungeonBuffRank,
} from '../../game/logic/dungeons.ts'
import type { SkillRank } from '../../game/logic/skills.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { SkillIcon } from '../skills/SkillIcon.tsx'
import { statLine } from '../skills/format.ts'

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

export function DungeonBuffer() {
  const character = useGameStore((s) => s.character)!
  const upgrade = useGameStore((s) => s.upgradeDungeonBuff)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  return (
    <section className="dungeon-buffer" aria-label="Buffer">
      <p className="sheet__meta">
        Blessings start at level 1. Upgrades apply to future runs in all three dungeons, for this
        character only.
      </p>
      <p className="sheet__meta">
        A completed 10-minute run awards 1 point per kill. Spending points never lowers your
        lifetime ranking score.
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
          const rank = dungeonBuffRank(id, level)
          const next = skill.levels.some((r) => r.level === level + 1)
            ? dungeonBuffRank(id, level + 1)
            : null
          const affordable = (character.dungeons?.points ?? 0) >= DUNGEON_BUFF_UPGRADE_COST
          return (
            <li key={id} className="dungeon-buffer__row">
              <div className="dungeon-blessing-card__title">
                <SkillIcon id={id} kind="buff" size={36} />
                <span>
                  <strong>{skill.name}</strong>
                  <small>
                    {skill.classId} · Lv {level} / {skill.levels.at(-1)!.level}
                  </small>
                </span>
              </div>
              <div className="dungeon-buffer__ranks">
                <div>
                  <h4>Current level {level}</h4>
                  <BlessingEffects rank={rank} />
                </div>
                {next && (
                  <div>
                    <h4>Next level {next.level}</h4>
                    <BlessingEffects rank={next} />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="button button--gold"
                disabled={
                  busy !== null ||
                  !next ||
                  !affordable ||
                  !!character.expedition ||
                  !!character.dungeons?.active
                }
                onClick={async () => {
                  setBusy(id)
                  setError('')
                  try {
                    await upgrade(id)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'The blessing could not be upgraded.')
                  } finally {
                    setBusy(null)
                  }
                }}
                aria-label={
                  next
                    ? `Upgrade ${skill.name} to level ${next.level} for ${DUNGEON_BUFF_UPGRADE_COST} points`
                    : `${skill.name} mastered`
                }
              >
                {!next
                  ? 'Mastered'
                  : busy === id
                    ? 'Upgrading…'
                    : `Upgrade: ${DUNGEON_BUFF_UPGRADE_COST} points`}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
