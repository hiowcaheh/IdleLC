import { Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { ZoneDef } from '../game/data/types.ts'
import { ROCKS, TERRAIN_SIZE, TREES, smoothstep, terrainHeight, type Prop } from './terrain.ts'
import { view } from './viewState.ts'

type Env = ZoneDef['environment']

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uGlow;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 color = mix(uHorizon, uGlow, smoothstep(-0.02, 0.12, h));
    color = mix(color, uTop, smoothstep(0.08, 0.55, h));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

function SkyDome({ env }: { env: Env }) {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color(env.skyTop) },
      uGlow: { value: new Color(env.skyBottom) },
      uHorizon: { value: new Color(env.fog) },
    }),
    [env],
  )
  return (
    <mesh renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 24, 12]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        side={BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

function Sun({ shadows, ultra }: { shadows: boolean; ultra: boolean }) {
  const light = useRef<DirectionalLight>(null)
  useFrame(() => {
    const l = light.current
    if (!l) return
    l.position.set(view.player.x + 10, 16, view.player.z + 7)
    l.target.position.copy(view.player)
    l.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={light}
      color="#ffe2b8"
      intensity={2.4}
      castShadow={shadows}
      shadow-mapSize={ultra ? [2048, 2048] : [1024, 1024]}
      shadow-camera-left={-9}
      shadow-camera-right={9}
      shadow-camera-top={9}
      shadow-camera-bottom={-9}
      shadow-camera-near={1}
      shadow-camera-far={45}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  )
}

function useGroundGeometry(env: Env): BufferGeometry {
  return useMemo(() => {
    const geo = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 110, 110)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position!
    const colors = new Float32Array(pos.count * 3)
    const low = new Color(env.groundLow)
    const high = new Color(env.groundHigh)
    const dirt = new Color('#6e5a3c')
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = terrainHeight(x, z)
      pos.setY(i, y)
      const noise = (Math.sin(x * 0.9) * Math.cos(z * 0.7) + Math.sin((x + z) * 0.31)) * 0.25 + 0.5
      c.copy(low).lerp(high, Math.min(1, Math.max(0, y / 9 + noise * 0.35)))
      const r = Math.hypot(x, z)
      const trodden = (1 - smoothstep(2, 9, r)) * (0.25 + noise * 0.4)
      c.lerp(dirt, trodden)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [env])
}

function Ground({ env }: { env: Env }) {
  const geometry = useGroundGeometry(env)
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  )
}

function useInstances(
  ref: React.RefObject<InstancedMesh | null>,
  props: Prop[],
  colorFor: (i: number) => Color,
  yScale = 1,
) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    props.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(0, p.rotation, 0)
      dummy.scale.set(p.scale, p.scale * yScale, p.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, colorFor(i))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [ref, props, colorFor, yScale])
}

function Trees() {
  const trunks = useRef<InstancedMesh>(null)
  const crowns = useRef<InstancedMesh>(null)
  const geometries = useMemo(() => {
    const trunk = new CylinderGeometry(0.12, 0.2, 1.4, 5).translate(0, 0.7, 0)
    const crown = mergeGeometries([
      new ConeGeometry(1.1, 2.2, 6).translate(0, 2.0, 0),
      new ConeGeometry(0.8, 1.7, 6).translate(0, 2.9, 0),
      new ConeGeometry(0.5, 1.2, 6).translate(0, 3.6, 0),
    ])!
    return { trunk, crown }
  }, [])
  const trunkColor = useMemo(() => {
    const c = new Color('#4a3424')
    return () => c
  }, [])
  const crownColor = useMemo(() => {
    const palette = ['#2f4a26', '#3a5a2a', '#28402a', '#4a5f2c'].map((h) => new Color(h))
    return (i: number) => palette[i % palette.length]!
  }, [])
  useInstances(trunks, TREES, trunkColor)
  useInstances(crowns, TREES, crownColor)
  return (
    <>
      <instancedMesh
        ref={trunks}
        args={[geometries.trunk, undefined, TREES.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={crowns}
        args={[geometries.crown, undefined, TREES.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial flatShading roughness={0.95} />
      </instancedMesh>
    </>
  )
}

function Rocks() {
  const rocks = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new DodecahedronGeometry(1, 0).translate(0, 0.25, 0), [])
  const color = useMemo(() => {
    const palette = ['#7b766c', '#68645c', '#8a8274', '#5c5952'].map((h) => new Color(h))
    return (i: number) => palette[i % palette.length]!
  }, [])
  useInstances(rocks, ROCKS, color, 0.6)
  return (
    <instancedMesh ref={rocks} args={[geometry, undefined, ROCKS.length]} castShadow receiveShadow>
      <meshStandardMaterial flatShading roughness={1} />
    </instancedMesh>
  )
}

export function World({
  zone,
  shadows,
  ultra = false,
}: {
  zone: ZoneDef
  shadows: boolean
  /** Ultra graphics: finer shadows and motes of light drifting over the hunting ground. */
  ultra?: boolean
}) {
  const env = zone.environment
  return (
    <>
      <color attach="background" args={[env.fog]} />
      <fog attach="fog" args={[env.fog, 26, 90]} />
      <SkyDome env={env} />
      <hemisphereLight args={[env.skyTop, env.groundLow, 1.15]} />
      <Sun shadows={shadows} ultra={ultra} />
      <Ground env={env} />
      <Trees />
      <Rocks />
      {ultra && (
        <Sparkles
          count={70}
          scale={[26, 5, 26]}
          position={[0, 2.6, 0]}
          size={2.2}
          speed={0.25}
          opacity={0.7}
          color="#fff1c2"
        />
      )}
    </>
  )
}
