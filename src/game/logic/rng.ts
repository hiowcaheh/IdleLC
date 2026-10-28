/** Deterministic pseudo-random generator returning floats in [0, 1). */
export type Rng = () => number

/** mulberry32 — tiny, fast, good enough for gameplay rolls. Same seed => same sequence. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer in [min, max] (inclusive). */
export function rollInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** True with the given probability (0..1). */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability
}
