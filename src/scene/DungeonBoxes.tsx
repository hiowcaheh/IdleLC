/**
 * Dungeon boxes on the ground (data/boxes.ts): the box's client icon floating above a golden
 * ring, so it reads at a glance on a phone. The hero picks one up by walking into it.
 */
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, SRGBColorSpace, type Group, type Sprite } from 'three'
import { itemIcon } from '../game/data/items.ts'
import type { DungeonBox } from '../game/logic/dungeons.ts'

function BoxIcon({ itemId }: { itemId: number }) {
  const icon = itemIcon(itemId)!
  const sheet = useTexture(icon.url)
  const map = useMemo(() => {
    const t = sheet.clone()
    t.colorSpace = SRGBColorSpace
    t.repeat.set(icon.size / icon.sheetWidth, icon.size / icon.sheetHeight)
    t.offset.set(icon.x / icon.sheetWidth, 1 - (icon.y + icon.size) / icon.sheetHeight)
    t.needsUpdate = true
    return t
  }, [sheet, icon.size, icon.sheetWidth, icon.sheetHeight, icon.x, icon.y])
  const sprite = useRef<Sprite>(null)
  useFrame(({ clock }) => {
    if (sprite.current) sprite.current.position.y = 0.75 + Math.sin(clock.elapsedTime * 2.4) * 0.08
  })
  return (
    <sprite ref={sprite} scale={[0.85, 0.85, 1]} position={[0, 0.75, 0]}>
      <spriteMaterial map={map} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

function BoxMark({ box }: { box: DungeonBox }) {
  const ring = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.y += dt * 1.5
  })
  return (
    <group position={[box.x, 0, box.z]}>
      <group ref={ring}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
          <ringGeometry args={[0.42, 0.62, 24, 1, 0, Math.PI * 1.6]} />
          <meshBasicMaterial
            color="#f4c35a"
            transparent
            opacity={0.75}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
      {itemIcon(box.itemId) && <BoxIcon itemId={box.itemId} />}
    </group>
  )
}

export function DungeonBoxes({ boxes }: { boxes: readonly DungeonBox[] }) {
  return (
    <>
      {boxes.map((box) => (
        <BoxMark key={box.uid} box={box} />
      ))}
    </>
  )
}
