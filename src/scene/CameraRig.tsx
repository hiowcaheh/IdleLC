import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { useGameStore } from '../state/gameStore.ts'
import { CAMERA_OFFSET, view } from './viewState.ts'
import { fitBossCamera, bossViewMargins } from './bossCamera.ts'

const LOOK_HEIGHT = 1.1
const ZOOM_OUT = 1.12
/** Monsters taller than this (world units) zoom the camera out, up to MAX_BIG_ZOOM. */
const TALL = 2.4
const BIG_ZOOM_PER_UNIT = 0.3
const MAX_BIG_ZOOM = 2.6
/**
 * Share of the screen height the picture moves up, so the fight sits in the space the HUD leaves
 * free (the skill bar and hunt panel cover the bottom of a phone screen).
 */
const VIEW_SHIFT_TALL = 0.13
const VIEW_SHIFT_WIDE = 0.05
/**
 * Farthest the view centres away from the hero towards the monster (metres): a monster running in
 * from a ranged hero's reach (up to 22 m) stays in sight ahead without the hero leaving the frame.
 */
const MAX_FOCUS_SHIFT = 3
const towardMonster = new Vector3()

/** Third-person camera that keeps both fighters in frame; pulls back on portrait screens. */
export function CameraRig() {
  const { camera, size } = useThree()
  const focus = useRef(new Vector3())
  const desiredFocus = useRef(new Vector3())
  const desired = useRef(new Vector3())
  const initialized = useRef(false)
  const zoom = useRef(1)
  const zoneId = useGameStore((s) => s.character?.location.zoneId)
  const lastZone = useRef(zoneId)
  const viewShift = useRef({ width: 0, height: 0, shift: 0 })
  const probe = useMemo(() => camera.clone() as PerspectiveCamera, [camera])
  const bossFrame = useRef({ id: '', distance: 0, width: 0, height: 0 })
  const bossPoints = useMemo(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], [])

  useFrame((_, delta) => {
    if (zoneId !== lastZone.current) {
      lastZone.current = zoneId
      initialized.current = false
      view.cameraSettled = false
    }
    const aspect = size.width / size.height
    const bossId = useGameStore.getState().character?.worldBoss?.active?.id
    const shift = bossId
      ? bossViewMargins(size.width, size.height).shift
      : aspect < 1
        ? VIEW_SHIFT_TALL
        : VIEW_SHIFT_WIDE
    const last = viewShift.current
    if (
      camera instanceof PerspectiveCamera &&
      (last.width !== size.width || last.height !== size.height || last.shift !== shift)
    ) {
      camera.setViewOffset(size.width, size.height, 0, size.height * shift, size.width, size.height)
      viewShift.current = { width: size.width, height: size.height, shift }
    }
    // a little further out than the arena needs, so the fighters have room around them; big
    // monsters (Treant, Balrog…) push the camera back until they fit
    const height = bossId ? view.monsterFrameHeight : view.monsterHeight
    const big = view.monsterVisible
      ? Math.min(MAX_BIG_ZOOM, 1 + Math.max(0, height - TALL) * BIG_ZOOM_PER_UNIT)
      : zoom.current
    // A despawn must preserve the framing. New sizes take effect while the loader covers travel;
    // tweening the distance after landing made the whole map visibly zoom in and out.
    if (big !== zoom.current) initialized.current = false
    zoom.current = big
    let distance =
      (aspect < 0.7 ? 1.65 : aspect < 1 ? 1.35 : aspect < 1.4 ? 1.1 : 1) * ZOOM_OUT * zoom.current

    desiredFocus.current.copy(view.player)
    if (view.monsterVisible) {
      towardMonster.subVectors(view.monster, view.player).multiplyScalar(0.5)
      if (towardMonster.lengthSq() > MAX_FOCUS_SHIFT * MAX_FOCUS_SHIFT)
        towardMonster.setLength(MAX_FOCUS_SHIFT)
      desiredFocus.current.add(towardMonster)
    }
    let lookHeight = LOOK_HEIGHT * (1 + (zoom.current - 1) * 1.6)
    let bossCameraHeight: number | undefined
    if (bossId && view.monsterVisible && camera instanceof PerspectiveCamera) {
      if (
        bossFrame.current.id !== bossId ||
        bossFrame.current.width !== size.width ||
        bossFrame.current.height !== size.height
      )
        bossFrame.current = { id: bossId, distance: 0, width: size.width, height: size.height }
      probe.copy(camera)
      bossPoints[0]!.copy(view.player)
      bossPoints[1]!.copy(view.player).y += view.playerHeight + 0.35
      bossPoints[2]!.copy(view.monster)
      bossPoints[3]!.copy(view.monster).y += view.monsterFrameHeight + 0.6
      const fit = fitBossCamera(
        probe,
        desiredFocus.current,
        CAMERA_OFFSET,
        bossPoints,
        Math.max(bossFrame.current.distance, distance),
        size.width,
        size.height,
        view.groundY,
      )
      distance = fit.distance
      bossCameraHeight = fit.cameraHeight
      if (distance > bossFrame.current.distance + 0.03) initialized.current = false
      bossFrame.current.distance = distance
      lookHeight = fit.lookHeight
    }
    desired.current.copy(CAMERA_OFFSET).multiplyScalar(distance).add(desiredFocus.current)
    if (bossCameraHeight !== undefined) desired.current.y = bossCameraHeight

    const k = initialized.current ? 1 - Math.exp(-Math.min(delta, 0.1) * 3) : 1
    initialized.current = true
    focus.current.lerp(desiredFocus.current, k)
    camera.position.lerp(desired.current, k)
    view.cameraSettled =
      camera.position.distanceToSquared(desired.current) < 0.01 &&
      focus.current.distanceToSquared(desiredFocus.current) < 0.01
    // look higher too, so a tall monster's head and name stay in view
    camera.lookAt(focus.current.x, focus.current.y + lookHeight, focus.current.z)
    // before every other frame callback: the names over the fighters (Battle.tsx) are placed with
    // this frame's camera, so they stay on the HP bars
  }, -1)

  return null
}
