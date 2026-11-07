/**
 * Dungeon boxes on the ground (data/boxes.ts) as the client shows a dropped box: its 3D chest,
 * Data\Item\Common\ITEM_treasure02.smc (the drop model of the client's boxes, t_item a_file_smc),
 * lying on the floor. Under it a loot glow so it reads at a glance on a phone (owner's request,
 * "like Diablo"): a golden pool of light on the floor, a soft beam rising from it and sparks drifting
 * up. The hero picks a box up by walking into it. The chest was converted with:
 *   npm run convert-lc -- --client <2015 client> --smc 'Data\Item\Common\ITEM_treasure02.smc'
 *     --out <folder>   (then copied to public/models/lc/drop/)
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Sprite,
  type Texture,
} from 'three'
import type { DungeonBox } from '../game/logic/dungeons.ts'

const CHEST_URL = `${import.meta.env.BASE_URL}models/lc/drop/item_treasure02.glb?v=dfa1c9bf7c8d`
/** The chest is 0.45 m wide in the client; a little larger here for phone screens. */
const CHEST_SCALE = 1.6
const GLOW = '#ffc547'
const SPARKS = 6

let textures: { pool: Texture; beam: Texture; spark: Texture } | null = null
/** Soft gradients drawn once: the floor's light pool, the beam's fade and a spark. */
function glowTextures() {
  if (textures) return textures
  const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }
  textures = {
    pool: canvas(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(0.25, 'rgba(255,255,255,0.75)')
      r.addColorStop(0.6, 'rgba(255,255,255,0.22)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 128, 128)
    }),
    // bright at the floor, gone at the top; dimmer at the cylinder's sides
    beam: canvas(32, 128, (g) => {
      const v = g.createLinearGradient(0, 128, 0, 0)
      v.addColorStop(0, 'rgba(255,255,255,0.9)')
      v.addColorStop(0.35, 'rgba(255,255,255,0.35)')
      v.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = v
      g.fillRect(0, 0, 32, 128)
    }),
    spark: canvas(32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(0.4, 'rgba(255,255,255,0.5)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 32, 32)
    }),
  }
  return textures
}

function Chest({ box }: { box: DungeonBox }) {
  const gltf = useGLTF(CHEST_URL)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  // each box turned its own way, as boxes fall in the client
  const yaw = useMemo(() => ((box.uid * 2.399) % (Math.PI * 2)) - Math.PI, [box.uid])
  return <primitive object={model} rotation-y={yaw} scale={CHEST_SCALE} />
}

function LootGlow({ seed }: { seed: number }) {
  const { pool, beam, spark } = glowTextures()
  const poolMesh = useRef<Mesh>(null)
  const beamMesh = useRef<Mesh>(null)
  const sparks = useRef<(Sprite | null)[]>([])
  const phase = useMemo(() => (seed * 1.7) % (Math.PI * 2), [seed])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const pulse = 0.8 + Math.sin(t * 2.2) * 0.2
    if (poolMesh.current) {
      poolMesh.current.scale.setScalar(2.8 * (0.94 + pulse * 0.08))
      ;(poolMesh.current.material as MeshBasicMaterial).opacity = 0.75 * pulse
    }
    if (beamMesh.current) (beamMesh.current.material as MeshBasicMaterial).opacity = 0.5 * pulse
    sparks.current.forEach((s, i) => {
      if (!s) return
      // each spark rises from the chest over 1.6 s, drifting around it, and fades out
      const life = (t * 0.62 + i / SPARKS) % 1
      const angle = i * 2.4 + t * 0.6
      s.position.set(Math.cos(angle) * 0.38, 0.25 + life * 2.2, Math.sin(angle) * 0.38)
      ;(s.material as { opacity: number }).opacity = Math.sin(life * Math.PI) * 0.9
      s.scale.setScalar(0.14 + (1 - life) * 0.08)
    })
  })
  return (
    <group>
      <mesh ref={poolMesh} rotation-x={-Math.PI / 2} position-y={0.02} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={pool}
          color={GLOW}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={beamMesh} position-y={1.4} renderOrder={2}>
        <cylinderGeometry args={[0.28, 0.42, 2.8, 20, 1, true]} />
        <meshBasicMaterial
          map={beam}
          color={GLOW}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {Array.from({ length: SPARKS }, (_, i) => (
        <sprite
          key={i}
          ref={(s) => {
            sparks.current[i] = s
          }}
          renderOrder={3}
        >
          <spriteMaterial
            map={spark}
            color="#ffe3a0"
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  )
}

function BoxMark({ box }: { box: DungeonBox }) {
  const group = useRef<Group>(null)
  return (
    <group ref={group} position={[box.x, 0, box.z]}>
      <LootGlow seed={box.uid} />
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
