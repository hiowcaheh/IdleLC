import { useMemo } from 'react'
import { learnedRanks, type SkillRank } from '../../game/logic/skills.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { SkillIcon } from './SkillIcon.tsx'
import { useCombatTicker } from './useCombatTicker.ts'

/**
 * The skills on the bar (at most 7; attacks left, buffs right) with their cooldowns. They fire on
 * their own; tapping one turns its automatic use on or off. The Skills window changes the bar.
 */
export function SkillBar() {
  const classId = useGameStore((s) => s.character?.classId)
  const skills = useGameStore((s) => s.character?.skills)
  const bar = useGameStore((s) => s.character?.skillBar)
  const setSkillAuto = useGameStore((s) => s.setSkillAuto)
  const combat = useCombatTicker()
  const ranks = useMemo(() => {
    if (!classId || !skills || !bar) return []
    const byId = new Map(learnedRanks(classId, skills).map((r) => [r.id, r]))
    return bar.map((id) => byId.get(id)).filter((r): r is SkillRank => r !== undefined)
  }, [classId, skills, bar])
  if (ranks.length === 0) return null
  const player = combat.player

  return (
    <div
      className="skill-bar"
      role="toolbar"
      aria-label="Skills — tap to turn automatic use on or off"
    >
      {ranks.map((rank, i) => {
        // a small gap between the attacks and the buffs
        const firstSupport = isSupport(rank) && i > 0 && !isSupport(ranks[i - 1]!)
        const cooldown = player.skillCooldowns[rank.id] ?? 0
        const ratio = cooldown > 0 ? Math.min(1, cooldown / rank.cooldown) : 0
        const dry = player.mp < rank.mpCost
        const casting = player.casting?.id === rank.id
        return (
          <button
            key={rank.id}
            type="button"
            className={`skill-slot${rank.auto ? '' : ' is-off'}${dry ? ' is-dry' : ''}${casting ? ' is-casting' : ''}${firstSupport ? ' is-first-support' : ''}`}
            aria-pressed={rank.auto}
            aria-label={`${rank.name} — automatic use ${rank.auto ? 'on' : 'off'}`}
            title={`${rank.name} (Lv ${rank.level}) · ${rank.mpCost} MP`}
            onClick={() => setSkillAuto(rank.id, !rank.auto).catch(() => undefined)}
          >
            <SkillIcon id={rank.id} kind={rank.kind} size={38} />
            {ratio > 0 && (
              <span
                className="skill-slot__cooldown"
                style={{
                  background: `conic-gradient(rgba(5, 3, 2, 0.72) ${ratio * 360}deg, transparent 0)`,
                }}
              >
                {Math.ceil(cooldown)}
              </span>
            )}
            <span className="skill-slot__auto">{rank.auto ? 'AUTO' : 'OFF'}</span>
          </button>
        )
      })}
    </div>
  )
}

function isSupport(rank: SkillRank): boolean {
  return rank.kind === 'buff' || rank.kind === 'heal'
}
