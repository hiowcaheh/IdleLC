import { PerspectiveCamera, Vector3 } from 'three'

const look = new Vector3()
const projected = new Vector3()

export function bossViewMargins(width: number, height: number) {
  const top = Math.min(height * 0.3, width < 760 ? 225 : 115)
  const bottom = height - Math.min(height * 0.28, 220)
  return { top, bottom, shift: 0.5 - (top + bottom) / (2 * height) }
}

/** Raise a distant camera enough to see both fighters over the map's intervening slopes. */
export function terrainCameraHeight(
  position: Vector3,
  feet: readonly Vector3[],
  groundY: (x: number, z: number) => number,
): number {
  let height = position.y
  for (const foot of feet) {
    const reach = Math.hypot(position.x - foot.x, position.z - foot.z)
    const steps = Math.max(1, Math.ceil(reach / 2))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = foot.x + (position.x - foot.x) * t
      const z = foot.z + (position.z - foot.z) * t
      const clearance = 1.5 * Math.min(1, (t * reach) / 8)
      height = Math.max(height, foot.y + (groundY(x, z) + clearance - foot.y) / t)
    }
  }
  return height
}

/** Fit both actors and the boss's HP/name below the HUD. The caller owns the probe camera. */
export function fitBossCamera(
  camera: PerspectiveCamera,
  focus: Vector3,
  offset: Vector3,
  points: readonly Vector3[],
  minimum: number,
  width: number,
  height: number,
  groundY?: (x: number, z: number) => number,
): { distance: number; lookHeight: number; cameraHeight: number } {
  const low = Math.min(...points.map((p) => p.y))
  const high = Math.max(...points.map((p) => p.y))
  const lookHeight = Math.max(1.1, (low + high) / 2 - focus.y)
  look.copy(focus)
  look.y += lookHeight
  const { top, bottom } = bossViewMargins(width, height)
  const fits = (distance: number) => {
    camera.position.copy(offset).multiplyScalar(distance).add(focus)
    if (groundY)
      camera.position.y = terrainCameraHeight(camera.position, [points[0]!, points[2]!], groundY)
    camera.lookAt(look)
    camera.updateMatrixWorld(true)
    return points.every((p) => {
      projected.copy(p).project(camera)
      const y = ((1 - projected.y) * height) / 2
      return (
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 0.88 &&
        y >= top &&
        y <= bottom
      )
    })
  }
  let near = minimum,
    far = minimum
  for (let i = 0; i < 24 && !fits(far); i++) far *= 1.15
  if (far > near)
    for (let i = 0; i < 10; i++) {
      const mid = (near + far) / 2
      if (fits(mid)) far = mid
      else near = mid
    }
  fits(far)
  return { distance: far, lookHeight, cameraHeight: camera.position.y }
}
