import { useTexture } from '@react-three/drei'
import { use, useEffect, useMemo } from 'react'
import {
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { loadMap, mapFile, type TerrainMeta } from './lcMap.ts'
import { terrainGeometries } from './lcTerrainGeometry.ts'
import { splatFragment } from './terrainShader.ts'

// Dratan has 11 layers + 3 mask sheets; one shadow map still fits a 16-sampler mobile GPU.
const LAYERS = 11

/**
 * The standard material with its colour from the map's layers: each layer's texture, repeated over
 * the ground, laid over the ones before it by its mask.
 */
function useSplatMaterial(map: string, meta: TerrainMeta) {
  const urls = useMemo(
    () => [
      ...meta.layers.slice(0, LAYERS).map((l) => mapFile(map, l.texture)),
      ...meta.masks.map((m) => mapFile(map, m)),
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
        .replace('#include <common>', '#include <common>\nvarying vec2 vMapPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMapPos = position.xz;')
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
        .replace('#include <map_fragment>', splatFragment(layers.length, masks.length, maskOf))
    }
    // one shader per layer count
    material.customProgramCacheKey = () => `lc-terrain-${layers.length}-${masks.length}`
    return material
  }, [textures, meta])
}

/** The client's terrain of a map (map coordinates; the caller moves it under the fight). */
export function LcTerrain({ map }: { map: string }) {
  const data = use(loadMap(map))
  const geometry = useMemo(() => terrainGeometries(data), [data])
  useEffect(() => () => geometry.forEach((tile) => tile.dispose()), [geometry])
  const material = useSplatMaterial(map, data.meta)
  useEffect(() => () => material.dispose(), [material])
  return (
    <group>
      {geometry.map((tile, i) => (
        <mesh key={i} geometry={tile} material={material} receiveShadow />
      ))}
    </group>
  )
}
