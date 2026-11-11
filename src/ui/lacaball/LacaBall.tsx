import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GOLD_TOKEN_ID,
  LACABALL_COURSES,
  TOKEN_ID,
  lacaBallCourse,
} from '../../game/data/lacaball.ts'
import { getItem } from '../../game/data/items.ts'
import {
  LACABALL_DRAW_MS,
  lacaBallCost,
  lacaBallRepeat,
  type LacaBallDraw,
} from '../../game/logic/lacaball.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { useModalFocus } from '../useModalFocus.ts'
import './lacaball.css'

export function LacaBallButton({ onClick }: { onClick(): void }) {
  const expedition = useGameStore((s) => !!s.character?.expedition)
  const boss = useGameStore((s) => !!s.character?.worldBoss?.active || !!s.worldBossResult)
  if (boss) return null
  return (
    <button
      type="button"
      className="icon-button hud__menu hud__menu--lacaball"
      aria-label="Laca Ball"
      title="Laca Ball"
      disabled={expedition}
      onClick={onClick}
    />
  )
}

export function LacaBall({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const progress = useGameStore((s) => s.save.lacaBall)
  const pending = progress?.pending?.characterId === character?.id ? progress?.pending : undefined
  const [draw, setDraw] = useState<LacaBallDraw | null>(pending ?? null)
  const [courseId, setCourseId] = useState(pending?.courseId ?? 1)
  const [tokenId, setTokenId] = useState(pending?.tokenId ?? TOKEN_ID)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'rolling' | 'claiming' | 'paused'>(
    pending ? 'paused' : 'idle',
  )
  const [replay, setReplay] = useState(0)
  const [prize, setPrize] = useState<ItemStack | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const dialog = useRef<HTMLDivElement>(null)
  const job = useRef({ mounted: true, working: false })
  const close = () => {
    if (!job.current.working) onClose()
  }
  useModalFocus(dialog, close)
  useEffect(() => {
    const current = job.current
    current.mounted = true
    const hidden = () => {
      if (document.hidden) setPhase((p) => (p === 'rolling' ? 'paused' : p))
    }
    const timer = setInterval(() => setNow(Date.now()), 1000)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      current.mounted = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  if (!character) return null
  const course = lacaBallCourse(courseId)!
  const repeat = lacaBallRepeat(progress, now)
  const cost = lacaBallCost(courseId, tokenId, repeat)
  const owned = countOwned(character.inventory, tokenId)
  const busy = ['starting', 'rolling', 'claiming'].includes(phase)
  const locked = busy || !!draw
  const otherCharacter = progress?.pending && progress.pending.characterId !== character.id
  const selectCourse = (id: number) => {
    setCourseId(id)
    if (!lacaBallCourse(id)!.stakes.some((s) => s.itemId === tokenId)) setTokenId(GOLD_TOKEN_ID)
    setPrize(null)
    setError('')
  }
  const start = async () => {
    if (job.current.working || busy || document.hidden) return
    job.current.working = true
    setPrize(null)
    setError('')
    setPhase('starting')
    try {
      const reserved = draw ?? (await useGameStore.getState().beginLacaBall(courseId, tokenId))
      if (!job.current.mounted) return
      setDraw(reserved)
      setReplay((n) => n + 1)
      setPhase(document.hidden ? 'paused' : 'rolling')
    } catch (cause) {
      if (!job.current.mounted) return
      setPhase('idle')
      setError(
        cause instanceof Error && cause.message === 'lacaball-not-enough-tokens'
          ? 'Not enough tokens for this course.'
          : 'The play could not be saved. Please try again.',
      )
    } finally {
      job.current.working = false
    }
  }
  const landed = async () => {
    if (phase !== 'rolling' || !draw || job.current.working || !job.current.mounted) return
    if (document.hidden) {
      setPhase('paused')
      return
    }
    job.current.working = true
    setPhase('claiming')
    try {
      const won = await useGameStore.getState().finishLacaBall(draw.id)
      if (!job.current.mounted) return
      setPrize(won)
      setDraw(null)
      setPhase('idle')
    } catch {
      if (!job.current.mounted) return
      setPhase('paused')
      setError('Your draw is saved. Press Resume to finish it.')
    } finally {
      job.current.working = false
    }
  }
  return createPortal(
    <div className="sheet-backdrop sheet-backdrop--center" onClick={close}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lacaball-title"
        tabIndex={-1}
        className="sheet lacaball"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lacaball__header">
          <h2 id="lacaball-title">Laca Ball</h2>
          <button
            type="button"
            className="icon-button sheet__close"
            aria-label="Close Laca Ball"
            disabled={phase === 'starting' || phase === 'claiming'}
            onClick={close}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div
          className={`lacaball-machine${phase === 'rolling' ? ' is-rolling' : ''}`}
          aria-label={phase === 'rolling' ? 'Laca Ball machine drawing' : 'Laca Ball machine'}
        >
          <div className="lacaball-machine__balls" key={`balls-${replay}`} />
          <div className="lacaball-machine__front" />
          <div className="lacaball-machine__basket" />
          {phase === 'rolling' && (
            <div
              key={`ball-${replay}`}
              className="lacaball-machine__ball"
              style={{ animationDuration: `${LACABALL_DRAW_MS}ms` }}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) requestAnimationFrame(() => void landed())
              }}
            />
          )}
          <div className="lacaball-machine__status" role="status">
            {phase === 'paused'
              ? 'Draw saved'
              : busy
                ? 'Drawing…'
                : prize
                  ? 'You won!'
                  : 'Choose your course'}
          </div>
          <button
            type="button"
            className="lacaball-machine__start"
            aria-label={phase === 'paused' ? 'Resume Laca Ball' : 'Start Laca Ball'}
            title={phase === 'paused' ? 'Resume' : 'Start'}
            disabled={busy || !!otherCharacter || (!draw && (cost === null || owned < cost))}
            onClick={() => void start()}
          />
          <span className="lacaball-machine__start-label">
            {phase === 'paused' ? 'Resume' : 'Start'}
          </span>
        </div>
        <div className="lacaball-controls">
          <div className="lacaball-token">
            <button
              type="button"
              className="lacaball-arrow lacaball-arrow--left"
              aria-label="Previous token"
              disabled={locked || course.stakes.length < 2}
              onClick={() => setTokenId(tokenId === TOKEN_ID ? GOLD_TOKEN_ID : TOKEN_ID)}
            />
            <ItemIcon item={getItem(tokenId)} size={22} />
            <strong>{getItem(tokenId).name}</strong>
            <button
              type="button"
              className="lacaball-arrow lacaball-arrow--right"
              aria-label="Next token"
              disabled={locked || course.stakes.length < 2}
              onClick={() => setTokenId(tokenId === TOKEN_ID ? GOLD_TOKEN_ID : TOKEN_ID)}
            />
          </div>
          <div className="lacaball-courses" role="tablist" aria-label="Laca Ball courses">
            {LACABALL_COURSES.map((c) => (
              <button
                type="button"
                role="tab"
                aria-selected={c.id === courseId}
                className={`lacaball-course${c.id === courseId ? ' is-active' : ''}`}
                disabled={locked}
                key={c.id}
                onClick={() => selectCourse(c.id)}
              >
                <ItemIcon item={getItem(c.rewards[0]!.itemId)} size={28} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <div className="lacaball-balance">
            <span>
              Owned <b>{owned.toLocaleString('en')}</b>
            </span>
            <span>
              Per play <b>{cost}</b>
            </span>
          </div>
          <div className="lacaball-rewards" aria-label={`${course.name} rewards`}>
            <div className="lacaball-rewards__heading">
              <span>Reward</span>
              <span>Qty</span>
              <span>Chance</span>
            </div>
            <div className="lacaball-rewards__list">
              {course.rewards.map((r, i) => (
                <div className="lacaball-reward" key={i}>
                  <ItemIcon item={getItem(r.itemId)} size={28} />
                  <span>{getItem(r.itemId).name}</span>
                  <b>×{r.count}</b>
                  <small>{r.weight / 100}%</small>
                </div>
              ))}
            </div>
          </div>
        </div>
        {prize && (
          <div className="lacaball-winner" role="status">
            <ItemIcon item={getItem(prize.itemId)} size={32} />
            <span>
              {getItem(prize.itemId).name} <b>×{prize.count}</b>
            </span>
          </div>
        )}
        <div className="lacaball-footer">
          <p>
            {error ||
              (otherCharacter
                ? 'Finish the saved draw on your other character first.'
                : phase === 'paused'
                  ? 'Your tokens and result are saved. Resume to reveal your prize.'
                  : 'Tokens: +1 per five plays. Cost resets after 24 hours without playing. Gold token cost stays fixed.')}
          </p>
          <button
            type="button"
            className="button"
            disabled={phase === 'starting' || phase === 'claiming'}
            onClick={close}
          >
            Exit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
