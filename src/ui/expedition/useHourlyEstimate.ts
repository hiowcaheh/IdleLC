import { useMemo } from 'react'
import type { ClassId } from '../../game/data/types.ts'
import { estimateHourly, type HourlyEstimate } from '../../game/logic/afk.ts'
import { createRng } from '../../game/logic/rng.ts'

/** Measured hunting rate for the preview (a fixed seed keeps the numbers steady). */
export function useHourlyEstimate(
  classId: ClassId,
  level: number,
  monsterId: string,
): HourlyEstimate {
  return useMemo(
    () => estimateHourly(classId, level, monsterId, createRng(level * 7919 + monsterId.length)),
    [classId, level, monsterId],
  )
}
