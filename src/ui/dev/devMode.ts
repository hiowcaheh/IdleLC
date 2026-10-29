import { create } from 'zustand'

const STORAGE_KEY = 'idlelc.devTools'
const COLLAPSED_KEY = 'idlelc.devTools.collapsed'

/** True when the URL has ?dev=1 (before or inside the #hash). */
export function isDevMode(location: Location = window.location): boolean {
  const hashQuery = location.hash.includes('?')
    ? location.hash.slice(location.hash.indexOf('?'))
    : ''
  return [location.search, hashQuery].some((q) => new URLSearchParams(q).get('dev') === '1')
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function storeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // storage unavailable — the choice only lasts for this visit
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

const inBrowser = typeof window !== 'undefined'
const fromUrl = inBrowser && isDevMode()
if (fromUrl) storeFlag(STORAGE_KEY, true)

/**
 * Client-side testing tools (time speed, level, any monster). They are a browser preference,
 * not part of the save; with the Supabase backend these commands will be refused for players.
 */
export const useDevTools = create<DevToolsState>((set) => ({
  enabled: fromUrl || (inBrowser && readFlag(STORAGE_KEY)),
  open: !(inBrowser && readFlag(COLLAPSED_KEY)),
  setEnabled(enabled) {
    storeFlag(STORAGE_KEY, enabled)
    storeFlag(COLLAPSED_KEY, false)
    set({ enabled, open: true })
  },
  setOpen(open) {
    storeFlag(COLLAPSED_KEY, !open)
    set({ open })
  },
}))
