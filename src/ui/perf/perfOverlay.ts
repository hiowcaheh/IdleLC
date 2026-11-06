import { create } from 'zustand'

const STORAGE_KEY = 'idlelc.perfInfo'

/** What the scene measured over the last half second (scene/PerfProbe.tsx fills it in). */
export const perfStats = {
  fps: 0,
  /** The slowest frame of the window, in milliseconds. */
  worstMs: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  dpr: 1,
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface PerfOverlayState {
  /** The FPS line is shown. A browser preference, not part of the save. */
  enabled: boolean
  setEnabled(enabled: boolean): void
}

export const usePerfOverlay = create<PerfOverlayState>((set) => ({
  enabled: typeof window !== 'undefined' && readFlag(),
  setEnabled(enabled) {
    try {
      if (enabled) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage unavailable: only for this visit
    }
    set({ enabled })
  },
}))
