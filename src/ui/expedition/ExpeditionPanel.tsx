import { useEffect, useState } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { AFK_EFFICIENCY, AFK_MAX_SECONDS, AFK_MIN_SECONDS } from '../../game/logic/afk.ts'
import { killReward } from '../../game/logic/rewards.ts'
import type { CharacterData, Expedition } from '../../game/logic/character.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { clock, fmt } from './format.ts'
import { useHourlyEstimate } from './useHourlyEstimate.ts'

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Shown instead of the hunting panel while the character is away on an expedition. */
export function ExpeditionPanel({
  character,
  expedition,
}: {
  character: CharacterData
  expedition: Expedition
}) {
  const returnFromExpedition = useGameStore((s) => s.returnFromExpedition)
  const [busy, setBusy] = useState(false)
  const now = useNow()
  const estimate = useHourlyEstimate(character, expedition.monsterId)
  const elapsed = Math.max(0, (now - expedition.startedAt) / 1000)
  const counted = Math.min(elapsed, AFK_MAX_SECONDS)
  const hours = elapsed >= AFK_MIN_SECONDS ? counted / 3600 : 0
  const done = elapsed >= AFK_MAX_SECONDS
  const monster = getMonster(expedition.monsterId)
  // whole kills only, and exp/gold paid per kill, so the three numbers move together
  const kills = Math.floor(estimate.killsPerHour * AFK_EFFICIENCY * hours)
  const reward = killReward(monster)

  const onReturn = async () => {
    setBusy(true)
    await returnFromExpedition()
  }

  return (
    <section className="hunt expedition" aria-label="Expedition">
      <header className="hunt__header">
        <h2 className="hunt__zone">On an expedition</h2>
        <p className="hunt__kills">
          {monster.name} · {ZONES[expedition.zoneId]?.name}
        </p>
      </header>
      <div
        className="expedition__track"
        role="progressbar"
        aria-label="Expedition time"
        aria-valuemin={0}
        aria-valuemax={AFK_MAX_SECONDS}
        aria-valuenow={Math.floor(counted)}
      >
        <div
          className="expedition__fill"
          style={{ transform: `scaleX(${counted / AFK_MAX_SECONDS})` }}
        />
        <span className="expedition__time">
          {clock(counted)} / {clock(AFK_MAX_SECONDS)}
          {done ? ' · complete' : ''}
        </span>
      </div>
      <p className="expedition__estimate">
        So far about {fmt(kills)} kills · {fmt(kills * reward.exp)} EXP · {fmt(kills * reward.gold)}{' '}
        gold
      </p>
      <button
        type="button"
        className="button button--primary expedition__return"
        onClick={onReturn}
        disabled={busy}
      >
        {done ? 'Collect rewards' : 'Return now'}
      </button>
    </section>
  )
}
