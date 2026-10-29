import { getMonster } from '../../game/data/monsters.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Bar } from './Bar.tsx'
import { levelTone } from './levelColor.ts'

export function TargetFrame() {
  const phase = useGameStore((s) => s.hud.phase)
  const monsterId = useGameStore((s) => s.hud.monsterId)
  const hp = useGameStore((s) => s.hud.monsterHp)
  const maxHp = useGameStore((s) => s.hud.monsterMaxHp)
  const playerLevel = useGameStore((s) => s.character?.level ?? 1)

  const present = phase === 'approach' || phase === 'fighting' || phase === 'victory'
  if (!present) return null
  const monster = getMonster(monsterId)

  return (
    <section className="unit-frame unit-frame--target" aria-label="Target">
      <div className="unit-frame__body">
        <div className="unit-frame__name">
          <span className={`level-tag level-tag--${levelTone(playerLevel, monster.level)}`}>
            {monster.level}
          </span>
          {monster.name}
        </div>
        <Bar
          value={phase === 'victory' ? 0 : hp}
          max={maxHp}
          variant="enemy"
          label="Target health"
        />
      </div>
    </section>
  )
}
