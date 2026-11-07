import { useEffect, useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import { getSkill } from '../../game/data/skills.ts'
import { dungeonBuffDefinition, DUNGEON_SUPER_BUFFS } from '../../game/logic/dungeons.ts'
import { effectiveStats, isHarmful, type Side } from '../../game/logic/combat.ts'
import { combatSession } from '../../game/session/combatSession.ts'
import { STAT_TOAST_MS, toast } from '../../state/toasts.ts'
import { statChanges, withStatChanges } from '../statChanges.tsx'
import { useGameStore } from '../../state/gameStore.ts'
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
  const removeEffect = useGameStore((s) => s.removeEffect)
  const inDungeon = useGameStore((s) => !!s.dungeon)
  const [confirming, setConfirming] = useState(false)
  const ended = effect === undefined
  useEffect(() => {
    if (ended) onClose()
  }, [ended, onClose])
  if (!effect) return null
  const skill =
    effect.itemId === undefined
      ? (getSkill(effect.skillId) ?? dungeonBuffDefinition(effect.skillId))
      : undefined
  const kind = skill ? skillRank(skill, 1).kind : 'buff'
  const special = effect.dungeon
    ? DUNGEON_SUPER_BUFFS.find((b) =>
        b.itemId !== undefined ? b.itemId === effect.itemId : b.skillId === effect.skillId,
      )
    : undefined
  const what = effect.dungeon
    ? 'Dungeon blessing'
    : effect.itemId !== undefined
      ? 'Potion'
      : effect.stun
        ? 'Stun'
        : KIND_LABELS[kind]
  const rows = activeEffectRows(effect)
  const description =
    skill?.description ||
    special?.description ||
    (effect.itemId !== undefined ? getItem(effect.itemId).description : undefined)

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
        {description && <p className="effect-window__text">{description}</p>}
      </div>
      {inDungeon && effect.dungeon && (
        <p className="sheet__meta">This dungeon blessing ends when the run ends.</p>
      )}
      {side === 'player' && !isHarmful(effect) && !inDungeon && (
        <div className="effect-window__actions">
          <button type="button" className="button button--wide" onClick={() => setConfirming(true)}>
            Remove effect
          </button>
        </div>
      )}
      {confirming && (
        <Sheet
          centered
          title="Remove effect"
          titleId="remove-effect-title"
          onClose={() => setConfirming(false)}
        >
          <p className="confirm__text">
            Remove {effect.name}? {effect.itemId !== undefined ? 'The potion is used up. ' : ''}
            Its bonuses end now.
          </p>
          <div className="item-row__actions">
            <button
              type="button"
              className="button button--gold"
              onClick={() => {
                const before = effectiveStats(combatSession.state.player)
                if (!removeEffect({ skillId: effect.skillId, itemId: effect.itemId })) return
                const after = effectiveStats(combatSession.state.player)
                const changes = statChanges(before, after)
                // what the hero lost, in red
                toast(
                  withStatChanges(`${effect.name} removed.`, changes),
                  'info',
                  changes.length ? STAT_TOAST_MS : undefined,
                )
                setConfirming(false)
                onClose()
              }}
            >
              Remove
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  )
}
