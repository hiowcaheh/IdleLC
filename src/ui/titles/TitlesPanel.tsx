import { useEffect, useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import { getTitle } from '../../game/data/titles.ts'
import { wornTitle } from '../../game/logic/titles.ts'
import { GameError } from '../../game/logic/character.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { STAT_TOAST_MS, toast } from '../../state/toasts.ts'
import { heroStats } from '../gear/format.ts'
import { statChanges, withStatChanges } from '../statChanges.tsx'
import { OptionList } from '../gear/OptionList.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { titleStyle, titleTimeLeft } from './format.ts'

/** The clock for the time left, a tick a minute. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * The hero's titles: the worn one on top, then every title it has with the time it has left and
 * its options; one can be worn at a time (it shows under the hero's name).
 */
export function TitlesPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const setTitle = useGameStore((s) => s.setTitle)
  const [busy, setBusy] = useState(false)
  const now = useNow()
  if (!character) return null

  const worn = wornTitle(character, now)
  const owned = character.titles
    .filter((t) => t.expiresAt === null || t.expiresAt > now)
    .map((t) => ({ ...t, def: getTitle(t.id) }))
    .filter((t) => t.def !== undefined)
    .sort(
      (a, b) =>
        Number(b.id === character.activeTitle) - Number(a.id === character.activeTitle) ||
        a.def!.name.localeCompare(b.def!.name),
    )

  const wear = async (titleId: number | null) => {
    if (busy) return
    setBusy(true)
    try {
      const before = useGameStore.getState().character
      await setTitle(titleId)
      const after = useGameStore.getState().character
      // what the title's options change in the hero's stats, under the message
      const changes = before && after ? statChanges(heroStats(before), heroStats(after)) : []
      toast(
        withStatChanges(
          titleId === null ? 'Title taken off.' : `You wear ${getTitle(titleId)?.name}.`,
          changes,
        ),
        'info',
        changes.length ? STAT_TOAST_MS : undefined,
      )
    } catch (error) {
      toast(
        error instanceof GameError ? 'That is not possible right now.' : 'Something went wrong.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Titles" titleId="titles-title" onClose={onClose} className="sheet--titles">
      <div className="titles__worn">
        <span className="titles__worn-hero">{character.name}</span>
        {worn ? (
          <span className="titles__worn-name" style={titleStyle(worn)}>
            {worn.name}
          </span>
        ) : (
          <span className="titles__worn-none">None</span>
        )}
      </div>
      {owned.length === 0 ? (
        <p className="sheet__empty">
          No titles yet. Use a title item from the bag (Inventory → Other) to add its title here.
        </p>
      ) : (
        <ul className="item-list">
          {owned.map(({ id, expiresAt, def }) => {
            const title = def!
            const wearing = id === character.activeTitle
            return (
              <li key={id} className={`item-row titles__row${wearing ? ' is-open' : ''}`}>
                <div className="item-row__main">
                  <ItemIcon item={getItem(title.item)} />
                  <span className="item-row__body">
                    <span className="titles__name" style={titleStyle(title)}>
                      {title.name}
                    </span>
                    <span className="item-row__meta">
                      {wearing ? 'Worn · ' : ''}
                      {expiresAt === null ? 'Permanent' : `${titleTimeLeft(expiresAt, now)} left`}
                    </span>
                    <OptionList options={title.options} classId={character.classId} />
                  </span>
                  <button
                    type="button"
                    className={`button titles__wear${wearing ? '' : ' button--gold'}`}
                    disabled={busy}
                    onClick={() => wear(wearing ? null : id)}
                  >
                    {wearing ? 'Take off' : 'Wear'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
