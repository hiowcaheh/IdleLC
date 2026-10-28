import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimationMixer, Color, LoopRepeat, type Mesh, type MeshStandardMaterial } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { getModel, listModels, modelUrl } from '../../game/assets/manifest.ts'

function PreviewModel({
  modelId,
  clip,
  speed,
  onClips,
}: {
  modelId: string
  clip: string | null
  speed: number
  onClips(names: string[]): void
}) {
  const model = getModel(modelId)
  const gltf = useGLTF(modelUrl(model))
  const object = useMemo(() => {
    const o = cloneSkinned(gltf.scene)
    o.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      const m = (mesh.material as MeshStandardMaterial).clone()
      const tint = model.tint[m.name]
      if (tint) m.color = new Color(tint)
      mesh.material = m
    })
    return o
  }, [gltf.scene, model])
  const mixer = useMemo(() => new AnimationMixer(object), [object])

  useEffect(() => onClips(gltf.animations.map((a) => a.name)), [gltf.animations, onClips])

  useEffect(() => {
    mixer.stopAllAction()
    const found = gltf.animations.find((a) => a.name === clip)
    if (found) mixer.clipAction(found).setLoop(LoopRepeat, Infinity).reset().play()
  }, [clip, gltf.animations, mixer])

  useFrame((_, delta) => mixer.update(delta * speed))

  return <primitive object={object} scale={model.scale} />
}

/** Dev tool: inspect every model from the manifest and play any of its clips. */
export function ModelViewer() {
  const models = listModels()
  const [modelId, setModelId] = useState(models[0]!.id)
  const [clips, setClips] = useState<string[]>([])
  const [clip, setClip] = useState<string | null>(null)
  const [speed, setSpeed] = useState(1)
  const model = getModel(modelId)
  const mapped = new Map(Object.entries(model.animations).map(([logical, name]) => [name, logical]))

  return (
    <div className="viewer">
      <Canvas
        className="viewer__canvas"
        dpr={[1, 1.5]}
        shadows="percentage"
        camera={{ fov: 40, position: [2.2, 1.8, 3.4] }}
      >
        <color attach="background" args={['#1d1820']} />
        <hemisphereLight args={['#c8d4ff', '#3a2c20', 1.2]} />
        <directionalLight position={[3, 5, 2]} intensity={2.2} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[3, 48]} />
          <meshStandardMaterial color="#3a332c" />
        </mesh>
        <Suspense fallback={null}>
          <PreviewModel
            key={modelId}
            modelId={modelId}
            clip={clip}
            speed={speed}
            onClips={setClips}
          />
        </Suspense>
        <OrbitControls target={[0, 0.8, 0]} />
      </Canvas>

      <aside className="viewer__panel">
        <header className="viewer__header">
          <h1 className="viewer__title">Modele i animacje</h1>
          <Link className="dev-panel__link" to="/">
            Wróć do gry
          </Link>
        </header>

        <label className="viewer__field">
          Model
          <select
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value)
              setClip(null)
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} — {m.file}
              </option>
            ))}
          </select>
        </label>

        <p className="viewer__meta">
          Skala {model.scale}, moment ciosu {model.attackImpact} s
        </p>

        <div className="viewer__clips">
          {clips.map((name) => (
            <button
              key={name}
              type="button"
              className={`dev-chip${clip === name ? ' is-active' : ''}`}
              onClick={() => setClip(name)}
            >
              {name}
              {mapped.has(name) && <em className="viewer__logical">{mapped.get(name)}</em>}
            </button>
          ))}
        </div>

        <div className="dev-panel__row" role="group" aria-label="Prędkość">
          {[0.25, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              type="button"
              className={`dev-chip${speed === s ? ' is-active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              ×{s}
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
