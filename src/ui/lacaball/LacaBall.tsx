import { useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  GOLD_TOKEN_ID,
  TOKEN_ID,
  lacaBallCourse,
  lacaBallCourses,
} from '../../game/data/lacaball.ts'
import { getItem } from '../../game/data/items.ts'
import {
  lacaBallCost,
  lacaBallDisplayPool,
  lacaBallDrawDuration,
} from '../../game/logic/lacaball.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { useModalFocus } from '../useModalFocus.ts'
import { useLacaBallRound } from './useLacaBallRound.ts'
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
  const round = useLacaBallRound(onClose)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus(dialog, round.close)
  const {
    character,
    progress,
    courseId,
    tokenId,
    phase,
    draw,
    replay,
    auto,
    prize,
    error,
    locked,
    busy,
  } = round
  if (!character) return null
  const course = lacaBallCourse(courseId)!
  const courses = lacaBallCourses(tokenId)
  const selected = courses.indexOf(course)
  const first = Math.max(0, Math.min(selected - 1, courses.length - 3))
  const pool = lacaBallDisplayPool(progress, courseId)
  const total = pool.reduce((n, count) => n + count, 0)
  const max = course.rewards.reduce((n, r) => n + r.max, 0)
  const cost = draw?.cost ?? lacaBallCost(courseId, tokenId)!
  const owned = countOwned(character.inventory, tokenId)
  const otherCharacter = progress?.pending && progress.pending.characterId !== character.id
  const duration = draw ? lacaBallDrawDuration(draw) : 2000
  return createPortal(
    <div className="sheet-backdrop sheet-backdrop--center" onClick={round.close}>
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
            className="lacaball-close"
            aria-label="Close Laca Ball"
            onClick={round.close}
          />
        </header>
        <div className="lacaball-play">
          <div
            className={`lacaball-machine${phase === 'rolling' ? ' is-rolling' : ''}`}
            style={{ '--lacaball-duration': `${duration}ms` } as CSSProperties}
            aria-label={phase === 'rolling' ? 'Laca Ball machine drawing' : 'Laca Ball machine'}
          >
            <div className="lacaball-machine__balls" key={`balls-${replay}`} />
            <div className="lacaball-machine__front" />
            <div className="lacaball-machine__basket" />
            {phase === 'rolling' && (
              <div
                key={`ball-${replay}`}
                className="lacaball-machine__ball"
                onAnimationEnd={(e) => {
                  if (e.target === e.currentTarget) requestAnimationFrame(() => void round.landed())
                }}
              />
            )}
            <div className="lacaball-machine__status" role="status">
              {phase === 'paused'
                ? 'Draw saved'
                : phase === 'result'
                  ? 'You won!'
                  : busy
                    ? 'Drawing…'
                    : course.name}
            </div>
            <button
              type="button"
              className="lacaball-machine__start"
              aria-label={phase === 'paused' ? 'Resume Laca Ball' : 'Start Laca Ball'}
              title={phase === 'paused' ? 'Resume' : 'Start'}
              disabled={busy || !!otherCharacter || (!draw && owned < cost)}
              onClick={() => void round.start()}
            />
            <span className="lacaball-machine__start-label">
              {phase === 'paused' ? 'Resume' : 'Start'}
            </span>
          </div>
          <label
            className="lacaball-auto"
            title="Automatically draw with the animation at double speed"
          >
            <input
              type="checkbox"
              aria-label="Auto Draw at double speed"
              checked={auto}
              onChange={(e) => round.chooseAuto(e.target.checked)}
            />
            <span>
              Auto Draw <b>×2</b>
            </span>
          </label>
        </div>
        <div className="lacaball-controls">
          <div className="lacaball-token">
            <button
              type="button"
              className="lacaball-arrow lacaball-arrow--left"
              aria-label="Previous token"
              disabled={locked || tokenId === TOKEN_ID}
              onClick={() => round.chooseToken(TOKEN_ID)}
            />
            <ItemIcon item={getItem(tokenId)} size={22} />
            <strong>{getItem(tokenId).name}</strong>
            <button
              type="button"
              className="lacaball-arrow lacaball-arrow--right"
              aria-label="Next token"
              disabled={locked || tokenId === GOLD_TOKEN_ID}
              onClick={() => round.chooseToken(GOLD_TOKEN_ID)}
            />
          </div>
          <div className="lacaball-courses">
            <button
              type="button"
              className="lacaball-course-arrow lacaball-course-arrow--left"
              aria-label="Previous course"
              disabled={locked || selected === 0}
              onClick={() => round.chooseCourse(courses[selected - 1]!.id)}
            />
            <div className="lacaball-course-list" role="tablist" aria-label="Laca Ball courses">
              {courses.slice(first, first + 3).map((c) => {
                const remaining = lacaBallDisplayPool(progress, c.id).reduce(
                  (n, count) => n + count,
                  0,
                )
                const maximum = c.rewards.reduce((n, r) => n + r.max, 0)
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={c.id === courseId}
                    className={`lacaball-course${c.id === courseId ? ' is-active' : ''}`}
                    disabled={locked}
                    key={c.id}
                    aria-label={`${c.name}, ${remaining} of ${maximum} prizes remaining`}
                    onClick={() => round.chooseCourse(c.id)}
                  >
                    <ItemIcon item={getItem(c.rewards[0]!.itemId)} size={28} />
                    <span>{c.name}</span>
                    <small>
                      {remaining}/{maximum}
                    </small>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="lacaball-course-arrow lacaball-course-arrow--right"
              aria-label="Next course"
              disabled={locked || selected === courses.length - 1}
              onClick={() => round.chooseCourse(courses[selected + 1]!.id)}
            />
          </div>
          <div className="lacaball-balance">
            <span>
              Owned <b>{owned.toLocaleString('en')}</b>
            </span>
            <span>
              Per draw <b>{cost}</b>
            </span>
          </div>
          <div className="lacaball-pool-total" role="status" aria-label="Course pool remaining">
            {course.name}{' '}
            <b>
              {total}/{max}
            </b>
          </div>
          <div className="lacaball-rewards" aria-label={`${course.name} rewards`}>
            <div className="lacaball-rewards__heading">
              <span>Reward</span>
              <span>Pool left</span>
            </div>
            <div className="lacaball-rewards__list">
              {course.rewards.map((r, i) => (
                <div
                  className={`lacaball-reward${pool[i] === 0 ? ' is-empty' : ''}${i === 0 ? ' is-jackpot' : ''}`}
                  key={i}
                >
                  <ItemIcon item={getItem(r.itemId)} size={28} />
                  <span>
                    <span className="lacaball-reward__name" title={getItem(r.itemId).name}>
                      {getItem(r.itemId).name}
                    </span>
                    <b>×{r.count}</b>
                  </span>
                  <strong className="lacaball-reward__stock">
                    {pool[i]}/{r.max}
                  </strong>
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
                  ? 'Your draw is saved. Resume to reveal your prize.'
                  : 'One token per draw. Win the 1/1 grand prize to refill this course.')}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
