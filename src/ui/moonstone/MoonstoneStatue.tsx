import { useMemo, type CSSProperties } from 'react'
import { MOONSTONES, moonstoneFor } from '../../game/data/moonstones.ts'
import { getItem } from '../../game/data/items.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { MOONSTONE_SPIN_MS, type MoonstoneSpin } from '../../game/logic/moonstones.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { fmt } from '../gear/format.ts'
import { useMoonstoneRound } from './useMoonstoneRound.ts'
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
    />
  )
}

const WINNING_CELL = 36
const STRIP_CELLS = 42

/** The visual decoys never consume the game's RNG. Only the reserved source draw can win. */
function prizeStrip(spin: MoonstoneSpin) {
  const pool = moonstoneFor(spin.stoneId)!.rewards
  let seed =
    [...spin.id].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0
  return Array.from({ length: STRIP_CELLS }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return i === WINNING_CELL ? spin.prize.itemId : pool[seed % pool.length]!.itemId
  })
}

function MoonstoneReel({
  spin,
  stoneId,
  rolling,
  paused,
  replay,
  onLanded,
}: {
  spin: MoonstoneSpin | null
  stoneId: number
  rolling: boolean
  paused: boolean
  replay: number
  onLanded(): void
}) {
  const strip = useMemo(() => (spin ? prizeStrip(spin) : null), [spin])
  const end = `-${(WINNING_CELL - 2) * 20}%`
  return (
    <div
      className={`moonstone-reels${rolling ? ' is-rolling' : spin && !paused ? ' is-settled' : ''}`}
      aria-hidden="true"
    >
      <div className="moonstone-pointer" />
      {spin && strip && !paused ? (
        <div
          key={`${spin.id}:${replay}`}
          className="moonstone-strip"
          style={
            {
              '--moonstone-end': end,
              '--moonstone-duration': `${MOONSTONE_SPIN_MS}ms`,
            } as CSSProperties
          }
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) requestAnimationFrame(onLanded)
          }}
        >
          {strip.map((id, i) => (
            <span
              key={i}
              className={`moonstone-cell${i === WINNING_CELL ? ' moonstone-cell--winner' : ''}`}
            >
              <ItemIcon item={getItem(id)} fluid />
            </span>
          ))}
        </div>
      ) : (
        <div className="moonstone-placeholder">
          {Array.from({ length: 5 }, (_, i) => (
            <span className="moonstone-cell" key={i}>
              <ItemIcon item={getItem(stoneId)} fluid />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function MoonstoneStatue({ onClose }: { onClose(): void }) {
  const round = useMoonstoneRound(onClose)
  const {
    character,
    stoneId,
    phase,
    spin,
    replay,
    autoPlay,
    prize,
    rounds,
    error,
    stopping,
    leaving,
    running,
    locked,
  } = round
  if (!character) return null
  const owned = countOwned(character.inventory, stoneId)
  const item = getItem(stoneId)
  const rolling = phase === 'rolling'
  const paused = phase === 'paused'
  return (
    <Sheet
      centered
      title="Moonstone Statue"
      titleId="moonstone-title"
      className="sheet--client moonstone"
      onClose={round.close}
    >
      <div
        className="moonstone-machine"
        aria-label={rolling ? 'Moonstone reels spinning' : 'Moonstone reels'}
      >
        <span className="moonstone-machine__title">Moonstone Statue</span>
        <MoonstoneReel
          spin={spin}
          stoneId={stoneId}
          rolling={rolling}
          paused={paused}
          replay={replay}
          onLanded={() => void round.landed()}
        />
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
              disabled={locked}
              onClick={() => round.chooseStone(s.itemId)}
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
          className={`moonstone-control${running ? ' moonstone-control--stop' : ' moonstone-control--start'}`}
          aria-label={running ? 'Stop' : paused ? 'Resume' : 'Start'}
          disabled={
            leaving || stopping || phase === 'claiming' || (!running && !paused && owned < 1)
          }
          onClick={running ? round.stop : () => void round.start()}
        >
          <span className="visually-hidden">{running ? 'Stop' : paused ? 'Resume' : 'Start'}</span>
        </button>
        <button
          type="button"
          className="moonstone-control moonstone-control--exit"
          disabled={leaving}
          onClick={round.close}
        >
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
            disabled={leaving}
            onChange={(e) => round.chooseAuto(e.target.checked)}
          />{' '}
          Automatically play this grade
        </label>
        <p className="moonstone-info__hint">
          {leaving
            ? 'Finishing this roll, then exiting.'
            : stopping
              ? 'Finishing this roll. Automatic play is off.'
              : paused
                ? 'Your draw is saved. Resume this roll without using another stone.'
                : 'One Moonstone per play. The prize reaches your bag when the reel stops.'}
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
            <span>
              {running
                ? 'Drawing…'
                : paused
                  ? 'Roll paused.'
                  : 'Choose a Moonstone and press Start.'}
            </span>
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
