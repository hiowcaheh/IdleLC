import { Vector3 } from 'three'

/**
 * Mutable, per-frame view state shared by scene components (camera, sun, bars).
 * Purely visual — game outcomes live in the GameService.
 */
export const view = {
  player: new Vector3(),
  monster: new Vector3(),
  monsterVisible: false,
  playerHeight: 1.8,
  monsterHeight: 1.8,
}

/** Camera position relative to what it looks at (scaled up on narrow screens). */
export const CAMERA_OFFSET = new Vector3(2.8, 3.1, 7.4)

/** Ground direction pointing to the right of the screen. */
export const SCREEN_RIGHT = new Vector3(CAMERA_OFFSET.z, 0, -CAMERA_OFFSET.x).normalize()

export function resetView(): void {
  view.player.set(0, 0, 0)
  view.monster.set(0, 0, 0)
  view.monsterVisible = false
}
