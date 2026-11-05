import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CLASSES, classPortrait } from '../../game/data/classes.ts'
import { ZONES } from '../../game/data/zones.ts'
import { MAX_CHARACTERS } from '../../game/logic/character.ts'
import { wornTitle } from '../../game/logic/titles.ts'
import { armorUpgradePlus } from '../../scene/upgradeEffects.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ClassPortrait } from '../hud/ClassPortrait.tsx'
import { ClassPreview } from './ClassPreview.tsx'

/** Account screen: up to MAX_CHARACTERS characters, enter the world or create a new one. */
export function CharacterSelectScreen() {
  const characters = useGameStore((s) => s.save.characters)
  const enterGame = useGameStore((s) => s.enterGame)
  const deleteCharacter = useGameStore((s) => s.deleteCharacter)
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(characters[0]?.id ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // titles run out by the clock: the screen's time, read once when it opens
  const [now] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  // coming back here (browser Back, "Change character") ends the current session
  useEffect(() => {
    const store = useGameStore.getState()
    if (store.character) void store.leaveGame()
  }, [])

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0] ?? null
  const freeSlots = MAX_CHARACTERS - characters.length

  const onEnter = async () => {
    if (!selected || busy) return
    setBusy(true)
    await enterGame(selected.id)
    navigate('/')
  }

  const onDelete = async () => {
    if (!selected) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    await deleteCharacter(selected.id)
    setSelectedId(null)
  }

  return (
    <main className="screen">
      <div className="screen__column">
        <header className="screen__header">
          <h1 className="screen__logo">IdleLC</h1>
          <p className="screen__subtitle">Choose your character</p>
        </header>

        {selected ? (
          // as in the game: worn gear with its upgrade effects and the worn title's effect
          <ClassPreview
            classId={selected.classId}
            items={Object.values(selected.equipment).map((piece) => piece.itemId)}
            weaponPlus={selected.equipment.weapon?.plus ?? 0}
            armorPlus={armorUpgradePlus(selected.equipment)}
            titleEffect={wornTitle(selected, now)?.effect}
          />
        ) : (
          <div className="class-preview class-preview--empty">
            <p>Create your first character to begin the hunt.</p>
          </div>
        )}

        <ul className="slots" aria-label="Characters">
          {characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`slot${c.id === selected?.id ? ' is-active' : ''}`}
                aria-pressed={c.id === selected?.id}
                onClick={() => {
                  setSelectedId(c.id)
                  setConfirmDelete(false)
                }}
              >
                {classPortrait(c.classId) ? (
                  <span className="slot__portrait">
                    <ClassPortrait classId={c.classId} size={40} />
                    <span className="slot__portrait-level">{c.level}</span>
                  </span>
                ) : (
                  <span className="slot__level">{c.level}</span>
                )}
                <span className="slot__body">
                  <span className="slot__name">{c.name}</span>
                  <span className="slot__meta">
                    {CLASSES[c.classId].name} ·{' '}
                    {c.expedition
                      ? 'On an expedition'
                      : (ZONES[c.location.zoneId]?.name ?? 'Unknown zone')}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {Array.from({ length: freeSlots }, (_, i) => (
            <li key={`free-${i}`}>
              <Link className="slot slot--free" to="/characters/new">
                <span className="slot__plus" aria-hidden="true">
                  +
                </span>
                <span className="slot__name">Create character</span>
              </Link>
            </li>
          ))}
        </ul>

        {selected && (
          <div className="screen__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={onEnter}
              disabled={busy}
            >
              Enter the world
            </button>
            <button
              type="button"
              className={`button button--danger${confirmDelete ? ' is-armed' : ''}`}
              onClick={onDelete}
            >
              {confirmDelete ? `Delete ${selected.name}? Tap again` : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
