/** Runs and draws the client effects that skillFx.ts starts (one layer per scene). */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Group } from 'three'
import { useGameStore } from '../../state/gameStore.ts'
import { clientFx, loadClientFx } from './data.ts'
import { ParticleMesh } from './ParticleMeshes.ts'
import { clearClientFx, fxState } from './skillFx.ts'

/**
 * The layer that runs and draws the client effects; one per scene. `pace` is the game's speed
 * (0 while paused); without it the store's time scale is used.
 */
export function ClientFxLayer({ pace }: { pace?: () => number }) {
  const scene = useThree((s) => s.scene)
  const group = useRef<Group | null>(null)
  const meshes = useRef(new Map<object, ParticleMesh>())

  useEffect(() => {
    void loadClientFx()
    // world-space particles: the layer sits at the scene's root
    const root = new Group()
    group.current = root
    scene.add(root)
    const live = meshes.current
    return () => {
      scene.remove(root)
      for (const mesh of live.values()) mesh.dispose()
      live.clear()
      clearClientFx()
    }
  }, [scene])

  useFrame((_, delta) => {
    const speed = pace ? pace() : useGameStore.getState().timeScale
    if (speed === 0) return
    const dt = Math.min(delta, 0.1) * speed
    fxState.clock += dt
    if (fxState.pending.some((p) => p.at <= fxState.clock)) {
      const due = fxState.pending.filter((p) => p.at <= fxState.clock)
      fxState.pending = fxState.pending.filter((p) => p.at > fxState.clock)
      for (const p of due) p.start()
    }
    fxState.players = fxState.players.filter((p) => p.update(dt))
    const data = clientFx()
    const root = group.current
    if (!root) return
    const alive = new Set<object>()
    for (const player of fxState.players) {
      for (const live of player.particles()) {
        alive.add(live.system)
        let mesh = meshes.current.get(live.system)
        if (!mesh) {
          const texture = data?.textures[live.texture]
          if (!texture) continue
          mesh = new ParticleMesh(live.system, texture)
          meshes.current.set(live.system, mesh)
          root.add(mesh.mesh)
        }
        mesh.update()
      }
    }
    for (const [system, mesh] of meshes.current) {
      if (alive.has(system)) continue
      root.remove(mesh.mesh)
      mesh.dispose()
      meshes.current.delete(system)
    }
  })

  return null
}
