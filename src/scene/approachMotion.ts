import { approachTime, isStunned, type CombatState } from '../game/logic/combat.ts'
import { smoothstep } from './terrain.ts'

/** Draw between fixed simulation steps without changing movement or combat timers. */
export function approachProgress(
  combat: Pick<CombatState, 'player' | 'phaseTime'>,
  interpolationSeconds: number,
  timeScale: number,
): number {
  const blocked = isStunned(combat.player) || combat.player.effects.some((e) => e.state === 'hold')
  const elapsed = combat.phaseTime + (blocked ? 0 : interpolationSeconds * timeScale)
  return smoothstep(0, 1, elapsed / approachTime(combat))
}
