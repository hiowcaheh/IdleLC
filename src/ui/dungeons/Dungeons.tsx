import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  DUNGEONS,
  DUNGEON_MAX_LEVEL,
  DUNGEON_SECONDS,
  getDungeon,
  type DungeonId,
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
import type { CharacterData } from '../../game/logic/character.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { VisibleClock } from '../../game/session/visibleClock.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { ScrollStrip } from '../ScrollStrip.tsx'
import { Sheet } from '../Sheet.tsx'
import { SkillIcon } from '../skills/SkillIcon.tsx'
import { formatSp } from '../skills/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { getItem } from '../../game/data/items.ts'
import { Gold } from '../Gold.tsx'
import { BlessingEffects, DungeonBuffer } from './DungeonBuffer.tsx'
import { DungeonMinimap } from './DungeonMinimap.tsx'
import { nextDungeonWaveIn } from './waveStatus.ts'
import './dungeons.css'

/** Bumped when the dungeon art is cut again (dungeon-art.mjs), past the PWA's cached copy. */
const ART_VERSION = 2

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
    >
      <span className="hud__menu-label" aria-hidden="true">
        Dungeons
      </span>
    </button>
  )
}

export function DungeonsPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)!
  const start = useGameStore((s) => s.startDungeon)
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState<'dungeons' | 'buffs'>('dungeons')
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
          className={`tabs__tab${tab === 'buffs' ? ' is-active' : ''}`}
          aria-selected={tab === 'buffs'}
          onClick={() => setTab('buffs')}
          disabled={busy}
        >
          Buffs
        </button>
      </div>
      <div className="dungeon-wallet" aria-label="Dungeon points">
        <div>
          <span>Available points</span>
          <strong>{(character.dungeons?.points ?? 0).toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Ranking</span>
          <strong>{(character.dungeons?.totalPoints ?? 0).toLocaleString('en-US')}</strong>
        </div>
      </div>
      {tab === 'buffs' ? (
        <DungeonBuffer />
      ) : (
        <>
          <div className="dungeon-page">
            <div className="dungeon-page__main">
              {/* the dungeon's original loading art with its name on it, arrows on its sides */}
              <div
                className="dungeon-hero"
                style={{ '--dungeon-color': def.color } as CSSProperties}
                aria-label="Choose a dungeon"
              >
                <div className="dungeon-hero__art">
                  <img
                    src={`${import.meta.env.BASE_URL}dungeons/${def.id}/loading.webp?v=${ART_VERSION}`}
                    alt={`${def.name}, original client map artwork`}
                  />
                  <button
                    type="button"
                    className="dungeon-hero__arrow dungeon-hero__arrow--left"
                    disabled={busy}
                    onClick={() => turn(-1)}
                    aria-label="Previous dungeon"
                  />
                  <button
                    type="button"
                    className="dungeon-hero__arrow dungeon-hero__arrow--right"
                    disabled={busy}
                    onClick={() => turn(1)}
                    aria-label="Next dungeon"
                  />
                  {locked && <span className="dungeon-hero__lock">Lv {def.minLevel}</span>}
                </div>
                {/* the name under the art, so the hall's statues are not hidden behind it */}
                <div className="dungeon-hero__caption" aria-live="polite">
                  <h3>{def.name}</h3>
                  <span>Horde expedition</span>
                </div>
              </div>
              <ol className="dungeon-pager" aria-label="Dungeons">
                {DUNGEONS.map((d, i) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={i === index ? 'is-active' : ''}
                      style={{ '--dungeon-color': d.color } as CSSProperties}
                      aria-label={d.name}
                      aria-current={i === index}
                      disabled={busy}
                      onClick={() => {
                        setIndex(i)
                        setError('')
                      }}
                    />
                  </li>
                ))}
              </ol>
              <dl className="dungeon-facts">
                <div>
                  <dt>Entry level</dt>
                  <dd className={locked ? 'is-bad' : 'is-good'}>Lv {def.minLevel}</dd>
                </div>
                <div>
                  <dt>Monsters level</dt>
                  <dd>
                    Lv {monsters[0]!.level}–{monsters.at(-1)!.level}
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>10 minutes</dd>
                </div>
                <div>
                  <dt>Entries today</dt>
                  <dd className={left === 0 ? 'is-bad' : undefined}>{left} / 2 left</dd>
                </div>
                <div>
                  <dt>Best score in one run</dt>
                  <dd>{best ? `${best.score} points` : 'No runs yet'}</dd>
                </div>
              </dl>
            </div>
            <div className="dungeon-page__side">
              <section className="dungeon-rules" aria-label="How a run works">
                <h4>How a run works</h4>
                <ul>
                  <li>Survive 20 waves. Each kill scores 1 point.</li>
                  <li>
                    The next wave comes 5 seconds after you clear the last one, or on its own after
                    30 seconds.
                  </li>
                  <li>
                    Collect the crystals to reach dungeon level 20 and choose class blessings.
                  </li>
                  <li>A completed run adds its score to your Buffs points and to the rankings.</li>
                  <li>
                    Potions and your skills remain usable. Your equipped gear is locked. Blessings
                    last until this run ends.
                  </li>
                  <li>
                    Levels 5, 10, 15 and 20 offer fixed super blessings. These cannot be upgraded in
                    Buffs. Your own potions keep their original duration.
                  </li>
                  <li>
                    Death ends the run. Earned EXP, SP, gold and loot are kept. Leaving or reloading
                    uses the entry. Daily entries reset at 00:00 UTC.
                  </li>
                </ul>
              </section>
              <DungeonRanking dungeonId={def.id} />
            </div>
          </div>
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

/**
 * The rankings under the rules: the shown dungeon's own (its completed runs only) and all
 * dungeons together. Three places each; spending points in Buffs changes neither.
 */
function DungeonRanking({ dungeonId }: { dungeonId: DungeonId }) {
  const characters = useGameStore((s) => s.save.characters)
  const you = useGameStore((s) => s.character?.id)
  const [scope, setScope] = useState<'dungeon' | 'all'>('dungeon')
  const name = getDungeon(dungeonId)?.name ?? 'Dungeon'
  // the tab says "Belfist Ranking", as the owner names it; the note keeps the full name
  const short = name.split(' ')[0]
  const points = (c: CharacterData) =>
    scope === 'all'
      ? (c.dungeons?.totalPoints ?? 0)
      : (c.dungeons?.totalByDungeon?.[dungeonId] ?? 0)
  const top = characters
    .filter((c) => points(c) > 0)
    .sort((a, b) => points(b) - points(a))
    .slice(0, 3)
  return (
    <section className="dungeon-ranking" aria-label="Dungeon rankings">
      <div className="tabs tabs--small dungeon-ranking__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`tabs__tab${scope === 'dungeon' ? ' is-active' : ''}`}
          aria-selected={scope === 'dungeon'}
          onClick={() => setScope('dungeon')}
        >
          {short} Ranking
        </button>
        <button
          type="button"
          role="tab"
          className={`tabs__tab${scope === 'all' ? ' is-active' : ''}`}
          aria-selected={scope === 'all'}
          onClick={() => setScope('all')}
        >
          Dungeons Ranking
        </button>
      </div>
      {/* the three best characters, each with the client's trophy in its place's metal */}
      <ol className="dungeon-podium">
        {[0, 1, 2].map((i) => {
          const c = top[i]
          return (
            <li
              key={c?.id ?? `empty-${i}`}
              className={`dungeon-podium__place dungeon-podium__place--${i + 1}${c && c.id === you ? ' is-you' : ''}${c ? '' : ' is-empty'}`}
            >
              <span className="dungeon-podium__trophy" aria-label={`Place ${i + 1}`}>
                <span className="dungeon-podium__number">{i + 1}</span>
              </span>
              <span className="dungeon-podium__name">{c ? c.name : 'Free place'}</span>
              <strong>{c ? `${points(c).toLocaleString('en-US')} points` : '-'}</strong>
            </li>
          )
        })}
      </ol>
      <p>
        {scope === 'all'
          ? 'All completed runs of every dungeon.'
          : `Completed runs in ${name} only.`}{' '}
        Local characters. Spending points in Buffs changes no ranking. Global ranking will be added
        later.
      </p>
    </section>
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
  const nextWave = nextDungeonWaveIn(run)
  return (
    <>
      <div className="dungeon-overview">
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
            {/* the level on the left, the crystals collected and needed on the right */}
            <span className="dungeon-xp__text">
              <span>Dungeon Lv {run.level} / 20</span>
              <span className="dungeon-xp__count">
                {run.level < 20 ? `${run.xp} / ${dungeonXpNeeded(run.level)}` : 'MAX'}
              </span>
            </span>
          </div>
        </section>
      </div>
      <DungeonMinimap run={run} />
      {/* while a blessing is chosen or the run is paused, the window says it instead */}
      {nextWave !== null && !run.choices.length && !paused && !leaveStep && (
        <div className="dungeon-wave-clear" role="status">
          <strong>Wave cleaned</strong>
          <small>
            Next wave in <span>{nextWave}</span> s
          </small>
        </div>
      )}
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
          <p className="dungeon-blessing__paused">
            <strong>Game paused</strong>
            {nextWave !== null ? (
              <span>
                Wave {run.wave} cleaned. The next wave comes {nextWave} s after you choose.
              </span>
            ) : (
              <span>Monsters wait until you choose.</span>
            )}
          </p>
          <p className="sheet__meta">Choose one blessing for the rest of this run.</p>
          {/* the choices side by side, scrolled with the client's arrows on a narrow screen */}
          <ScrollStrip
            className={`dungeon-blessings dungeon-blessings--count-${run.choices.length}`}
            label="Blessings to choose"
          >
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
          </ScrollStrip>
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
              ? 'Final confirmation: end this run now? Your earned loot is kept, but this entry cannot be restored and an unfinished run awards no Buffs points.'
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
  const dungeon = getDungeon(result.dungeonId)!
  return (
    <Sheet
      centered
      title="Dungeon results"
      titleId="dungeon-result-title"
      className="sheet--client dungeon-results"
      onClose={dismiss}
    >
      {/* the score on the dungeon's own art, tinted by how the run ended */}
      <div
        className={`dungeon-results__plate dungeon-results__plate--${result.outcome}`}
        style={
          {
            '--dungeon-color': dungeon.color,
            '--dungeon-art': `url(${import.meta.env.BASE_URL}dungeons/${dungeon.id}/loading.webp?v=${ART_VERSION})`,
          } as CSSProperties
        }
      >
        <h3>{dungeon.name}</h3>
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
          {result.score.toLocaleString('en-US')}
          <span>points</span>
        </div>
      </div>
      <p className={`dungeon-results__points${result.outcome === 'completed' ? '' : ' is-missed'}`}>
        {result.outcome === 'completed'
          ? `+${result.score} Buffs points and ranking points`
          : 'Complete the full 10 minutes to earn Buffs and ranking points.'}
      </p>
      <dl className="dungeon-facts">
        <div>
          <dt>Time survived</dt>
          <dd>{minutes(result.seconds)}</dd>
        </div>
        <div>
          <dt>Dungeon level</dt>
          <dd>{result.level} / 20</dd>
        </div>
        <div>
          <dt>EXP earned</dt>
          <dd>{result.exp.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>SP earned</dt>
          <dd>{formatSp(result.sp)}</dd>
        </div>
        <div>
          <dt>Gold earned</dt>
          <dd>
            <Gold amount={result.gold} />
          </dd>
        </div>
      </dl>
      {result.drops.length > 0 && (
        <section className="dungeon-results__loot" aria-label="Loot">
          <h4>Loot</h4>
          <ul>
            {result.drops.map((d) => (
              <li key={d.itemId} className="item-slot" title={getItem(d.itemId).name}>
                <ItemIcon item={getItem(d.itemId)} size={32} />
                <span className="item-slot__count">{d.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(result.lost.exp > 0 || result.lost.sp > 0) && (
        <p className="dungeon-results__penalty">
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
