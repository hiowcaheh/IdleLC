import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { levelTone } from './levelColor.ts'

/** Zone name, the monsters you can hunt here, and the kill count. */
export function HuntPanel() {
  const zoneId = useGameStore((s) => s.save.location.zoneId)
  const selected = useGameStore((s) => s.save.location.monsterId)
  const kills = useGameStore((s) => s.hud.kills)
  const playerLevel = useGameStore((s) => s.hud.playerLevel)
  const selectMonster = useGameStore((s) => s.selectMonster)
  const zone = ZONES[zoneId]!

  return (
    <section className="hunt" aria-label="Polowanie">
      <header className="hunt__header">
        <h2 className="hunt__zone">{zone.name}</h2>
        <p className="hunt__kills">
          Pokonane: <strong>{kills}</strong>
        </p>
      </header>
      <div className="hunt__targets" role="radiogroup" aria-label="Na kogo polujesz">
        {zone.monsterIds.map((id) => {
          const monster = getMonster(id)
          const active = id === selected
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`hunt__target${active ? ' is-active' : ''}`}
              onClick={() => selectMonster(id)}
            >
              <span className={`level-tag level-tag--${levelTone(playerLevel, monster.level)}`}>
                {monster.level}
              </span>
              <span className="hunt__target-name">{monster.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
