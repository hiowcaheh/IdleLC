import { PerformanceMonitor, SoftShadows, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { getModel, modelUrl, playerModelId } from '../game/assets/manifest.ts'
import { getMonster } from '../game/data/monsters.ts'
import type { ClassId } from '../game/data/types.ts'
import { ZONES } from '../game/data/zones.ts'
import { worldBossFor } from '../game/data/worldBosses.ts'
import type { GraphicsQuality } from '../game/logic/save.ts'
import { useGameStore } from '../state/gameStore.ts'
import { Battle } from './Battle.tsx'
import { CameraRig } from './CameraRig.tsx'
import { PerfProbe } from './PerfProbe.tsx'
import { World } from './World.tsx'
import { DungeonScene } from './DungeonScene.tsx'

function preloadModel(modelId: string): void {
  useGLTF.preload(modelUrl(getModel(modelId)))
}

function maxDpr(quality: GraphicsQuality): number {
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  if (quality === 'low') return 1
  if (quality === 'high') return Math.min(device, 2)
  if (quality === 'ultra') return Math.min(device, 3)
  return Math.min(device, 1.5)
}

export function GameCanvas() {
  const quality = useGameStore((s) => s.save.settings.quality)
  const zoneId = useGameStore((s) => s.character?.location.zoneId)
  const classId = useGameStore((s) => s.character?.classId ?? 'knight')
  const zone = zoneId ? ZONES[zoneId] : undefined
  if (!zone) return null
  // Remount on quality change: shadows and antialiasing are fixed at context creation.
  return <QualityCanvas key={quality} quality={quality} zone={zone} classId={classId} />
}

function QualityCanvas({
  quality,
  zone,
  classId,
}: {
  quality: GraphicsQuality
  zone: (typeof ZONES)[string]
  classId: ClassId
}) {
  const [dpr, setDpr] = useState(() => maxDpr(quality))
  const monsterId = useGameStore(
    (s) => s.character?.worldBoss?.active?.arenaMonsterId ?? s.character?.location.monsterId ?? '',
  )
  const dungeonId = useGameStore((s) => s.dungeon?.dungeonId)
  const shadows = quality !== 'low'

  useEffect(() => {
    preloadModel(playerModelId(classId))
    for (const id of zone.monsterIds) preloadModel(getMonster(id).modelId)
    const boss = worldBossFor(zone.id)
    if (boss) preloadModel(getMonster(boss.monsterId).modelId)
  }, [zone, classId])

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
      {/* ultra: soft shadow edges that widen away from what casts them */}
      {quality === 'ultra' && <SoftShadows size={14} samples={10} focus={0.4} />}
      {dungeonId ? (
        <Suspense fallback={null}>
          <DungeonScene key={dungeonId} id={dungeonId} />
        </Suspense>
      ) : (
        <>
          <World zone={zone} monsterId={monsterId} shadows={shadows} ultra={quality === 'ultra'} />
          <Suspense fallback={null}>
            <Battle />
          </Suspense>
          <CameraRig />
        </>
      )}
      <PerfProbe />
    </Canvas>
  )
}
