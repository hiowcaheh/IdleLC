import { getMonster } from '../../game/data/monsters.ts'
import { worldBossFor } from '../../game/data/worldBosses.ts'
import { worldBossCharge } from '../../game/logic/worldBoss.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import './worldBoss.css'

/** Static portraits from the original client models: no extra WebGL scene in the HUD. */
export function WorldBossButton() {
  const character = useGameStore((s) => s.character)
  const hidden = useGameStore((s) => !!s.dungeon || !!s.dungeonResult || s.dungeonEntering)
  const entering = useGameStore((s) => s.worldBossEntering)
  const traveling = useGameStore((s) => s.hud.phase === 'traveling')
  const summon = useGameStore((s) => s.summonWorldBoss)
  if (!character || character.expedition || hidden) return null
  const boss = worldBossFor(character.location.zoneId)
  if (!boss) return null
  const monster = getMonster(boss.monsterId)
  const kills = worldBossCharge(character)
  const active = !!character.worldBoss?.active
  const ready = kills >= boss.killsRequired && !active
  const label = active ? 'Fighting' : entering ? 'Summoning' : ready ? 'Summon' : 'World Boss'
  const hint = active
    ? `${monster.name}: World Boss encounter in progress`
    : ready
      ? traveling
        ? 'Reach the spot to summon the World Boss'
        : `Summon ${monster.name}`
      : `${monster.name}: ${kills.toLocaleString('en-US')} / ${boss.killsRequired.toLocaleString('en-US')} idle kills. Only visible field combat counts.`
  return (
    <button
      type="button"
      className={`world-boss${ready ? ' world-boss--ready' : ''}`}
      disabled={!ready || entering || traveling}
      aria-label={hint}
      title={hint}
      onClick={() =>
        void summon().catch((e: unknown) =>
          toast(e instanceof Error ? e.message : 'Could not summon the World Boss.', 'error'),
        )
      }
    >
      <span className="world-boss__portrait">
        <img
          src={`${import.meta.env.BASE_URL}ui/world-boss/${monster.modelId}.webp?v=1`}
          alt=""
          draggable={false}
        />
      </span>
      <svg className="world-boss__charge" viewBox="0 0 90 50" aria-hidden="true">
        <path className="world-boss__track" d="M5 46 A40 40 0 0 1 85 46" />
        <path
          className="world-boss__fill"
          d="M5 46 A40 40 0 0 1 85 46"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - Math.min(1, kills / boss.killsRequired)}
        />
      </svg>
      <span className="world-boss__label">{label}</span>
      <span className="world-boss__count">
        {active
          ? 'World Boss'
          : `${kills.toLocaleString('en-US')} / ${boss.killsRequired.toLocaleString('en-US')}`}
      </span>
    </button>
  )
}
