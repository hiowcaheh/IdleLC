import { create } from 'zustand'

const STORAGE_KEY = 'idlelc.devTools'

/** True when the URL has ?dev=1 (before or inside the #hash). */
export function isDevMode(location: Location = window.location): boolean {
  const hashQuery = location.hash.includes('?')
    ? location.hash.slice(location.hash.indexOf('?'))
    : ''
  return [location.search, hashQuery].some((q) => new URLSearchParams(q).get('dev') === '1')
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function store(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable — the switch only lasts for this visit
  }
}

interface DevToolsState {
  /** Developer tools are available (Settings switch or ?dev=1). Remembered in this browser. */
  enabled: boolean
  /** The dev panel is expanded. */
  open: boolean
  setEnabled(enabled: boolean): void
  setOpen(open: boolean): void
}

const fromUrl = typeof window !== 'undefined' && isDevMode()
if (fromUrl) store(true)

/**
 * Client-side testing tools (time speed, level, any monster). They are a browser preference,
 * not part of the save; with the Supabase backend these commands will be refused for players.
 */
export const useDevTools = create<DevToolsState>((set) => ({
  enabled: fromUrl || (typeof window !== 'undefined' && readStored()),
  open: true,
  setEnabled(enabled) {
    store(enabled)
    set({ enabled, open: true })
  },
  setOpen(open) {
    set({ open })
  },
}))
