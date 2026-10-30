import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { use, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Box3,
  BufferAttribute,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { levelShift, loadProps, mapBase, type LcMap, type MapProps } from './lcMap.ts'
import { CAMERA_OFFSET } from './viewState.ts'

/** Props this far from the hunting ground (metres) are drawn; the fog hides the rest. */
const VIEW_REACH = 120
/** The props are picked again once the ground under the hero has moved this far (metres). */
const REFRESH_STEP = 2
/**
 * Tall props (trees, walls, houses) between the camera and the fight are left out: the stretch of
 * ground from a little behind the hero to past the camera, this wide around its middle line.
 */
const VIEW_BEHIND = 6
const VIEW_AHEAD = 26
const VIEW_MARGIN = 3
const TO_CAMERA = new Vector3(CAMERA_OFFSET.x, 0, CAMERA_OFFSET.z).normalize()

const DEG = Math.PI / 180

interface Placed {
  model: number
  x: number
  z: number
  /** Ground radius (metres) of a tall prop; 0 for grass and flowers. */
  radius: number
  matrix: Matrix4
}

/** One mesh of a model, its node transforms baked in: drawn as instances. */
interface Part {
  model: number
  geometry: BufferGeometry
  material: Material
}

/**
 * A copy of the geometry with float positions and normals: the GLB stores them quantized (small
 * integers the node's scale turns into metres), which can't hold the baked-in metres.
 */
function withFloatPositions(source: BufferGeometry): BufferGeometry {
  const geometry = source.clone()
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name)
    if (!attribute || attribute.array instanceof Float32Array) continue
    const values = new Float32Array(attribute.count * 3)
    for (let i = 0; i < attribute.count; i++) {
      values[i * 3] = attribute.getX(i)
      values[i * 3 + 1] = attribute.getY(i)
      values[i * 3 + 2] = attribute.getZ(i)
    }
    geometry.setAttribute(name, new BufferAttribute(values, 3))
  }
  return geometry
}

/** Is a tall prop at (dx, dz) from the hero in the way of the camera? */
function blocksView(dx: number, dz: number, radius: number): boolean {
  const along = Math.max(-VIEW_BEHIND, Math.min(VIEW_AHEAD, dx * TO_CAMERA.x + dz * TO_CAMERA.z))
  const off = Math.hypot(dx - TO_CAMERA.x * along, dz - TO_CAMERA.z * along)
  return off < radius + VIEW_MARGIN
}

/**
 * The trees, fences, walls and houses the client's world file places on a map, drawn around the
 * hunting ground (instances per model mesh). `at` is the point of the map under the hero.
 */
export function MapPropsLayer({
  map,
  data,
  at,
}: {
  map: string
  data: LcMap
  at: { readonly current: { shown: [number, number] } }
}) {
  const props = use(loadProps(map))
  if (!props) return null
  return <PropsInstances map={map} data={data} props={props} at={at} />
}

function PropsInstances({
  map,
  data,
  props,
  at,
}: {
  map: string
  data: LcMap
  props: MapProps
  at: { readonly current: { shown: [number, number] } }
}) {
  const gltf = useGLTF(`${mapBase(map)}props.glb`)

  // each model's meshes with their node transforms baked in, and its size
  const { parts, sizes } = useMemo(() => {
    const parts: Part[] = []
    const sizes: Vector3[] = []
    gltf.scene.updateMatrixWorld(true)
    props.models.forEach(({ id }, model) => {
      const holder = gltf.scene.getObjectByName(id)
      const box = new Box3()
      holder?.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        const geometry = withFloatPositions(mesh.geometry).applyMatrix4(mesh.matrixWorld)
        geometry.computeBoundingBox()
        box.union(geometry.boundingBox!)
        const material = (mesh.material as MeshStandardMaterial).clone()
        // leaves and grass are cut out of their texture and seen from both sides
        if (material.alphaTest > 0) material.side = DoubleSide
        parts.push({ model, geometry, material })
      })
      sizes.push(box.isEmpty() ? new Vector3() : box.getSize(new Vector3()))
    })
    return { parts, sizes }
  }, [gltf, props])

  // where every prop stands: on the map's ground, raised or lowered with a levelled hunting ground
  const placed = useMemo<Placed[]>(() => {
    const euler = new Euler(0, 0, 0, 'YXZ')
    const rotation = new Quaternion()
    return props.instances.map(([model, x, y, z, heading, pitch, banking, ...stretch]) => {
      const [sx, sy = sx, sz = sx] = stretch as [number, number?, number?]
      // Serious Engine angles: heading about +Y, then pitch about X, then banking about Z
      euler.set(pitch! * DEG, heading! * DEG, banking! * DEG)
      const size = sizes[model!]!
      return {
        model: model!,
        x: x!,
        z: z!,
        radius: props.models[model!]!.low ? 0 : Math.hypot(size.x * sx, size.z * sz) / 2,
        matrix: new Matrix4().compose(
          new Vector3(x, y! + levelShift(data, x!, z!), z),
          rotation.setFromEuler(euler),
          new Vector3(sx, sy, sz),
        ),
      }
    })
  }, [props, sizes, data])

  const capacity = useMemo(() => {
    const counts = props.models.map(() => 0)
    for (const p of placed) counts[p.model]!++
    return counts
  }, [props, placed])

  const meshes = useRef<(InstancedMesh | null)[]>([])
  const last = useRef<[number, number] | null>(null)

  const refresh = (cx: number, cz: number) => {
    const shown = props.models.map(() => [] as Matrix4[])
    for (const p of placed) {
      const dx = p.x - cx
      const dz = p.z - cz
      if (dx * dx + dz * dz > VIEW_REACH * VIEW_REACH) continue
      if (p.radius > 0 && blocksView(dx, dz, p.radius)) continue
      shown[p.model]!.push(p.matrix)
    }
    parts.forEach((part, k) => {
      const mesh = meshes.current[k]
      if (!mesh) return
      const list = shown[part.model]!
      list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
    last.current = [cx, cz]
  }

  useLayoutEffect(() => {
    last.current = null
    return () => parts.forEach((part) => part.geometry.dispose())
  }, [parts])

  useFrame(() => {
    const [cx, cz] = at.current.shown
    const before = last.current
    if (!before || Math.hypot(cx - before[0], cz - before[1]) >= REFRESH_STEP) refresh(cx, cz)
  })

  return (
    <>
      {parts.map((part, k) => (
        <instancedMesh
          key={k}
          ref={(mesh) => {
            meshes.current[k] = mesh
          }}
          args={[part.geometry, part.material, Math.max(1, capacity[part.model]!)]}
          count={0}
        />
      ))}
    </>
  )
}
