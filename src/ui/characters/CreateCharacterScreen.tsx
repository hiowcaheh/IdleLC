import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CLASSES, CLASS_ORDER } from '../../game/data/classes.ts'
import type { ClassId } from '../../game/data/types.ts'
import {
  GameError,
  MAX_CHARACTERS,
  NAME_MAX,
  NAME_MIN,
  checkNewCharacter,
  type CreateCharacterError,
} from '../../game/logic/character.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ClassPortrait } from '../hud/ClassPortrait.tsx'
import { ClassPreview } from './ClassPreview.tsx'

const ERRORS: Record<CreateCharacterError, string> = {
  'name-length': `The name must be ${NAME_MIN}–${NAME_MAX} characters long.`,
  'name-characters': 'Use only letters and digits, starting with a letter.',
  'name-taken': 'You already have a character with this name.',
  'unknown-class': 'Choose a class.',
  'no-free-slot': `All ${MAX_CHARACTERS} character slots are taken.`,
}

const message = (code: string) =>
  ERRORS[code as CreateCharacterError] ?? 'Something went wrong. Try again.'

export function CreateCharacterScreen() {
  const characters = useGameStore((s) => s.save.characters)
  const createCharacter = useGameStore((s) => s.createCharacter)
  const enterGame = useGameStore((s) => s.enterGame)
  const navigate = useNavigate()
  const [classId, setClassId] = useState<ClassId>('knight')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const classDef = CLASSES[classId]
  const full = characters.length >= MAX_CHARACTERS

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const problem = checkNewCharacter({ name, classId }, characters)
    if (problem) {
      setError(message(problem))
      return
    }
    setBusy(true)
    try {
      const character = await createCharacter({ name, classId })
      await enterGame(character.id)
      navigate('/')
    } catch (err) {
      setError(message(err instanceof GameError ? err.code : ''))
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <form className="screen__column" onSubmit={onSubmit} noValidate>
        <header className="screen__header">
          <h1 className="screen__logo">IdleLC</h1>
          <p className="screen__subtitle">Create a character</p>
        </header>

        <ClassPreview classId={classId} />

        <fieldset className="class-picker">
          <legend className="class-picker__legend">Class</legend>
          <div className="class-picker__grid">
            {CLASS_ORDER.map((id) => (
              <label key={id} className="class-option">
                <input
                  type="radio"
                  name="class"
                  value={id}
                  checked={classId === id}
                  onChange={() => setClassId(id)}
                />
                <ClassPortrait classId={id} size={40} />
                <span className="class-option__name">{CLASSES[id].name}</span>
                <span className="class-option__role">{CLASSES[id].role}</span>
              </label>
            ))}
          </div>
          <p className="class-picker__description">{classDef.description}</p>
        </fieldset>

        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            maxLength={NAME_MAX}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Your hero's name"
            aria-invalid={error !== null}
            aria-describedby="name-hint"
          />
          <span id="name-hint" className={`field__hint${error ? ' is-error' : ''}`} role="status">
            {error ?? `${NAME_MIN}–${NAME_MAX} letters or digits.`}
          </span>
        </label>

        <div className="screen__actions">
          <button type="submit" className="button button--primary" disabled={busy || full}>
            {full ? 'No free slot' : 'Create and play'}
          </button>
          <Link className="button" to="/characters">
            Back
          </Link>
        </div>
      </form>
    </main>
  )
}
