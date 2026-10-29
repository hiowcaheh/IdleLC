import { PerformanceMonitor, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { getModel, modelUrl, playerModelId } from '../game/assets/manifest.ts'
import { getMonster } from '../game/data/monsters.ts'
import { ZONES } from '../game/data/zones.ts'
import type { GraphicsQuality } from '../game/logic/save.ts'
import { useGameStore } from '../state/gameStore.ts'
import { Battle } from './Battle.tsx'
import { CameraRig } from './CameraRig.tsx'
import { World } from './World.tsx'

function preloadModel(modelId: string): void {
  useGLTF.preload(modelUrl(getModel(modelId)))
}

function maxDpr(quality: GraphicsQuality): number {
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  if (quality === 'low') return 1
  if (quality === 'high') return Math.min(device, 2)
  return Math.min(device, 1.5)
}

export function GameCanvas() {
  const quality = useGameStore((s) => s.save.settings.quality)
  const zoneId = useGameStore((s) => s.save.location.zoneId)
  const zone = ZONES[zoneId]!
  // Remount on quality change: shadows and antialiasing are fixed at context creation.
  return <QualityCanvas key={quality} quality={quality} zone={zone} />
}

function QualityCanvas({
  quality,
  zone,
}: {
  quality: GraphicsQuality
  zone: (typeof ZONES)[string]
}) {
  const [dpr, setDpr] = useState(() => maxDpr(quality))
  const shadows = quality !== 'low'

  useEffect(() => {
    preloadModel(playerModelId('knight'))
    for (const id of zone.monsterIds) preloadModel(getMonster(id).modelId)
  }, [zone])

  return (
    <Canvas
      className="game__canvas"
      dpr={dpr}
      shadows={shadows ? 'percentage' : false}
      camera={{ fov: 45, near: 0.1, far: 400, position: [3.2, 5.6, 8.6] }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
    >
      {quality === 'auto' && (
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(maxDpr('auto'))}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
      )}
      <World zone={zone} shadows={shadows} />
      <Suspense fallback={null}>
        <Battle />
      </Suspense>
      <CameraRig />
    </Canvas>
  )
}
