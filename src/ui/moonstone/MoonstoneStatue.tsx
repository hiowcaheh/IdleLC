import { useCallback, useEffect, useRef, useState } from 'react'
import { MOONSTONES, moonstoneFor } from '../../game/data/moonstones.ts'
import { getItem } from '../../game/data/items.ts'
import { countOwned } from '../../game/logic/potions.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { fmt } from '../gear/format.ts'
import './moonstone.css'

export function MoonstoneButton({ onClick }: { onClick(): void }) {
  const disabled = useGameStore((s) => !!s.character?.expedition)
  const boss = useGameStore((s) => !!s.character?.worldBoss?.active || !!s.worldBossResult)
  if (!MOONSTONES.length || boss) return null
  return (
    <button
      type="button"
      className="icon-button hud__menu hud__menu--moonstone"
      aria-label="Moonstone Statue"
      title="Moonstone Statue"
      disabled={disabled}
      onClick={onClick}
    >
      <ItemIcon item={getItem(723)} size={28} />
    </button>
  )
}

/** One saved play at a time; automatic play ends on Stop, Exit, tab hiding or an empty stake. */
export function MoonstoneStatue({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const playMoonstone = useGameStore((s) => s.playMoonstone)
  const [stoneId, setStoneId] = useState(
    () =>
      MOONSTONES.find((s) => countOwned(character?.inventory ?? [], s.itemId))?.itemId ??
      MOONSTONES[0]!.itemId,
  )
  const [autoPlay, setAutoPlay] = useState(false)
  const auto = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [prize, setPrize] = useState<ItemStack | null>(null)
  const [rounds, setRounds] = useState(0)
  const [error, setError] = useState('')
  const job = useRef({
    active: false,
    token: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  })
  const stop = useCallback(() => {
    job.current.active = false
    job.current.token++
    if (job.current.timer) clearTimeout(job.current.timer)
    job.current.timer = null
    setPlaying(false)
    setSpinning(false)
  }, [])
  useEffect(() => {
    const current = job.current
    const hidden = () => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      current.active = false
      current.token++
      if (current.timer) clearTimeout(current.timer)
    }
  }, [stop])

  if (!character) return null
  const stone = moonstoneFor(stoneId)!
  const owned = countOwned(character.inventory, stoneId)
  const item = getItem(stoneId)
  const pool = stone.rewards.map((r) => r.itemId)
  const close = () => {
    stop()
    onClose()
  }

  const start = () => {
    if (job.current.active || owned < 1 || document.hidden) return
    job.current.active = true
    const token = ++job.current.token
    setPlaying(true)
    setError('')
    const current = () => job.current.active && job.current.token === token
    const round = async () => {
      if (!current()) return
      if (document.hidden) {
        stop()
        return
      }
      setSpinning(true)
      try {
        const won = await playMoonstone(stoneId)
        if (!current()) return
        setPrize(won)
        setRounds((n) => n + 1)
        job.current.timer = setTimeout(() => {
          if (!current()) return
          setSpinning(false)
          job.current.timer = setTimeout(() => {
            if (!current()) return
            const remaining = countOwned(
              useGameStore.getState().character?.inventory ?? [],
              stoneId,
            )
            if (auto.current && remaining > 0 && !document.hidden) void round()
            else stop()
          }, 450)
        }, 900)
      } catch {
        if (!current()) return
        stop()
        setError('The play could not be completed. Check your Moonstones and try again.')
      }
    }
    void round()
  }

  return (
    <Sheet
      centered
      title="Moonstone Statue"
      titleId="moonstone-title"
      className="sheet--client moonstone"
      onClose={close}
    >
      <div
        className="moonstone-machine"
        aria-label={spinning ? 'Moonstone reels spinning' : 'Moonstone reels'}
      >
        <span className="moonstone-machine__title">Moonstone Statue</span>
        <div className="moonstone-reels" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`moonstone-reel${spinning ? ' is-spinning' : ''}`}>
              {spinning ? (
                <span className="moonstone-reel__strip" style={{ animationDelay: `${i * -0.12}s` }}>
                  {Array.from({ length: 4 }, (_, j) => (
                    <ItemIcon key={j} item={getItem(pool[(i + j) % pool.length]!)} size={32} />
                  ))}
                </span>
              ) : (
                <ItemIcon item={getItem(prize?.itemId ?? stoneId)} fluid />
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="moonstone-stones" role="group" aria-label="Moonstone grade">
        {MOONSTONES.map((s, i) => {
          const n = countOwned(character.inventory, s.itemId)
          return (
            <button
              key={s.itemId}
              type="button"
              className={`moonstone-stone${s.itemId === stoneId ? ' is-selected' : ''}`}
              aria-pressed={s.itemId === stoneId}
              aria-label={`Grade ${i + 1}: ${getItem(s.itemId).name}, ${fmt(n)} available`}
              title={getItem(s.itemId).name}
              disabled={playing}
              onClick={() => {
                setStoneId(s.itemId)
                setPrize(null)
                setError('')
              }}
            >
              <span className="moonstone-stone__icon">
                <ItemIcon item={getItem(s.itemId)} fluid />
              </span>
              <span className="moonstone-stone__count">{fmt(n)}</span>
            </button>
          )
        })}
      </div>
      <div className="moonstone-controls">
        <button
          type="button"
          className={`moonstone-control${playing ? ' moonstone-control--stop' : ' moonstone-control--start'}`}
          aria-label={playing ? 'Stop' : 'Start'}
          disabled={!playing && owned < 1}
          onClick={playing ? stop : start}
        >
          <span className="visually-hidden">{playing ? 'Stop' : 'Start'}</span>
        </button>
        <button type="button" className="moonstone-control moonstone-control--exit" onClick={close}>
          <span className="visually-hidden">Exit</span>
        </button>
      </div>
      <div className="moonstone-info">
        <p className="moonstone-info__stone">
          {item.name}: <strong>{fmt(owned)}</strong> available
        </p>
        <label className="moonstone-auto">
          <input
            type="checkbox"
            className="check-box"
            checked={autoPlay}
            onChange={(e) => {
              auto.current = e.target.checked
              setAutoPlay(e.target.checked)
            }}
          />{' '}
          Automatically play this grade
        </label>
        <p className="moonstone-info__hint">
          One Moonstone per play. Automatic play stops when this grade runs out.
        </p>
        <div className="moonstone-prize" role="status" aria-label="Latest Moonstone prize">
          {prize ? (
            <>
              <ItemIcon item={getItem(prize.itemId)} size={32} />
              <span>
                {getItem(prize.itemId).name}
                {prize.flag ? ` Lv ${prize.flag}` : ''}
                <strong> ×{fmt(prize.count)}</strong>
              </span>
            </>
          ) : (
            <span>Choose a Moonstone and press Start.</span>
          )}
        </div>
        <p className="moonstone-info__plays">Plays this visit: {fmt(rounds)}</p>
        {error && (
          <p className="moonstone-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
