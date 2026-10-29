import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_OFFSET, view } from './viewState.ts'

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

/** Third-person camera that keeps both fighters in frame; pulls back on portrait screens. */
export function CameraRig() {
  const { camera, size } = useThree()
  const focus = useRef(new Vector3())
  const desiredFocus = useRef(new Vector3())
  const desired = useRef(new Vector3())
  const initialized = useRef(false)
  const zoom = useRef(1)
  const viewShift = useRef({ width: 0, height: 0, shift: 0 })

  useFrame((_, delta) => {
    const aspect = size.width / size.height
    const shift = aspect < 1 ? VIEW_SHIFT_TALL : VIEW_SHIFT_WIDE
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
    const big = view.monsterVisible
      ? Math.min(MAX_BIG_ZOOM, 1 + Math.max(0, view.monsterHeight - TALL) * BIG_ZOOM_PER_UNIT)
      : 1
    zoom.current += (big - zoom.current) * Math.min(1, delta * 2)
    const distance =
      (aspect < 0.7 ? 1.65 : aspect < 1 ? 1.35 : aspect < 1.4 ? 1.1 : 1) * ZOOM_OUT * zoom.current

    desiredFocus.current.copy(view.player)
    if (view.monsterVisible) desiredFocus.current.lerp(view.monster, 0.5)
    desired.current.copy(CAMERA_OFFSET).multiplyScalar(distance).add(desiredFocus.current)

    const k = initialized.current ? 1 - Math.exp(-Math.min(delta, 0.1) * 3) : 1
    initialized.current = true
    focus.current.lerp(desiredFocus.current, k)
    camera.position.lerp(desired.current, k)
    // look higher too, so a tall monster's head and name stay in view
    const lookHeight = LOOK_HEIGHT * (1 + (zoom.current - 1) * 1.6)
    camera.lookAt(focus.current.x, focus.current.y + lookHeight, focus.current.z)
  })

  return null
}
