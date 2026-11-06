import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  DUNGEONS,
  DUNGEON_MAX_LEVEL,
  DUNGEON_SECONDS,
  getDungeon,
} from '../../game/data/dungeons.ts'
import { getMonster } from '../../game/data/monsters.ts'
import {
  dungeonBuffRank,
  dungeonBuffDefinition,
  dungeonRunsLeft,
  dungeonXpNeeded,
  dungeonChoiceLevel,
  dungeonSuperBuffDefinition,
  dungeonSuperEffect,
} from '../../game/logic/dungeons.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { VisibleClock } from '../../game/session/visibleClock.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { Sheet } from '../Sheet.tsx'
import { SkillIcon } from '../skills/SkillIcon.tsx'
import { formatSp } from '../skills/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { getItem } from '../../game/data/items.ts'
import { Gold } from '../Gold.tsx'
import { BlessingEffects, DungeonBuffer } from './DungeonBuffer.tsx'
import { DungeonMinimap } from './DungeonMinimap.tsx'
import './dungeons.css'

const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'The command could not be completed.'

export function DungeonsButton({ onClick }: { onClick(): void }) {
  const away = useGameStore((s) => !!s.character?.expedition)
  const traveling = useGameStore((s) => s.hud.phase === 'traveling')
  return (
    <button
      type="button"
      className="icon-button hud__menu hud__menu--dungeons"
      aria-label="Dungeons"
      title="Dungeons"
      disabled={away || traveling}
      onClick={onClick}
    />
  )
}

export function DungeonsPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)!
  const characters = useGameStore((s) => s.save.characters)
  const start = useGameStore((s) => s.startDungeon)
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState<'dungeons' | 'buffer'>('dungeons')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [, refreshDay] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => refreshDay((n) => n + 1), 15000)
    return () => clearInterval(timer)
  }, [])
  const def = DUNGEONS[index]!
  const left = dungeonRunsLeft(character, def.id)
  const monsters = def.monsterIds.map(getMonster)
  const best = character.dungeons?.best[def.id]
  const locked = character.level < def.minLevel
  const turn = (direction: number) => {
    setIndex((n) => (n + direction + DUNGEONS.length) % DUNGEONS.length)
    setError('')
  }
  return (
    <Sheet
      title="Dungeons"
      titleId="dungeons-title"
      className="sheet--client sheet--fixed dungeons-window"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="tabs dungeon-tabs" role="tablist" aria-label="Dungeon pages">
        <button
          type="button"
          role="tab"
          className={`tabs__tab${tab === 'dungeons' ? ' is-active' : ''}`}
          aria-selected={tab === 'dungeons'}
          onClick={() => setTab('dungeons')}
          disabled={busy}
        >
          Dungeons
        </button>
        <button
          type="button"
          role="tab"
          className={`tabs__tab${tab === 'buffer' ? ' is-active' : ''}`}
          aria-selected={tab === 'buffer'}
          onClick={() => setTab('buffer')}
          disabled={busy}
        >
          Buffer
        </button>
      </div>
      <div className="dungeon-wallet" aria-label="Dungeon points">
        <div>
          <span>Available points</span>
          <strong>{(character.dungeons?.points ?? 0).toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Lifetime ranking points</span>
          <strong>{(character.dungeons?.totalPoints ?? 0).toLocaleString('en-US')}</strong>
        </div>
      </div>
      {tab === 'buffer' ? (
        <DungeonBuffer />
      ) : (
        <>
          <div className="dungeon-carousel" aria-label="Choose a dungeon">
            <button
              type="button"
              className="button dungeon-arrow"
              disabled={busy}
              onClick={() => turn(-1)}
              aria-label="Previous dungeon"
            >
              <span className="dungeon-arrow__icon dungeon-arrow__icon--left" aria-hidden="true" />
            </button>
            <div className="dungeon-carousel__name" aria-live="polite">
              <h3>{def.name}</h3>
            </div>
            <button
              type="button"
              className="button dungeon-arrow"
              disabled={busy}
              onClick={() => turn(1)}
              aria-label="Next dungeon"
            >
              <span className="dungeon-arrow__icon dungeon-arrow__icon--right" aria-hidden="true" />
            </button>
          </div>
          <div className="dungeon-preview">
            <img
              src={`${import.meta.env.BASE_URL}dungeons/${def.id}/loading.webp`}
              alt={`${def.name}, original client map artwork`}
            />
            <span className="dungeon-preview__badge">Horde expedition</span>
          </div>
          <div className="dungeon-facts">
            <div>
              <span>Entry level</span>
              <strong className={locked ? 'is-bad' : 'is-good'}>Lv {def.minLevel}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>10 minutes</strong>
            </div>
            <div>
              <span>Entries today</span>
              <strong>{left} / 2 left</strong>
            </div>
            <div>
              <span>Original monsters</span>
              <strong>
                Lv {monsters[0]!.level}–{monsters.at(-1)!.level}
              </strong>
            </div>
          </div>
          <div className="dungeon-rules">
            <p>
              Survive 20 waves. Each kill scores 1 point. Collect the crystals to reach dungeon
              level 20 and choose class blessings. A completed run adds its score to your Buffer
              wallet and lifetime ranking.
            </p>
            <p>
              Potions and your skills remain usable. Your equipped gear is locked. Blessings last
              until this run ends.
            </p>
            <p>
              Levels 5, 10, 15 and 20 offer fixed super blessings. These cannot be upgraded in the
              Buffer. Your own potions keep their original duration.
            </p>
            <p>
              Death ends the run. Earned EXP, SP, gold and loot are kept. Leaving or reloading uses
              the entry. Daily entries reset at 00:00 UTC.
            </p>
          </div>
          <section className="dungeon-ranking" aria-label="Dungeon ranking">
            <h4>Best score in one run</h4>
            <div>
              <span>{character.name}</span>
              <strong>{best ? `${best.score} points` : 'No runs recorded yet'}</strong>
            </div>
            <h4 className="dungeon-ranking__lifetime">Lifetime ranking</h4>
            <ol className="dungeon-ranking__list">
              {[...characters]
                .sort((a, b) => (b.dungeons?.totalPoints ?? 0) - (a.dungeons?.totalPoints ?? 0))
                .map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <strong>{(c.dungeons?.totalPoints ?? 0).toLocaleString('en-US')} points</strong>
                  </li>
                ))}
            </ol>
            <p>
              Local characters. Spending points in the Buffer does not change this ranking. Global
              ranking will be added later.
            </p>
          </section>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="button button--gold button--wide dungeon-enter"
            disabled={busy || locked || left === 0 || !!character.expedition}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await start(def.id)
                onClose()
              } catch (e) {
                setError(errorText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy
              ? 'Entering…'
              : locked
                ? `Requires Lv ${def.minLevel}`
                : left === 0
                  ? 'No entries left today'
                  : 'Enter dungeon'}
          </button>
        </>
      )}
    </Sheet>
  )
}

/** Fixed-step visible play, independent of the renderer's FPS. No hidden time or choice catch-up. */
export function DungeonRuntime() {
  const active = useGameStore((s) => !!s.dungeon)
  useEffect(() => {
    if (!active) return
    const clock = new VisibleClock()
    let frame = 0,
      disposed = false,
      busy = false
    const reset = () => clock.reset(performance.now())
    reset()
    const visibility = () => {
      dungeonSession.input = { x: 0, z: 0 }
      reset()
      if (document.hidden)
        void useGameStore
          .getState()
          .advanceDungeon(0, { x: 0, z: 0 })
          .catch(() => undefined)
    }
    const step = () => {
      if (disposed) return
      const store = useGameStore.getState()
      if (!store.dungeon) return
      dungeonSession.menuOpen = !!document.querySelector('[role="dialog"]')
      if (
        !dungeonSession.ready ||
        dungeonSession.paused ||
        store.dungeon.choices.length ||
        document.hidden ||
        dungeonSession.menuOpen
      )
        reset()
      else if (!busy) {
        const seconds = clock.read(performance.now()) * store.timeScale
        if (seconds > 0) {
          busy = true
          void store
            .advanceDungeon(seconds, { ...dungeonSession.input })
            .catch((e: unknown) => {
              dungeonSession.paused = true
              toast(errorText(e), 'error')
            })
            .finally(() => {
              busy = false
            })
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const potionClock = window.setInterval(() => {
      const store = useGameStore.getState()
      if (
        busy ||
        disposed ||
        !store.dungeon ||
        !dungeonSession.ready ||
        !store.character?.boosts?.some((b) => b.until !== undefined) ||
        !(dungeonSession.paused || dungeonSession.menuOpen || store.dungeon.choices.length)
      )
        return
      busy = true
      void store
        .advanceDungeon(0, { x: 0, z: 0 })
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }, 1000)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', visibility)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      clearInterval(potionClock)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', visibility)
    }
  }, [active])
  return null
}

export function DungeonJoystick() {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  const pointer = useRef<number | null>(null)
  const reset = () => {
    pointer.current = null
    dungeonSession.input = { x: 0, z: 0 }
    if (knob.current) knob.current.style.transform = 'translate(-50%, -50%)'
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId || !base.current) return
    const rect = base.current.getBoundingClientRect()
    let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.36),
      z = (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.36)
    const length = Math.max(1, Math.hypot(x, z))
    x /= length
    z /= length
    dungeonSession.input = { x, z }
    if (knob.current)
      knob.current.style.transform = `translate(calc(-50% + ${x * rect.width * 0.3}px), calc(-50% + ${z * rect.height * 0.3}px))`
  }
  useEffect(() => {
    const keys = new Set<string>()
    const supported = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']
    const input = () => {
      dungeonSession.input = {
        x:
          (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
          (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
        z:
          (keys.has('s') || keys.has('arrowdown') ? 1 : 0) -
          (keys.has('w') || keys.has('arrowup') ? 1 : 0),
      }
    }
    const down = (e: KeyboardEvent) => {
      if (
        !supported.includes(e.key.toLowerCase()) ||
        document.querySelector('[role="dialog"]') ||
        e.target instanceof HTMLInputElement
      )
        return
      e.preventDefault()
      keys.add(e.key.toLowerCase())
      input()
    }
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase())
      input()
    }
    const blur = () => {
      keys.clear()
      reset()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', blur)
      reset()
    }
  }, [])
  return (
    <div
      className="dungeon-joystick"
      ref={base}
      role="group"
      aria-label="Movement joystick. Also use WASD or arrow keys."
      onPointerDown={(e) => {
        if (pointer.current !== null) return
        pointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={move}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span className="dungeon-joystick__cross" aria-hidden="true">
        ✥
      </span>
      <span className="dungeon-joystick__knob" ref={knob} />
    </div>
  )
}

export function DungeonHud() {
  const run = useGameStore((s) => s.dungeon)
  const finish = useGameStore((s) => s.finishDungeon)
  const choose = useGameStore((s) => s.chooseDungeonBuff)
  const [paused, setPaused] = useState(false)
  const [leaveStep, setLeaveStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dungeonSession.paused = paused || leaveStep > 0
    dungeonSession.input = { x: 0, z: 0 }
    return () => {
      dungeonSession.paused = false
    }
  }, [paused, leaveStep])
  if (!run) return null
  const ratio = run.level === DUNGEON_MAX_LEVEL ? 1 : run.xp / dungeonXpNeeded(run.level)
  const superChoice = run.choices.some((id) => !!dungeonSuperBuffDefinition(id))
  return (
    <>
      <div className="dungeon-overview">
        <DungeonMinimap run={run} />
        <section className="dungeon-status" aria-label="Dungeon progress">
          <div className="dungeon-status__heading">
            <strong>{getDungeon(run.dungeonId)!.name}</strong>
            <time>{minutes(Math.max(0, Math.ceil(DUNGEON_SECONDS - run.elapsed)))}</time>
          </div>
          <div className="dungeon-status__counts">
            <span>Wave {run.wave || 1} / 20</span>
            <strong>{run.score} points</strong>
          </div>
          <div
            className="dungeon-xp"
            role="progressbar"
            aria-label="Dungeon level experience"
            aria-valuenow={run.level === 20 ? 100 : Math.floor(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="dungeon-xp__fill" style={{ width: `${ratio * 100}%` }} />
            <span className="dungeon-xp__text">
              Dungeon Lv {run.level} / 20{' '}
              {run.level < 20 ? `(${run.xp}/${dungeonXpNeeded(run.level)})` : 'MAX'}
            </span>
          </div>
        </section>
      </div>
      <DungeonJoystick />
      <div className="dungeon-actions">
        <button type="button" className="button" onClick={() => setPaused(true)}>
          Pause
        </button>
      </div>
      {run.choices.length > 0 && (
        <Sheet
          centered
          title={superChoice ? 'Choose a super blessing' : 'Choose a blessing'}
          titleId="dungeon-blessing-title"
          className={`sheet--client dungeon-blessing${superChoice ? ' dungeon-blessing--super' : ''}`}
          onClose={() => undefined}
        >
          <p className="dungeon-blessing__level">Dungeon level {dungeonChoiceLevel(run)}</p>
          <p className="sheet__meta">
            Time is paused. Choose one blessing for the rest of this run.
          </p>
          <div className={`dungeon-blessings dungeon-blessings--count-${run.choices.length}`}>
            {run.choices.map((id) => {
              const special = dungeonSuperBuffDefinition(id)
              const rank = special
                ? {
                    name: special.name,
                    level: special.level,
                    effects: dungeonSuperEffect(
                      special,
                      600,
                      run.player.stats.clientContext?.classId,
                    ).stats,
                  }
                : dungeonBuffRank(id, run.buffLevels[id] ?? 1)
              const skill = special ? null : dungeonBuffDefinition(id)!
              return (
                <button
                  key={id}
                  type="button"
                  className="dungeon-blessing-card"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    try {
                      await choose(id)
                    } catch (e) {
                      setError(errorText(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <span className="dungeon-blessing-card__title">
                    {special?.itemId ? (
                      <ItemIcon item={getItem(special.itemId)} size={44} />
                    ) : (
                      <SkillIcon id={special?.skillId ?? id} kind="buff" size={44} />
                    )}
                    <span>
                      <strong>{rank.name}</strong>
                      <small>
                        {special
                          ? 'Super blessing, fixed power'
                          : `${skill!.classId}, rank ${rank.level}`}
                      </small>
                    </span>
                  </span>
                  <BlessingEffects rank={rank} />
                  {special?.rewards && (
                    <span className="dungeon-blessing-card__effects">
                      {(['exp', 'sp', 'gold', 'drop'] as const)
                        .filter((key) => special.rewards![key] > 0)
                        .map((key) => (
                          <span key={key}>
                            {key.toUpperCase()} +{special.rewards![key]}% (×
                            {1 + special.rewards![key] / 100})
                          </span>
                        ))}
                    </span>
                  )}
                  <small>Until the run ends</small>
                </button>
              )
            })}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Sheet>
      )}
      {(paused || leaveStep > 0) && !run.choices.length && (
        <Sheet
          centered
          title={leaveStep > 0 ? 'Leave dungeon?' : 'Dungeon paused'}
          titleId="dungeon-pause-title"
          className="sheet--client dungeon-pause"
          onClose={() => {
            if (!busy) {
              if (leaveStep > 0) setLeaveStep(0)
              else setPaused(false)
            }
          }}
        >
          <p>
            {leaveStep === 2
              ? 'Final confirmation: end this run now? Your earned loot is kept, but this entry cannot be restored and an unfinished run awards no Buffer points.'
              : leaveStep === 1
                ? 'Are you sure you want to leave? This ends your current run.'
                : 'The timer and all combat are paused.'}
          </p>
          <div className="dungeon-pause__actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                if (leaveStep > 0) setLeaveStep(0)
                else setPaused(false)
              }}
            >
              {leaveStep > 0 ? 'Cancel' : 'Return'}
            </button>
            <button
              type="button"
              className="button button--gold"
              disabled={busy}
              onClick={async () => {
                if (leaveStep < 2) {
                  setLeaveStep((n) => n + 1)
                  return
                }
                setBusy(true)
                try {
                  await finish()
                } catch (e) {
                  toast(errorText(e), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {leaveStep === 2 ? 'Leave dungeon' : leaveStep === 1 ? 'Yes, leave' : 'Leave'}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

export function DungeonResult() {
  const result = useGameStore((s) => s.dungeonResult)
  const dismiss = useGameStore((s) => s.dismissDungeonResult)
  if (!result) return null
  return (
    <Sheet
      centered
      title="Dungeon results"
      titleId="dungeon-result-title"
      className="sheet--client dungeon-results"
      onClose={dismiss}
    >
      <h3>{getDungeon(result.dungeonId)!.name}</h3>
      <p className="dungeon-results__outcome">
        {
          {
            completed: 'Survived!',
            defeated: 'Defeated',
            left: 'Run ended',
            interrupted: 'Run interrupted',
          }[result.outcome]
        }
      </p>
      <div className="dungeon-results__score">
        {result.score}
        <span>points</span>
      </div>
      <p className="dungeon-results__points">
        {result.outcome === 'completed'
          ? `+${result.score} Buffer points and lifetime ranking points`
          : 'Complete the full 10 minutes to earn Buffer and lifetime ranking points.'}
      </p>
      <div className="dungeon-facts">
        <div>
          <span>Time survived</span>
          <strong>{minutes(result.seconds)}</strong>
        </div>
        <div>
          <span>Dungeon level</span>
          <strong>{result.level} / 20</strong>
        </div>
        <div>
          <span>EXP earned</span>
          <strong>{result.exp.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Gold earned</span>
          <Gold amount={result.gold} />
        </div>
        <div>
          <span>SP earned</span>
          <strong>{formatSp(result.sp)}</strong>
        </div>
      </div>
      {result.drops.length > 0 && (
        <div className="dungeon-results__loot">
          {result.drops.map((d) => (
            <span key={d.itemId} title={getItem(d.itemId).name}>
              <ItemIcon item={getItem(d.itemId)} size={32} />
              <small>×{d.count}</small>
            </span>
          ))}
        </div>
      )}
      {(result.lost.exp > 0 || result.lost.sp > 0) && (
        <p className="is-bad">
          Death penalty: {result.lost.exp.toLocaleString('en-US')} EXP, {formatSp(result.lost.sp)}{' '}
          SP.
        </p>
      )}
      <p className="sheet__meta">
        Rewards are already in your bag. Dungeon blessings have ended. Your own potions keep their
        remaining duration.
      </p>
      <button type="button" className="button button--gold button--wide" onClick={dismiss}>
        Return to the field
      </button>
    </Sheet>
  )
}
