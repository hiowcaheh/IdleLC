import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { CAMERA_OFFSET, view } from './viewState.ts'

const LOOK_HEIGHT = 1.1

/** Third-person camera that keeps both fighters in frame; pulls back on portrait screens. */
export function CameraRig() {
  const { camera, size } = useThree()
  const focus = useRef(new Vector3())
  const desiredFocus = useRef(new Vector3())
  const desired = useRef(new Vector3())
  const initialized = useRef(false)

  useFrame((_, delta) => {
    const aspect = size.width / size.height
    const distance = aspect < 0.7 ? 1.65 : aspect < 1 ? 1.35 : aspect < 1.4 ? 1.1 : 1

    desiredFocus.current.copy(view.player)
    if (view.monsterVisible) desiredFocus.current.lerp(view.monster, 0.5)
    desired.current.copy(CAMERA_OFFSET).multiplyScalar(distance).add(desiredFocus.current)

    const k = initialized.current ? 1 - Math.exp(-Math.min(delta, 0.1) * 3) : 1
    initialized.current = true
    focus.current.lerp(desiredFocus.current, k)
    camera.position.lerp(desired.current, k)
    camera.lookAt(focus.current.x, focus.current.y + LOOK_HEIGHT, focus.current.z)
  })

  return null
}
