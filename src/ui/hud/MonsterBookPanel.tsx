import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { openSpotCount, zoneSpots } from '../../game/logic/spots.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Character } from '../../scene/Character.tsx'
import { ModelBoundary } from '../../scene/ModelBoundary.tsx'
import { fmt } from '../gear/format.ts'
import { Sheet } from '../Sheet.tsx'
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
 * The monster book: pick a zone, then one of its monsters (hunting order) to see how many the hero
 * has defeated. Rewards for milestones come later.
 */
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
  const facts: [string, string][] = [
    ['Level', String(monster.level)],
    ['HP', fmt(monster.stats.maxHp)],
    ['EXP', fmt(monster.exp)],
    ['Gold', fmt(monster.gold)],
    ['Spot', `${index + 1}${index >= open ? ' · locked' : ''}`],
  ]

  return (
    <Sheet title="Monster Book" titleId="book-title" onClose={onClose} className="sheet--book">
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
        <ul className="book__list" aria-label="Monsters">
          {spots.map((id, i) => {
            const m = getMonster(id)
            const locked = i >= open
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
                  <span className="book__monster-name">{m.name}</span>
                  <span className="book__monster-kills">
                    {fmt(character.stats.monsterKills[id] ?? 0)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="book__page">
          <MonsterPreview modelId={monster.modelId} scale={monster.scale ?? 1} />
          <h3 className="book__name">
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
        </div>
      </div>
    </Sheet>
  )
}
