/** Deterministic terrain shape and prop scattering, shared by the mesh and object placement. */
import { createRng } from '../game/logic/rng.ts'

/** Characters fight inside this radius, where the ground is perfectly flat (y = 0). */
export const ARENA_RADIUS = 11
const FLAT_RADIUS = 14
const HILLS_RADIUS = 32
/** Wide enough that the ground's edge stays in the fog while it slides during a trip. */
export const TERRAIN_SIZE = 200

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const zf = smooth(z - zi)
  const a = hash(xi, zi)
  const b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1)
  const d = hash(xi + 1, zi + 1)
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf
}

function fbm(x: number, z: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < 4; i++) {
    sum += valueNoise(x * freq, z * freq) * amp
    freq *= 2
    amp *= 0.5
  }
  return sum
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return smooth(t)
}

export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const blend = smoothstep(FLAT_RADIUS, HILLS_RADIUS, r)
  if (blend === 0) return 0
  const hills = fbm(x * 0.04 + 10, z * 0.04 - 4) * 14 - 3
  const rim = smoothstep(HILLS_RADIUS, 70, r) * 6
  return (hills + rim) * blend
}

export interface Prop {
  x: number
  y: number
  z: number
  scale: number
  rotation: number
}

function scatter(
  seed: number,
  count: number,
  minR: number,
  maxR: number,
  scale: [number, number],
): Prop[] {
  const rng = createRng(seed)
  const props: Prop[] = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const r = minR + Math.sqrt(rng()) * (maxR - minR)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    props.push({
      x,
      y: terrainHeight(x, z),
      z,
      scale: scale[0] + rng() * (scale[1] - scale[0]),
      rotation: rng() * Math.PI * 2,
    })
  }
  return props
}

export const TREES = scatter(101, 140, 17, 62, [0.8, 1.5])
export const ROCKS = scatter(202, 70, 12.5, 55, [0.3, 1.1])
