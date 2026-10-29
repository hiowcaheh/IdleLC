import { getSkill } from '../../game/data/skills.ts'
import type { ActiveEffect, Side } from '../../game/logic/combat.ts'
import { skillRank } from '../../game/logic/skills.ts'
import { SkillIcon } from './SkillIcon.tsx'
import { useCombatTicker } from './useCombatTicker.ts'

type Look = 'buff' | 'debuff' | 'stun' | 'poison'

function look(effect: ActiveEffect, side: Side): Look {
  if (effect.stun) return 'stun'
  if (effect.poison > 0) return 'poison'
  return side === 'monster' ? 'debuff' : 'buff'
}

const LABELS: Record<Look, string> = {
  buff: '',
  debuff: '',
  stun: 'Stunned',
  poison: 'Poisoned',
}

/** Effects on a fighter (the hero's buffs, the monster's curses) with the seconds they have left. */
export function EffectRow({ side }: { side: Side }) {
  const effects = useCombatTicker(250)[side].effects
  if (effects.length === 0) return null
  return (
    <ul
      className={`effect-row effect-row--${side}`}
      aria-label={side === 'player' ? 'Your active effects' : 'Effects on the target'}
    >
      {effects.map((effect) => {
        const skill = getSkill(effect.skillId)
        const kind = skill ? skillRank(skill, 1).kind : 'buff'
        const left = Math.ceil(effect.remaining)
        const style = look(effect, side)
        const label = [effect.name, LABELS[style]].filter(Boolean).join(' — ')
        return (
          <li
            key={effect.skillId}
            className={`effect-row__item effect-row__item--${style}`}
            title={`${label} · ${left} s`}
            aria-label={`${label}, ${left} seconds left`}
          >
            <SkillIcon id={effect.skillId} kind={kind} size={20} />
            <span className="effect-row__time">
              {left >= 60 ? `${Math.floor(left / 60)}m` : left}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
