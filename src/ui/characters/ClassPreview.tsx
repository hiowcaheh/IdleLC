import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { playerModelId } from '../../game/assets/manifest.ts'
import type { ClassId } from '../../game/data/types.ts'
import { Character } from '../../scene/Character.tsx'

const realTime = () => 1

/** Turntable view of a class model (drag to rotate). */
export function ClassPreview({ classId }: { classId: ClassId }) {
  const modelId = playerModelId(classId)
  const placeholder = modelId !== `class-${classId}`

  return (
    <div className="class-preview">
      <Canvas dpr={[1, 1.5]} camera={{ fov: 32, position: [0, 1.35, 4.6] }}>
        <hemisphereLight args={['#f3dcb2', '#2a1f17', 1.4]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.8} color="#9bd0f0" />
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[1.3, 48]} />
          <meshStandardMaterial color="#3a2b1f" />
        </mesh>
        <Suspense fallback={null}>
          <Character key={modelId} modelId={modelId} timeScale={realTime} />
        </Suspense>
        <OrbitControls
          target={[0, 0.95, 0]}
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={1.4}
          minPolarAngle={1.15}
          maxPolarAngle={1.55}
        />
      </Canvas>
      {placeholder && <p className="class-preview__note">Class model coming soon</p>}
    </div>
  )
}
