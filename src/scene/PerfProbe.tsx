import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { perfStats, usePerfOverlay } from '../ui/perf/perfOverlay.ts'

const WINDOW = 0.5

/**
 * Counts frames and reads the renderer's numbers of the last frame (three.js resets them before
 * each render), for the Settings "Performance info" line. Does nothing while that is off.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ time: 0, frames: 0, worst: 0 })
  useFrame((_, delta) => {
    if (!usePerfOverlay.getState().enabled) return
    const a = acc.current
    a.time += delta
    a.frames += 1
    a.worst = Math.max(a.worst, delta)
    if (a.time < WINDOW) return
    const info = gl.info
    perfStats.fps = Math.round(a.frames / a.time)
    perfStats.worstMs = Math.round(a.worst * 1000)
    perfStats.calls = info.render.calls
    perfStats.triangles = info.render.triangles
    perfStats.geometries = info.memory.geometries
    perfStats.textures = info.memory.textures
    perfStats.dpr = Math.round(gl.getPixelRatio() * 100) / 100
    a.time = 0
    a.frames = 0
    a.worst = 0
  })
  return null
}
