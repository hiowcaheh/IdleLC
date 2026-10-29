import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'

interface Props {
  /** Called every frame: the point the label is centred on, and whether to show it. */
  read(): { x: number; y: number; z: number; visible: boolean }
  className: string
  children: ReactNode
}

/**
 * HTML text or icons centred on a point in the scene (names over the fighters, curses); CSS moves them
 * above or below it. Note: in dev (StrictMode) drei's Html can drop the first label it mounts; the
 * production build shows them all.
 */
export function SceneLabel({ read, className, children }: Props) {
  const group = useRef<Group>(null)
  const box = useRef<HTMLDivElement>(null)

  useFrame(() => {
    const { x, y, z, visible } = read()
    group.current?.position.set(x, y, z)
    // drei's Html ignores hidden parents, so the label hides itself
    if (box.current) box.current.style.visibility = visible ? 'visible' : 'hidden'
  })

  return (
    <group ref={group}>
      <Html center pointerEvents="none" zIndexRange={[9, 5]}>
        <div ref={box} className={className}>
          {children}
        </div>
      </Html>
    </group>
  )
}
