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
  /** Set by the camera after its position has settled; the zone illustration waits for this. */
  cameraSettled: false,
  /** Where the hero runs while going to another hunting spot (yaw, radians). */
  travelYaw: 0,
  /**
   * Game seconds since the fight's last logic step (VisibleClock, with the dev time scale): what is
   * drawn moves on between the 50 ms steps.
   */
  interpolationSeconds: 0,
  /**
   * Height of the ground at a point of the fight (metres, the hunting ground's centre at 0): the
   * map's terrain where a zone has one (set by World), flat elsewhere.
   */
  groundY: (_x: number, _z: number): number => 0,
  /** Where the hero's elementals stand (scene/Summons.tsx), by elemental. */
  summons: new Map<number, Vector3>(),
}

/** Camera position relative to what it looks at (scaled up on narrow screens). */
export const CAMERA_OFFSET = new Vector3(2.8, 3.1, 7.4)

/** Ground direction pointing to the right of the screen. */
export const SCREEN_RIGHT = new Vector3(CAMERA_OFFSET.z, 0, -CAMERA_OFFSET.x).normalize()

/** Ground direction pointing into the screen, away from the camera. */
export const SCREEN_AHEAD = new Vector3(-CAMERA_OFFSET.x, 0, -CAMERA_OFFSET.z).normalize()

export function resetView(): void {
  view.player.set(0, 0, 0)
  view.monster.set(0, 0, 0)
  view.monsterVisible = false
  view.cameraSettled = false
  view.groundY = () => 0
}
