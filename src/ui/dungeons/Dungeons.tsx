import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState, type PointerEvent } from 'react'
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
} from '../../game/logic/dungeons.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { VisibleClock } from '../../game/session/visibleClock.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { Character } from '../../scene/Character.tsx'
import { ModelBoundary } from '../../scene/ModelBoundary.tsx'
import { Sheet } from '../Sheet.tsx'
import { SkillIcon } from '../skills/SkillIcon.tsx'
import { formatSp, statLine } from '../skills/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { getItem } from '../../game/data/items.ts'
import { Gold } from '../Gold.tsx'
import './dungeons.css'

const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'The command could not be completed.'
const previewPace = () => 1

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
    >
      <span>Dungeons</span>
    </button>
  )
}

export function DungeonsPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)!
  const start = useGameStore((s) => s.startDungeon)
  const [index, setIndex] = useState(0)
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
      <div className="dungeon-carousel" aria-label="Choose a dungeon">
        <button
          type="button"
          className="button dungeon-arrow"
          disabled={busy}
          onClick={() => turn(-1)}
          aria-label="Previous dungeon"
        >
          ‹
        </button>
        <div className="dungeon-carousel__name" aria-live="polite">
          <h3>{def.name}</h3>
          <span>
            {index + 1} / {DUNGEONS.length}
          </span>
        </div>
        <button
          type="button"
          className="button dungeon-arrow"
          disabled={busy}
          onClick={() => turn(1)}
          aria-label="Next dungeon"
        >
          ›
        </button>
      </div>
      <div className={`dungeon-preview dungeon-preview--${def.id}`}>
        <Canvas
          key={def.id}
          dpr={1}
          camera={{ position: [0, 2.1, 5.8], fov: 36 }}
          gl={{ antialias: false }}
        >
          <hemisphereLight args={['#f2debf', '#20212b', 2]} />
          <directionalLight position={[3, 5, 4]} intensity={2.4} />
          <ModelBoundary resetKey={def.id}>
            <Suspense fallback={null}>
              <Character
                modelId={monsters[0]!.modelId}
                scale={monsters[0]!.scale}
                timeScale={previewPace}
              />
            </Suspense>
          </ModelBoundary>
          <OrbitControls
            target={[0, 1.1, 0]}
            autoRotate
            autoRotateSpeed={1.5}
            enablePan={false}
            enableZoom={false}
          />
        </Canvas>
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
      <p className="dungeon-roster">{monsters.map((m) => m.name).join(', ')}</p>
      <div className="dungeon-rules">
        <p>
          Survive 20 waves. Each kill scores 1 point. Collect the crystals to reach dungeon level 20
          and choose class blessings.
        </p>
        <p>
          Potions and your skills remain usable. Your equipped gear is locked. Blessings last until
          this run ends.
        </p>
        <p>
          Death ends the run. Earned EXP, SP, gold and loot are kept. Leaving or reloading uses the
          entry. Daily entries reset at 00:00 UTC.
        </p>
      </div>
      <section className="dungeon-ranking" aria-label="Dungeon ranking">
        <h4>Best score in one run</h4>
        <div>
          <span>{character.name}</span>
          <strong>{best ? `${best.score} points` : 'No runs recorded yet'}</strong>
        </div>
        <p>Local personal best. Global ranking will be added later.</p>
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
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', visibility)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
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
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dungeonSession.paused = paused || leaving
    dungeonSession.input = { x: 0, z: 0 }
    return () => {
      dungeonSession.paused = false
    }
  }, [paused, leaving])
  if (!run) return null
  const ratio = run.level === DUNGEON_MAX_LEVEL ? 1 : run.xp / dungeonXpNeeded(run.level)
  return (
    <>
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
      <DungeonJoystick />
      <div className="dungeon-actions">
        <button type="button" className="button" onClick={() => setPaused(true)}>
          Pause
        </button>
        <button type="button" className="button" onClick={() => setLeaving(true)}>
          Leave
        </button>
      </div>
      <p className="dungeon-controls-note">
        Move to collect crystals. Attacks and enabled skills are automatic.
      </p>
      {run.choices.length > 0 && (
        <Sheet
          centered
          title="Choose a blessing"
          titleId="dungeon-blessing-title"
          className="sheet--client dungeon-blessing"
          onClose={() => undefined}
        >
          <p className="dungeon-blessing__level">Dungeon level {run.level}</p>
          <p className="sheet__meta">
            Time is paused. Choose one blessing for the rest of this run.
          </p>
          <div className="dungeon-blessings">
            {run.choices.map((id) => {
              const rank = dungeonBuffRank(id)
              const skill = dungeonBuffDefinition(id)!
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
                    <SkillIcon id={id} kind="buff" size={44} />
                    <span>
                      <strong>{rank.name}</strong>
                      <small>
                        {skill.classId}, rank {rank.level}
                      </small>
                    </span>
                  </span>
                  <span className="dungeon-blessing-card__effects">
                    {rank.effects.map((e, i) =>
                      e.kind === 'stat' ? (
                        <span
                          key={i}
                          className={
                            (
                              e.stat === 'castTime' || e.stat === 'reuseTime'
                                ? e.value > 0
                                : e.value < 0
                            )
                              ? 'is-bad'
                              : undefined
                          }
                        >
                          {statLine(e)}
                        </span>
                      ) : e.kind === 'regen' ? (
                        <span key={i}>
                          +{e.perSecond} {e.resource.toUpperCase()} / s
                        </span>
                      ) : null,
                    )}
                  </span>
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
      {(paused || leaving) && !run.choices.length && (
        <Sheet
          centered
          title={leaving ? 'Leave dungeon?' : 'Dungeon paused'}
          titleId="dungeon-pause-title"
          className="sheet--client dungeon-pause"
          onClose={() => {
            if (!busy) {
              setPaused(false)
              setLeaving(false)
            }
          }}
        >
          <p>
            {leaving
              ? 'Keep your earned rewards and end this run? The entry has already been used.'
              : 'The timer and all combat are paused.'}
          </p>
          <div className="dungeon-pause__actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setPaused(false)
                setLeaving(false)
              }}
            >
              Continue
            </button>
            {leaving && (
              <button
                type="button"
                className="button button--gold"
                disabled={busy}
                onClick={async () => {
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
                End run
              </button>
            )}
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
        Rewards are already in your bag. Dungeon blessings and temporary effects have been cleared.
      </p>
      <button type="button" className="button button--gold button--wide" onClick={dismiss}>
        Return to the field
      </button>
    </Sheet>
  )
}
