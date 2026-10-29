import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Sheet } from '../Sheet.tsx'
import { levelTone } from './levelColor.ts'

/**
 * The zone's regular monster closest to the hero's level (the best hunt to start with); event
 * monsters outside the zone's typical levels are not picked.
 */
function startingMonster(monsterIds: readonly string[], level: number): string {
  const { low, high } = levelRange(monsterIds)
  const regular = monsterIds.filter((id) => {
    const l = getMonster(id).level
    return l >= low && l <= high
  })
  const pool = regular.length ? regular : [...monsterIds]
  return pool.reduce((best, id) =>
    Math.abs(getMonster(id).level - level) < Math.abs(getMonster(best).level - level) ? id : best,
  )
}

/**
 * Typical monster levels of a zone: every zone also holds a few event monsters (level 1, 20, 100),
 * so the lowest 15% and the highest 10% are left out.
 */
function levelRange(monsterIds: readonly string[]): { low: number; high: number } {
  const levels = monsterIds.map((id) => getMonster(id).level).sort((a, b) => a - b)
  const at = (share: number) =>
    levels[Math.min(levels.length - 1, Math.floor(levels.length * share))]!
  return { low: Math.max(1, at(0.15)), high: Math.max(at(0.15), at(0.9)) }
}

/** World map: every hunting zone with its monster levels; picking one travels there. */
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
        Pick a zone to hunt its monsters and their drops. The colour shows how hard its monsters are
        for your level.
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
                  selectZone(zone.id, startingMonster(zone.monsterIds, character.level))
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
                  <span>{zone.monsterIds.length} monsters</span>
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
