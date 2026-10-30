import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { openSpotCount } from '../../game/logic/spots.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Sheet } from '../Sheet.tsx'
import { levelTone } from './levelColor.ts'

/** Lowest and highest monster level of a zone's hunting spots. */
function levelRange(monsterIds: readonly string[]): { low: number; high: number } {
  const levels = monsterIds.map((id) => getMonster(id).level)
  return { low: Math.min(...levels), high: Math.max(...levels) }
}

/**
 * World map: every hunting zone with its monster levels and how many of its spots are open; picking
 * one travels to its farthest open spot.
 */
export function WorldMapPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const selectZone = useGameStore((s) => s.selectZone)
  if (!character) return null
  const away = character.expedition !== null
  const here = character.location.zoneId
  const zones = Object.values(ZONES)
    .map((zone) => ({ zone, ...levelRange(zone.monsterIds) }))
    .sort((a, b) => a.low - b.low)

  return (
    <Sheet title="World map" titleId="world-map-title" onClose={onClose}>
      <p className="sheet__meta">
        Pick a zone to hunt its monsters and their drops. Every zone starts at its first spot; kill
        a spot's monster to open the next one. The colour shows how hard its monsters are for your
        level.
      </p>
      <ul className="world-map">
        {zones.map(({ zone, low, high }) => {
          const current = zone.id === here
          return (
            <li key={zone.id}>
              <button
                type="button"
                className={`world-map__zone${current ? ' is-current' : ''}`}
                aria-current={current ? 'location' : undefined}
                disabled={away || current}
                onClick={() => {
                  selectZone(zone.id)
                  onClose()
                }}
              >
                <span className="world-map__name">{zone.name}</span>
                <span className="world-map__meta">
                  <span className={`level-tag level-tag--${levelTone(character.level, low)}`}>
                    {low}
                  </span>
                  –
                  <span className={`level-tag level-tag--${levelTone(character.level, high)}`}>
                    {high}
                  </span>
                  <span>
                    Spots {openSpotCount(character, zone.id)} / {zone.monsterIds.length}
                  </span>
                  {current && <span className="world-map__here">You are here</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {away && <p className="sheet__meta">You can travel when you are back from the expedition.</p>}
    </Sheet>
  )
}
