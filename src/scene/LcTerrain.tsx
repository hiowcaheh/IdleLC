import { useTexture } from '@react-three/drei'
import { use, useMemo } from 'react'
import {
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Texture,
} from 'three'
import { groundHeight, loadMap, mapBase, type LcMap, type TerrainMeta } from './lcMap.ts'

/** Half the side of the terrain drawn around the fight, and its grid step (metres). */
const REACH = 150
const STEP = 2

function useGeometry(map: LcMap, centre: [number, number]): BufferGeometry {
  return useMemo(() => {
    const segments = (REACH * 2) / STEP
    const geo = new PlaneGeometry(REACH * 2, REACH * 2, segments, segments)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position!
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(map, centre, pos.getX(i), pos.getZ(i)))
    }
    geo.computeVertexNormals()
    return geo
  }, [map, centre])
}

const LAYERS = 9

/**
 * The standard material with its colour from the map's layers: each layer's texture, repeated over
 * the ground, laid over the ones before it by its mask.
 */
function useSplatMaterial(map: string, meta: TerrainMeta, centre: [number, number]) {
  const urls = useMemo(
    () => [
      ...meta.layers.slice(0, LAYERS).map((l) => mapBase(map) + l.texture),
      ...meta.masks.map((m) => mapBase(map) + m),
    ],
    [map, meta],
  )
  const textures = useTexture(urls) as Texture[]
  return useMemo(() => {
    const layers = textures.slice(0, Math.min(LAYERS, meta.layers.length))
    const masks = textures.slice(layers.length)
    for (const t of layers) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 4
      t.needsUpdate = true
    }
    for (const t of masks) {
      t.colorSpace = NoColorSpace
      t.flipY = false
      t.needsUpdate = true
    }
    const size = (meta.width - 1) * meta.cell
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMapOrigin = { value: centre }
      shader.uniforms.uMapSize = { value: size }
      layers.forEach((t, i) => {
        shader.uniforms[`uLayer${i}`] = { value: t }
        shader.uniforms[`uTile${i}`] = { value: meta.layers[i]!.tile }
      })
      masks.forEach((t, i) => {
        shader.uniforms[`uMask${i}`] = { value: t }
      })
      // layer k ≥ 1: its mask is channel (k - 1) % 4 of sheet (k - 1) / 4
      const maskOf = (k: number) => `mask${Math.floor((k - 1) / 4)}.${'rgba'[(k - 1) % 4]}`
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vMapPos;\nuniform vec2 uMapOrigin;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvMapPos = uMapOrigin + (modelMatrix * vec4(position, 1.0)).xz;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec2 vMapPos;',
            'uniform float uMapSize;',
            ...layers.map((_, i) => `uniform sampler2D uLayer${i};\nuniform float uTile${i};`),
            ...masks.map((_, i) => `uniform sampler2D uMask${i};`),
          ].join('\n'),
        )
        .replace(
          '#include <map_fragment>',
          [
            'vec2 maskUv = vMapPos / uMapSize;',
            ...masks.map((_, i) => `vec4 mask${i} = texture2D(uMask${i}, maskUv);`),
            'vec3 ground = texture2D(uLayer0, vMapPos / uTile0).rgb;',
            ...layers
              .map((_, k) => k)
              .slice(1)
              .map(
                (k) =>
                  `ground = mix(ground, texture2D(uLayer${k}, vMapPos / uTile${k}).rgb, ${maskOf(k)});`,
              ),
            'diffuseColor.rgb *= ground;',
          ].join('\n'),
        )
    }
    // one shader per layer count
    material.customProgramCacheKey = () => `lc-terrain-${layers.length}-${masks.length}`
    return material
  }, [textures, meta, centre])
}

/** The client's terrain of a map around a hunting ground, its centre at the scene's origin. */
export function LcTerrain({ map, centre }: { map: string; centre: [number, number] }) {
  const data = use(loadMap(map))
  const geometry = useGeometry(data, centre)
  const material = useSplatMaterial(map, data.meta, centre)
  return <mesh geometry={geometry} material={material} receiveShadow />
}
