import type { CombatEvent } from '../game/logic/combat.ts'
import type { ItemStack } from '../game/logic/loot.ts'

/** Events the 3D scene reacts to: combat events, rewards paid out and a full reset (new save). */
export type ViewEvent =
  | CombatEvent
  | { type: 'reset' }
  | { type: 'reward'; exp: number; gold: number; levelsGained: number; drops: ItemStack[] }
  | { type: 'levelUp'; level: number }

type Listener = (event: ViewEvent) => void

const listeners = new Set<Listener>()

export const combatEvents = {
  emit(events: readonly ViewEvent[]): void {
    for (const event of events) for (const listener of listeners) listener(event)
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
