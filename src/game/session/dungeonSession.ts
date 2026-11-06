import type { CombatState } from '../logic/combat.ts'
import type { DungeonEvent, DungeonPoint, DungeonRun } from '../logic/dungeons.ts'

/** Hot scene state, independent of React's HUD refresh rate. */
export const dungeonSession = {
  state: null as DungeonRun | null,
  previous: null as DungeonRun | null,
  updatedAt: 0,
  interval: 0.05,
  input: { x: 0, z: 0 } as DungeonPoint,
  paused: false,
  menuOpen: false,
  ready: false,
  listeners: new Set<(events: readonly DungeonEvent[]) => void>(),
  set(run: DungeonRun | null, events: readonly DungeonEvent[] = []) {
    const now = performance.now()
    this.interval = Math.min(0.25, Math.max(0.05, (now - this.updatedAt) / 1000))
    this.updatedAt = now
    this.previous = this.state
    this.state = run
    for (const listener of this.listeners) listener(events)
  },
  subscribe(listener: (events: readonly DungeonEvent[]) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
  combat(): CombatState | null {
    const run = this.state
    if (!run) return null
    const enemy = run.enemies.find((e) => e.uid === run.targetUid)
    return {
      phase: 'fighting',
      phaseTime: run.elapsed,
      player: run.player,
      monster: enemy?.fighter ?? run.player,
      monsterId: enemy?.monsterId ?? '',
      kills: run.score,
      deaths: 0,
    }
  },
  reset() {
    this.set(null)
    this.previous = null
    this.input = { x: 0, z: 0 }
    this.paused = false
    this.menuOpen = false
    this.ready = false
  },
}
