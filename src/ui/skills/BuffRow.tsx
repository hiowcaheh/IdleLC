import { getSkill } from '../../game/data/skills.ts'
import { skillRank } from '../../game/logic/skills.ts'
import { SkillIcon } from './SkillIcon.tsx'
import { useCombatTicker } from './useCombatTicker.ts'

/** Buffs on the hero with the seconds they have left. */
export function BuffRow() {
  const effects = useCombatTicker(250).player.effects
  if (effects.length === 0) return null
  return (
    <ul className="buff-row" aria-label="Active effects">
      {effects.map((effect) => {
        const skill = getSkill(effect.skillId)
        const kind = skill ? skillRank(skill, 1).kind : 'buff'
        const left = Math.ceil(effect.remaining)
        return (
          <li key={effect.skillId} className="buff-row__item" title={`${effect.name} · ${left} s`}>
            <SkillIcon id={effect.skillId} kind={kind} size={20} />
            <span className="buff-row__time">
              {left >= 60 ? `${Math.floor(left / 60)}m` : left}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
