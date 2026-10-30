import { lcData } from './lcSource.ts'

/** Highest level for now (owner: 100 is enough with Juno, Dratan, Merac and Egeha). */
export const MAX_LEVEL = 100

/** Placeholder curve (own values) used without the LC data: 30 × level^2.2. */
function placeholderExp(level: number): number {
  return Math.round(30 * Math.pow(level, 2.2))
}

/**
 * EXP_TABLE[level - 1] = experience needed to go from `level` to `level + 1`.
 * LC data: t_exp 1:1 (level 1 → 34, 10 → 18 748, 30 → 4 046 233).
 */
export const EXP_TABLE: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const lc = lcData?.expTable[i]
  return lc && lc > 0 ? lc : placeholderExp(i + 1)
})
