import { useMemo, useState } from 'react'
import { skillsForClass } from '../../game/data/skills.ts'
import type { SkillDef } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import { SKILL_BAR_SIZE, isAvailable, skillRank, type SkillRank } from '../../game/logic/skills.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { KIND_LABELS, describeEffect, formatSp, learnState, rankCosts } from './format.ts'
import { Sheet } from '../Sheet.tsx'
import { SkillIcon } from './SkillIcon.tsx'

function RankDetails({ title, rank }: { title: string; rank: SkillRank }) {
  return (
    <section className="skill-rank">
      <h3 className="skill-rank__title">{title}</h3>
      <p className="skill-rank__costs">{rankCosts(rank)}</p>
      <ul className="skill-rank__effects">
        {rank.effects.map((effect, i) => (
          <li key={i}>{describeEffect(effect, rank)}</li>
        ))}
      </ul>
    </section>
  )
}

/** Class skills 1:1 from the database: learn them for SP and choose which ones fire automatically. */
export function SkillsPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const learnSkill = useGameStore((s) => s.learnSkill)
  const setSkillAuto = useGameStore((s) => s.setSkillAuto)
  const setSkillBar = useGameStore((s) => s.setSkillBar)
  const [selected, setSelected] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const classId = character?.classId
  const skills = useMemo(() => {
    if (!classId) return []
    const all = skillsForClass(classId)
    // skills IdleLC can't use yet go last
    return [...all.filter((s) => isAvailable(s)), ...all.filter((s) => !isAvailable(s))]
  }, [classId])

  if (!character) return null

  const run = async (action: () => Promise<void>, done: string) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
      setMessage(done)
    } catch (error) {
      setMessage(
        error instanceof GameError ? 'That is not possible right now.' : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  const barFull = character.skillBar.length >= SKILL_BAR_SIZE

  const row = (skill: SkillDef) => {
    const learned = character.skills[skill.id]
    const available = isAvailable(skill)
    const current = learned ? skillRank(skill, learned.level, learned.auto) : null
    const shown = current ?? skillRank(skill, 1)
    const state = learnState(character, skill)
    const open = selected === skill.id
    const onBar = character.skillBar.includes(skill.id)
    const max = skill.levels.length
    return (
      <li
        key={skill.id}
        className={`skill-row${open ? ' is-open' : ''}${available ? '' : ' is-unavailable'}${learned ? ' is-learned' : ''}`}
      >
        <button
          type="button"
          className="skill-row__main"
          aria-expanded={open}
          onClick={() => setSelected(open ? null : skill.id)}
        >
          <SkillIcon id={skill.id} kind={shown.kind} size={36} />
          <span className="skill-row__body">
            <span className="skill-row__name">{skill.name}</span>
            <span className="skill-row__meta">
              {KIND_LABELS[shown.kind]}
              {learned
                ? ` · Lv ${learned.level}/${max}`
                : ` · from level ${skill.levels[0]!.learnLevel}`}
              {current && current.kind !== 'passive' && !current.auto ? ' · auto off' : ''}
            </span>
          </span>
          {state.canLearn && <span className="skill-row__badge">{learned ? 'Up' : 'New'}</span>}
        </button>
        {open && (
          <div className="skill-row__details">
            <p className="skill-row__desc">{skill.description}</p>
            {!available && (
              <p className="skill-row__note">
                Its effects (summons, movement, resurrection…) do not exist in IdleLC yet.
              </p>
            )}
            {current && <RankDetails title={`Level ${current.level}`} rank={current} />}
            {available && state.nextRank && (
              <RankDetails
                title={`${current ? 'Next: level' : 'Level'} ${state.nextRank.level} · ${state.next!.learnSp} SP`}
                rank={state.nextRank}
              />
            )}
            <div className="skill-row__actions">
              {available && state.next && (
                <button
                  type="button"
                  className="button button--gold"
                  disabled={busy || !state.canLearn}
                  onClick={() =>
                    run(
                      () => learnSkill(skill.id),
                      `${skill.name} ${learned ? `is now level ${state.next!.level}` : 'learned'}.`,
                    )
                  }
                >
                  {learned ? 'Upgrade' : 'Learn'} · {state.next.learnSp} SP
                </button>
              )}
              {current && current.kind !== 'passive' && (
                <button
                  type="button"
                  className="button"
                  aria-pressed={current.auto}
                  disabled={busy || character.expedition !== null}
                  onClick={() =>
                    run(
                      () => setSkillAuto(skill.id, !current.auto),
                      `${skill.name}: automatic use ${current.auto ? 'off' : 'on'}.`,
                    )
                  }
                >
                  Auto: {current.auto ? 'On' : 'Off'}
                </button>
              )}
              {current && current.kind !== 'passive' && (
                <button
                  type="button"
                  className="button"
                  aria-pressed={onBar}
                  disabled={busy || character.expedition !== null || (!onBar && barFull)}
                  onClick={() =>
                    run(
                      () =>
                        setSkillBar(
                          onBar
                            ? character.skillBar.filter((id) => id !== skill.id)
                            : [...character.skillBar, skill.id],
                        ),
                      `${skill.name} ${onBar ? 'left' : 'is on'} the skill bar.`,
                    )
                  }
                >
                  {onBar
                    ? 'Remove from bar'
                    : barFull
                      ? `Bar full (${SKILL_BAR_SIZE})`
                      : 'Add to bar'}
                </button>
              )}
            </div>
            {current && current.kind !== 'passive' && !onBar && (
              <p className="skill-row__note">Only skills on the bar are used in fights.</p>
            )}
            {state.blocked && available && <p className="skill-row__note">{state.blocked}</p>}
          </div>
        )}
      </li>
    )
  }

  return (
    <Sheet
      title="Skills"
      titleId="skills-title"
      onClose={onClose}
      extra={
        <p className="skills__sp" aria-label="Skill points">
          <strong>{formatSp(character.sp)}</strong> SP
        </p>
      }
    >
      <p className="sheet__meta">
        Monsters give skill points (SP). Learned skills fire on their own when they are ready and
        you have the mana.
      </p>
      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>
      <ul className="skill-list">{skills.map(row)}</ul>
    </Sheet>
  )
}
