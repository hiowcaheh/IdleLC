import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { fitBossCamera, bossViewMargins, terrainCameraHeight } from './bossCamera.ts'
import { CAMERA_OFFSET } from './viewState.ts'

describe('large boss framing', () => {
  it('keeps the sightline above intervening terrain without moving either fighter', () => {
    const camera = new Vector3(0, 12, 60)
    const feet = [new Vector3(), new Vector3(3, 0, -4)]
    const ground = (_x: number, z: number) => (z >= 24 && z <= 36 ? 20 : 0)
    const raised = terrainCameraHeight(camera, feet, ground)
    expect(raised).toBeGreaterThan(50)
    expect(camera.y).toBe(12)
    for (const foot of feet)
      for (let i = 1; i <= 100; i++) {
        const t = i / 100
        const x = foot.x + (camera.x - foot.x) * t
        const z = foot.z + (camera.z - foot.z) * t
        expect(foot.y + (raised - foot.y) * t).toBeGreaterThanOrEqual(ground(x, z))
      }
    expect(terrainCameraHeight(new Vector3(0, 30, 60), feet, () => 0)).toBe(30)

    const probe = new PerspectiveCamera(45, 320 / 740, 0.1, 400)
    probe.setViewOffset(320, 740, 0, 740 * bossViewMargins(320, 740).shift, 320, 740)
    const offset = new Vector3(2.8, 3.1, 7.4)
    const points = [feet[0]!, new Vector3(0, 2, 0), feet[1]!, new Vector3(3, 24, -4)]
    const fit = fitBossCamera(probe, new Vector3(), offset, points, 2, 320, 740, ground)
    expect(fit.cameraHeight).toBeGreaterThan(offset.y * fit.distance)
    for (const point of points) {
      const ndc = point.clone().project(probe)
      const y = ((1 - ndc.y) * 740) / 2
      expect(y).toBeGreaterThanOrEqual(bossViewMargins(320, 740).top - 0.01)
      expect(y).toBeLessThanOrEqual(bossViewMargins(320, 740).bottom + 0.01)
    }
  })

  it('keeps a flying head, HP/name margin and the hero in the field on phones and desktop', () => {
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [1280, 900],
    ]) {
      for (const top of [8, 16, 24]) {
        const camera = new PerspectiveCamera(45, width! / height!, 0.1, 400)
        camera.setViewOffset(
          width!,
          height!,
          0,
          height! * bossViewMargins(width!, height!).shift,
          width!,
          height!,
        )
        const focus = new Vector3(1, 0, -1)
        const points = [
          new Vector3(),
          new Vector3(0, 2, 0),
          new Vector3(4, 1, -5),
          new Vector3(4, top, -5),
        ]
        const fit = fitBossCamera(camera, focus, CAMERA_OFFSET, points, 2, width!, height!)
        camera.position.copy(CAMERA_OFFSET).multiplyScalar(fit.distance).add(focus)
        camera.lookAt(focus.x, focus.y + fit.lookHeight, focus.z)
        camera.updateMatrixWorld(true)
        for (const point of points) {
          const ndc = point.clone().project(camera)
          const y = ((1 - ndc.y) * height!) / 2
          expect(Math.abs(ndc.x)).toBeLessThan(0.88)
          expect(y).toBeGreaterThanOrEqual(Math.min(height! * 0.3, width! < 760 ? 225 : 115) - 0.01)
          expect(y).toBeLessThanOrEqual(height! - Math.min(height! * 0.28, 220) + 0.01)
        }
        expect(fit.distance).toBeGreaterThanOrEqual(2)
        expect(fit.distance).toBeLessThan(13)
        expect(points[3]!.y).toBe(top)
      }
    }
  })
})
