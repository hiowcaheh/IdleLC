import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useState, type ReactNode } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { bookRewards } from '../../game/data/bookRewards.ts'
import { getItem } from '../../game/data/items.ts'
import { claimedRewards, nextReward } from '../../game/logic/book.ts'
import { openSpotCount, zoneSpots } from '../../game/logic/spots.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { Character } from '../../scene/Character.tsx'
import { ModelBoundary } from '../../scene/ModelBoundary.tsx'
import { fmt } from '../gear/format.ts'
import { Gold } from '../Gold.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { Bar } from './Bar.tsx'
import { levelTone } from './levelColor.ts'

const realTime = () => 1

/** A monster turning on a small stage, framed to its size. */
function MonsterPreview({ modelId, scale }: { modelId: string; scale: number }) {
  return (
    <div className="book__preview">
      <Canvas dpr={[1, 1.5]} camera={{ fov: 32, position: [0, 1.6, 5] }}>
        <hemisphereLight args={['#f3dcb2', '#2a1f17', 1.4]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.8} color="#9bd0f0" />
        <ModelBoundary resetKey={modelId}>
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.3}>
              <Character key={modelId} modelId={modelId} timeScale={realTime} scale={scale} />
            </Bounds>
          </Suspense>
        </ModelBoundary>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={1.4}
          minPolarAngle={1.1}
          maxPolarAngle={1.5}
        />
      </Canvas>
    </div>
  )
}

/**
 * A monster's kill rewards (10 / 100 / 1 000 / 10 000 kills): the next one's progress, each reward's
 * items and its state — claimed, claim now, or kills still to go.
 */
function BookRewards({ monsterId, kills }: { monsterId: string; kills: number }) {
  const character = useGameStore((s) => s.character)
  const claimBookReward = useGameStore((s) => s.claimBookReward)
  const [busy, setBusy] = useState(false)
  if (!character) return null
  const claimed = claimedRewards(character, monsterId)
  const rewards = bookRewards(monsterId)
  const next = rewards[claimed]
  const previous = claimed > 0 ? rewards[claimed - 1]!.kills : 0

  const claim = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { reward } = await claimBookReward(monsterId)
      toast(
        `Reward for ${fmt(reward.kills)} kills: ${reward.items
          .map((i) => `${fmt(i.count)}× ${getItem(i.itemId).name}`)
          .join(', ')}.`,
      )
    } catch {
      toast('That is not possible right now.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="book__rewards">
      <h4 className="book__rewards-title">
        <span className="gift-icon" aria-hidden="true" />
        Kill rewards
      </h4>
      {next && (
        <Bar
          variant="book"
          value={Math.min(kills, next.kills) - previous}
          max={next.kills - previous}
          label="Kills to the next reward"
          text={`${fmt(Math.min(kills, next.kills))} / ${fmt(next.kills)}`}
        />
      )}
      <div className="book__reward-labels" aria-hidden="true">
        <span>Kills</span>
        <span>Rewards</span>
        <span>Status</span>
      </div>
      <ul className="book__reward-list">
        {rewards.map((reward, i) => {
          const done = i < claimed
          const ready = !done && i === claimed && kills >= reward.kills
          return (
            <li key={reward.kills} className={`book__reward${done ? ' is-done' : ''}`}>
              <span className="book__reward-kills">{fmt(reward.kills)}</span>
              <span className="book__reward-items">
                {reward.items.map((item) => (
                  <span
                    key={item.itemId}
                    className="book__reward-item"
                    title={getItem(item.itemId).name}
                  >
                    <ItemIcon item={getItem(item.itemId)} size={22} />
                    <span className="book__reward-count">×{fmt(item.count)}</span>
                  </span>
                ))}
              </span>
              {done ? (
                <span className="book__reward-state">✓</span>
              ) : ready ? (
                <button
                  type="button"
                  className="button button--gold book__claim"
                  disabled={busy}
                  onClick={claim}
                >
                  Claim
                </button>
              ) : (
                <span className="book__reward-state is-locked" aria-label="Locked" title="Locked">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="7" rx="1" />
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                  </svg>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The monster book: pick a zone, then one of its monsters (hunting order) to see how many the hero
 * has defeated. Rewards for milestones come later.
 */
const ELEMENTS = ['None', 'Fire', 'Water', 'Earth', 'Wind', 'Dark', 'Light']

/** An element as the server packs it, (level << 4) | element: "Fire 2", "None". */
function elementName(packed = 0): string {
  const name = ELEMENTS[packed & 0xf] ?? 'None'
  return name === 'None' ? name : `${name} ${Math.max(1, (packed >> 4) & 0xf)}`
}

export function MonsterBookPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const [zoneId, setZoneId] = useState(character?.location.zoneId ?? '')
  const [picked, setPicked] = useState(character?.location.monsterId ?? '')
  if (!character) return null

  const spots = zoneSpots(zoneId)
  const open = openSpotCount(character, zoneId)
  const monsterId = spots.includes(picked) ? picked : spots[0]!
  const monster = getMonster(monsterId)
  const index = spots.indexOf(monsterId)
  const kills = character.stats.monsterKills[monsterId] ?? 0
  const zoneKills = spots.reduce((sum, id) => sum + (character.stats.monsterKills[id] ?? 0), 0)
  const facts: [string, ReactNode][] = [
    ['Level', String(monster.level)],
    ['HP', fmt(monster.stats.maxHp)],
    ['Base EXP', fmt(monster.exp)],
    // a_skill_point is in 1/10 000 SP
    ['Base SP', ((monster.sp ?? 0) / 10_000).toLocaleString('en-US', { maximumFractionDigits: 4 })],
    ['Base gold', <Gold amount={monster.gold} />],
    ['Attack element', elementName(monster.stats.attackElement)],
    ['Defense element', elementName(monster.stats.defenseElement)],
    ['Spot', `${index + 1}${index >= open ? ' · locked' : ''}`],
  ]

  return (
    <Sheet
      title="Monster Book"
      titleId="book-title"
      onClose={onClose}
      className="sheet--fixed sheet--client sheet--book"
    >
      <div className="book__zones" role="tablist" aria-label="Zones">
        {Object.values(ZONES).map((zone) => (
          <button
            key={zone.id}
            type="button"
            role="tab"
            aria-selected={zone.id === zoneId}
            className={`grade-chip book__zone${zone.id === zoneId ? ' is-active' : ''}`}
            onClick={() => {
              setZoneId(zone.id)
              setPicked(zone.monsterIds[0] ?? '')
            }}
          >
            {zone.name}
          </button>
        ))}
      </div>
      <p className="sheet__meta">
        {ZONES[zoneId]?.name}: {fmt(zoneKills)} monsters defeated · spots {open} / {spots.length}{' '}
        open
      </p>
      <div className="book">
        <ul className="book__list" aria-label="Monsters" tabIndex={0}>
          {spots.map((id, i) => {
            const m = getMonster(id)
            const locked = i >= open
            const reward = nextReward(character, id)
            const ready =
              reward !== undefined && (character.stats.monsterKills[id] ?? 0) >= reward.kills
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`book__monster${id === monsterId ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
                  aria-pressed={id === monsterId}
                  onClick={() => setPicked(id)}
                >
                  <span className={`level-tag level-tag--${levelTone(character.level, m.level)}`}>
                    {m.level}
                  </span>
                  <span
                    className={`book__monster-name level-tone--${levelTone(character.level, m.level)}`}
                  >
                    {m.name}
                  </span>
                  {ready && (
                    <span
                      className="book__reward-ready"
                      title="Reward ready"
                      aria-label="Reward ready"
                    >
                      <span className="gift-icon" aria-hidden="true" />
                    </span>
                  )}
                  <span className="book__monster-kills">
                    {fmt(character.stats.monsterKills[id] ?? 0)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <section className="book__page" aria-label="Monster details" tabIndex={0}>
          <MonsterPreview modelId={monster.modelId} scale={monster.scale ?? 1} />
          <h3 className={`book__name level-tone--${levelTone(character.level, monster.level)}`}>
            {monster.name}
            {monster.elite && <span className="book__elite">Elite</span>}
          </h3>
          <p className="book__kills">
            <span className="book__kills-count">{fmt(kills)}</span>
            <span className="book__kills-label">defeated</span>
          </p>
          <dl className="book__facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <BookRewards monsterId={monsterId} kills={kills} />
        </section>
      </div>
    </Sheet>
  )
}
