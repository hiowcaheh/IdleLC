import { useEffect, useState } from 'react'
import { perfStats, usePerfOverlay } from './perfOverlay.ts'

const thousands = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** One line at the top of the screen: FPS, the slowest frame and what the scene draws. */
export function PerfOverlay() {
  const enabled = usePerfOverlay((s) => s.enabled)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(timer)
  }, [enabled])
  if (!enabled) return null
  const s = perfStats
  return (
    <div className="perf-overlay" aria-hidden="true">
      {`${s.fps} FPS · worst ${s.worstMs} ms\n${s.calls} draws · ${thousands(s.triangles)} tris · DPR ${s.dpr}`}
    </div>
  )
}
