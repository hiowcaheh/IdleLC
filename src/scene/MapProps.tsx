import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { use, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Box3,
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { levelShift, loadProps, mapFile, type LcMap, type MapProps } from './lcMap.ts'
import { useGameStore } from '../state/gameStore.ts'
import {
  PropGrid,
  selectProps,
  writePropInstances,
  type PropLocation,
} from './mapPropVisibility.ts'

/** The props are picked again once the ground under the hero has moved this far (metres). */
const REFRESH_STEP = 2

const DEG = Math.PI / 180

interface Placed extends PropLocation {
  matrix: Matrix4
  /** Bounds of the whole model at this placement, shared by its material parts. */
  bounds: Sphere
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
  const gltf = useGLTF(mapFile(map, 'props.glb'))

  // each model's meshes with their node transforms baked in, and its size
  const { parts, sizes, bounds } = useMemo(() => {
    const parts: Part[] = []
    const sizes: Vector3[] = []
    const bounds: Sphere[] = []
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
      bounds.push(box.getBoundingSphere(new Sphere()))
    })
    return { parts, sizes, bounds }
  }, [gltf, props])

  // where every prop stands: on the map's ground, raised or lowered with a levelled hunting ground
  const placed = useMemo<Placed[]>(() => {
    const euler = new Euler(0, 0, 0, 'YXZ')
    const rotation = new Quaternion()
    return props.instances.map(([model, x, y, z, heading, pitch, banking, ...stretch], id) => {
      const [sx, sy = sx, sz = sx] = stretch as [number, number?, number?]
      // Serious Engine angles: heading about +Y, then pitch about X, then banking about Z
      euler.set(pitch! * DEG, heading! * DEG, banking! * DEG)
      const size = sizes[model!]!
      const matrix = new Matrix4().compose(
        new Vector3(x, y! + levelShift(data, x!, z!), z),
        rotation.setFromEuler(euler),
        new Vector3(sx, sy, sz),
      )
      return {
        id,
        model: model!,
        x: x!,
        z: z!,
        radius: props.models[model!]!.low ? 0 : Math.hypot(size.x * sx, size.z * sz) / 2,
        matrix,
        bounds: bounds[model!]!.clone().applyMatrix4(matrix),
      }
    })
  }, [props, sizes, bounds, data])

  const capacity = useMemo(() => {
    const counts = props.models.map(() => 0)
    for (const p of placed) counts[p.model]!++
    return counts
  }, [props, placed])

  const grid = useMemo(() => new PropGrid(placed), [placed])
  const selection = useMemo(
    () =>
      capacity.map((count, model) => ({
        shown: [] as Placed[],
        previous: new Int32Array(count),
        count: 0,
        bounds: new Sphere(),
        parts: parts.flatMap((part, k) => (part.model === model ? [k] : [])),
      })),
    [capacity, parts],
  )
  const shown = useMemo(() => selection.map((s) => s.shown), [selection])
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const last = useRef<[number, number, number] | null>(null)

  const refresh = (cx: number, cz: number, reach: number) => {
    selectProps(grid, cx, cz, shown, reach)
    for (const s of selection) {
      const list = s.shown
      if (s.count === list.length && list.every((p, i) => s.previous[i] === p.id)) continue
      s.bounds.makeEmpty()
      for (let i = 0; i < list.length; i++) {
        s.previous[i] = list[i]!.id
        s.bounds.union(list[i]!.bounds)
      }
      s.count = list.length
      for (const k of s.parts) {
        const mesh = meshes.current[k]
        if (mesh) writePropInstances(mesh, list, s.bounds)
      }
    }
    last.current = [cx, cz, reach]
  }

  useLayoutEffect(() => {
    last.current = null
    for (const mesh of meshes.current) mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    return () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        part.material.dispose()
      })
  }, [parts])

  useFrame(({ camera }) => {
    const [cx, cz] = at.current.shown
    const before = last.current
    const reach = useGameStore.getState().character?.worldBoss?.active
      ? Math.max(26, Math.hypot(camera.position.x, camera.position.z) + 6)
      : 26
    if (
      !before ||
      Math.hypot(cx - before[0], cz - before[1]) >= REFRESH_STEP ||
      Math.abs(reach - before[2]) >= REFRESH_STEP
    )
      refresh(cx, cz, reach)
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
