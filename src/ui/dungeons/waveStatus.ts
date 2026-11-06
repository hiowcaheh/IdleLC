import { DUNGEON_NEXT_WAVE_DELAY, DUNGEON_SECONDS } from '../../game/data/dungeons.ts'
import type { DungeonRun } from '../../game/logic/dungeons.ts'

type WaveState = Pick<
  DungeonRun,
  'wave' | 'elapsed' | 'remainingSpawns' | 'nextWaveIn' | 'ended'
> & { enemies: readonly { fighter: { hp: number } }[] }

/**
 * Read the existing simulation clock. A cleared wave always waits its full 5 s (dungeonStep no
 * longer lets the 30 s schedule cut the wait short, owner's report of 2026-11-06).
 */
export function nextDungeonWaveIn(run: WaveState): number | null {
  if (
    run.ended ||
    run.wave === 0 ||
    run.remainingSpawns > 0 ||
    run.enemies.some((e) => e.fighter.hp > 0)
  )
    return null
  const remaining = Math.max(
    0,
    Math.min(run.nextWaveIn ?? DUNGEON_NEXT_WAVE_DELAY, DUNGEON_NEXT_WAVE_DELAY),
  )
  if (remaining >= DUNGEON_SECONDS - run.elapsed) return null
  return Math.max(1, Math.ceil(remaining))
}
