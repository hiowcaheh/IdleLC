import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'

const WIDTH = 0.9
const HEIGHT = 0.09

interface Props {
  /** Called every frame: where to draw, how full, and whether to show at all. */
  read(): { x: number; y: number; z: number; ratio: number; visible: boolean }
  color: string
}

/** Camera-facing HP bar above a character's head. Updated imperatively, no React re-renders. */
export function HpBar3D({ read, color }: Props) {
  const group = useRef<Group>(null)
  const fill = useRef<Mesh>(null)
  const shown = useRef(1)

  useFrame(({ camera }, delta) => {
    const g = group.current
    const f = fill.current
    if (!g || !f) return
    const { x, y, z, ratio, visible } = read()
    g.visible = visible
    if (!visible) return
    g.position.set(x, y, z)
    g.quaternion.copy(camera.quaternion)
    const target = Math.min(1, Math.max(0, ratio))
    shown.current += (target - shown.current) * Math.min(1, delta * 10)
    const r = Math.max(0.0001, shown.current)
    f.scale.x = r
    f.position.x = (-(1 - r) * WIDTH) / 2
  })

  return (
    <group ref={group}>
      <mesh renderOrder={10}>
        <planeGeometry args={[WIDTH + 0.05, HEIGHT + 0.05]} />
        <meshBasicMaterial
          color="#120d0a"
          transparent
          opacity={0.85}
          depthTest={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={fill} renderOrder={11} position-z={0.001}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial
          color={color}
          transparent
          depthTest={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
