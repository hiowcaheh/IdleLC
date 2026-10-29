import { MONSTERS } from '../../game/data/monsters.ts'
import { bindLabel } from '../../scene/labelAnchors.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { EffectRow } from '../skills/EffectRow.tsx'
import { levelTone } from './levelColor.ts'

/**
 * The hero's name over its head, "Lv N Name" over the monster and the monster's curses under its HP
 * bar. The scene places them (scene/labelAnchors.ts); they stay hidden until it does.
 */
export function SceneLabels() {
  const name = useGameStore((s) => s.character?.name ?? '')
  const level = useGameStore((s) => s.character?.level ?? 1)
  const monster = MONSTERS[useGameStore((s) => s.hud.monsterId)]

  return (
    <div className="scene-labels">
      <div ref={(el) => bindLabel('player', el)} className="scene-label scene-label--player">
        <span className="scene-label__text">{name}</span>
      </div>
      <div ref={(el) => bindLabel('monster', el)} className="scene-label scene-label--monster">
        {monster && (
          <span className="scene-label__text">
            <span className={`scene-label__level level-tone--${levelTone(level, monster.level)}`}>
              Lv {monster.level}
            </span>
            {monster.name}
          </span>
        )}
      </div>
      <div ref={(el) => bindLabel('effects', el)} className="scene-label scene-label--effects">
        <EffectRow side="monster" size={16} />
      </div>
    </div>
  )
}
