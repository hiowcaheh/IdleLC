import {
  DUNGEON_NEXT_WAVE_DELAY,
  DUNGEON_SECONDS,
  DUNGEON_WAVE_SECONDS,
} from '../../game/data/dungeons.ts'
import type { DungeonRun } from '../../game/logic/dungeons.ts'

type WaveState = Pick<
  DungeonRun,
  'wave' | 'elapsed' | 'remainingSpawns' | 'nextWaveIn' | 'ended'
> & { enemies: readonly { fighter: { hp: number } }[] }

/** Read the existing simulation clock, including a scheduled wave arriving before the 5 s wait. */
export function nextDungeonWaveIn(run: WaveState): number | null {
  if (
    run.ended ||
    run.wave === 0 ||
    run.remainingSpawns > 0 ||
    run.enemies.some((e) => e.fighter.hp > 0)
  )
    return null
  const scheduled =
    run.wave < 20 ? Math.max(0, run.wave * DUNGEON_WAVE_SECONDS - run.elapsed) : Infinity
  const remaining = Math.max(
    0,
    Math.min(run.nextWaveIn ?? DUNGEON_NEXT_WAVE_DELAY, DUNGEON_NEXT_WAVE_DELAY, scheduled),
  )
  if (remaining >= DUNGEON_SECONDS - run.elapsed) return null
  return Math.max(1, Math.ceil(remaining))
}
