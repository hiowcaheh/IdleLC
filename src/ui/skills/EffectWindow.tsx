import { useEffect } from 'react'
import { getItem } from '../../game/data/items.ts'
import { getSkill } from '../../game/data/skills.ts'
import type { Side } from '../../game/logic/combat.ts'
import { skillRank } from '../../game/logic/skills.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { KIND_LABELS, activeEffectRows, effectKey, timeLeft } from './format.ts'
import { SkillIcon } from './SkillIcon.tsx'
import { useCombatTicker } from './useCombatTicker.ts'

/**
 * An effect on a fighter in its own window: icon, name, what it does and the time it has left
 * (counting down). Closes by itself when the effect ends.
 */
export function EffectWindow({ side, id, onClose }: { side: Side; id: string; onClose(): void }) {
  const effect = useCombatTicker(250)[side].effects.find((e) => effectKey(e) === id)
  const ended = effect === undefined
  useEffect(() => {
    if (ended) onClose()
  }, [ended, onClose])
  if (!effect) return null
  const skill = effect.itemId === undefined ? getSkill(effect.skillId) : undefined
  const kind = skill ? skillRank(skill, 1).kind : 'buff'
  const what = effect.itemId !== undefined ? 'Potion' : effect.stun ? 'Stun' : KIND_LABELS[kind]
  const rows = activeEffectRows(effect)

  return (
    <Sheet centered title={effect.name} titleId="effect-title" onClose={onClose}>
      <div className="item-info">
        <div className="item-info__head">
          {effect.itemId === undefined ? (
            <SkillIcon id={effect.skillId} kind={kind} size={44} />
          ) : (
            <ItemIcon item={getItem(effect.itemId)} size={44} />
          )}
          <span className="item-info__title">
            <span className="item-info__name">{effect.name}</span>
            <span className="item-info__kind">{what}</span>
          </span>
          <span className="effect-window__time" aria-label="Ends in">
            {timeLeft(effect.remaining)}
          </span>
        </div>
        {rows.length > 0 && (
          <dl className="hero-stats hero-stats--single item-info__stats" aria-label="What it does">
            {rows.map(({ label, value, bad }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className={bad ? 'is-bad' : 'is-good'}>{value}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {skill?.description && <p className="effect-window__text">{skill.description}</p>}
      </div>
    </Sheet>
  )
}
