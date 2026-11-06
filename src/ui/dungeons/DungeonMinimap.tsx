import { DUNGEON_RADIUS } from '../../game/data/dungeons.ts'
import type { DungeonRun } from '../../game/logic/dungeons.ts'

/** North-up arena coordinates match the joystick: right = +x, down = +z. */
export function DungeonMinimap({ run }: { run: DungeonRun }) {
  return (
    <figure className="dungeon-minimap" aria-label="Dungeon minimap">
      <svg
        viewBox="-29 -29 58 58"
        role="img"
        aria-label="Your position, living monsters and uncollected crystals"
      >
        <defs>
          <pattern id="dungeon-map-floor" width="14" height="14" patternUnits="userSpaceOnUse">
            <image
              href={`${import.meta.env.BASE_URL}dungeons/${run.dungeonId}/floor.webp`}
              width="14"
              height="14"
            />
          </pattern>
        </defs>
        <circle r={DUNGEON_RADIUS} fill="url(#dungeon-map-floor)" />
        <circle className="dungeon-minimap__boundary" r={DUNGEON_RADIUS - 1.5} />
        {run.crystals.map((c) => (
          <path
            key={c.uid}
            className="dungeon-minimap__crystal"
            d={`M${c.x} ${c.z - 0.8}l0.8 0.8 -0.8 0.8 -0.8 -0.8Z`}
          />
        ))}
        {run.enemies
          .filter((e) => e.fighter.hp > 0)
          .map((e) => (
            <circle key={e.uid} className="dungeon-minimap__enemy" cx={e.x} cy={e.z} r="1" />
          ))}
        <circle
          className="dungeon-minimap__player-ring"
          cx={run.position.x}
          cy={run.position.z}
          r="2"
        />
        <path
          className="dungeon-minimap__player"
          d="M0 -2 L1.4 1.5 L0 0.7 L-1.4 1.5Z"
          transform={`translate(${run.position.x} ${run.position.z}) rotate(${180 - (run.facing * 180) / Math.PI})`}
        />
      </svg>
      <figcaption>
        <span className="dungeon-map-key dungeon-map-key--player">You</span>
        <span className="dungeon-map-key dungeon-map-key--enemy">Mobs</span>
        <span className="dungeon-map-key dungeon-map-key--crystal">Crystals</span>
      </figcaption>
    </figure>
  )
}
