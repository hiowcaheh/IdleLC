/**
 * Dungeon boxes on the ground (data/boxes.ts) as the client shows a dropped box: its 3D chest,
 * Data\Item\Common\ITEM_treasure02.smc (the drop model of the client's boxes, t_item a_file_smc),
 * lying on the floor, with a faint golden ring so it reads on a phone. The hero picks one up by
 * walking into it. Converted with:
 *   npm run convert-lc -- --client <2015 client> --smc 'Data\Item\Common\ITEM_treasure02.smc'
 *     --out <folder>   (then copied to public/models/lc/drop/)
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, type Group } from 'three'
import type { DungeonBox } from '../game/logic/dungeons.ts'

const CHEST_URL = `${import.meta.env.BASE_URL}models/lc/drop/item_treasure02.glb?v=dfa1c9bf7c8d`
/** The chest is 0.45 m wide in the client; a little larger here for phone screens. */
const CHEST_SCALE = 1.6

function Chest({ box }: { box: DungeonBox }) {
  const gltf = useGLTF(CHEST_URL)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  // each box turned its own way, as boxes fall in the client
  const yaw = useMemo(() => ((box.uid * 2.399) % (Math.PI * 2)) - Math.PI, [box.uid])
  return <primitive object={model} rotation-y={yaw} scale={CHEST_SCALE} />
}

function BoxMark({ box }: { box: DungeonBox }) {
  const ring = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.y += dt * 1.2
  })
  return (
    <group position={[box.x, 0, box.z]}>
      <group ref={ring}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.5, 0.62, 24, 1, 0, Math.PI * 1.6]} />
          <meshBasicMaterial
            color="#f4c35a"
            transparent
            opacity={0.45}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
      <Chest box={box} />
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
