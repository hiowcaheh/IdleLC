import { useLayoutEffect, useRef, useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import { getSkill } from '../../game/data/skills.ts'
import type { ActiveEffect, Side } from '../../game/logic/combat.ts'
import { skillRank } from '../../game/logic/skills.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { effectKey } from './format.ts'
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

/** Most effects the hero's row shows at once (owner's rule). */
export const MAX_SHOWN_EFFECTS = 50

/**
 * Effects on a fighter (the hero's buffs and potions, the monster's curses) with the seconds they
 * have left; with `onPick`, tapping one opens it. With `line`, one line scrolled sideways (at most
 * MAX_SHOWN_EFFECTS), with arrows on the sides that have more.
 */
export function EffectRow({
  side,
  size = 20,
  onPick,
  line = false,
}: {
  side: Side
  size?: number
  onPick?(id: string): void
  line?: boolean
}) {
  const all = useCombatTicker(250)[side].effects
  const effects = line ? all.slice(0, MAX_SHOWN_EFFECTS) : all
  const list = useRef<HTMLUListElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  /** Which sides of the line have effects scrolled out of sight. */
  const measure = () => {
    const el = list.current
    if (!line || !el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setMore((was) => (was.left === left && was.right === right ? was : { left, right }))
  }
  // the row re-renders with the ticker, so its overflow is measured after every render
  useLayoutEffect(measure)
  if (effects.length === 0) return null
  const scrollBy = (direction: 1 | -1) =>
    list.current?.scrollBy({ left: direction * list.current.clientWidth * 0.8, behavior: 'smooth' })
  const row = (
    <ul
      ref={list}
      className={`effect-row effect-row--${side}`}
      aria-label={side === 'player' ? 'Your active effects' : 'Effects on the target'}
      onScroll={line ? measure : undefined}
    >
      {effects.map((effect) => {
        const skill = effect.itemId === undefined ? getSkill(effect.skillId) : undefined
        const kind = skill ? skillRank(skill, 1).kind : 'buff'
        const left = Math.ceil(effect.remaining)
        const style = look(effect, side)
        const label = [effect.name, LABELS[style]].filter(Boolean).join(' · ')
        const content = (
          <>
            {effect.itemId === undefined ? (
              <SkillIcon id={effect.skillId} kind={kind} size={size} />
            ) : (
              <ItemIcon item={getItem(effect.itemId)} size={size} />
            )}
            <span className="effect-row__time">
              {left >= 60 ? `${Math.floor(left / 60)}m` : left}
            </span>
          </>
        )
        return (
          <li
            key={effectKey(effect)}
            className={`effect-row__item effect-row__item--${style}`}
            title={`${label} · ${left} s`}
            aria-label={onPick ? undefined : `${label}, ${left} seconds left`}
          >
            {onPick ? (
              <button
                type="button"
                className="effect-row__button"
                aria-label={`${label}, ${left} seconds left, details`}
                onClick={() => onPick(effectKey(effect))}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
  if (!line) return row
  return (
    <div
      className={`effect-scroll${more.left ? ' has-more-left' : ''}${more.right ? ' has-more-right' : ''}`}
    >
      {row}
      {more.left && (
        <button
          type="button"
          className="effect-scroll__more effect-scroll__more--left"
          aria-label="Earlier effects"
          onClick={() => scrollBy(-1)}
        />
      )}
      {more.right && (
        <button
          type="button"
          className="effect-scroll__more effect-scroll__more--right"
          aria-label="More effects"
          onClick={() => scrollBy(1)}
        />
      )}
    </div>
  )
}
