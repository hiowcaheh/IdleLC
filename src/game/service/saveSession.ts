import { GameError } from '../logic/errors.ts'

export type SaveSessionState = 'checking' | 'active' | 'blocked' | 'lost'
const LEASE_KEY = 'idlelc.session'
const SAVE_KEY = 'idlelc.save'
const LEASE_MS = 12_000
let started = false
let ownsSession = false
let verifyOwner: () => boolean = () => ownsSession

/** Every browser write checks ownership, including queued commands from a suspended tab. */
export function assertSaveSession(): void {
  if (started && !verifyOwner()) throw new GameError('save-session-lost')
}

/** One account writer per browser profile. Web Locks release automatically when a tab crashes. */
export function startSaveSession(changed: (state: SaveSessionState) => void): () => void {
  started = true
  ownsSession = false
  let stopped = false
  let invalidated = false
  let release: (() => void) | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let checking: ReturnType<typeof setTimeout> | undefined
  const abort = new AbortController()
  const state = (next: SaveSessionState) => {
    if (!stopped) changed(next)
  }
  const lost = () => {
    invalidated = true
    ownsSession = false
    clearInterval(timer)
    state('lost')
    release?.()
  }
  const onStorage = (event: StorageEvent) => {
    if (ownsSession && (event.key === SAVE_KEY || event.key === null || !verifyOwner())) lost()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    // A restored page must reload the account after releasing its old session on pagehide.
    if (event.persisted) location.reload()
  }
  const onVisibility = () => {
    if (!document.hidden && ownsSession && !verifyOwner()) lost()
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    ownsSession = false
    abort.abort()
    release?.()
    clearTimeout(checking)
    clearInterval(timer)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('visibilitychange', onVisibility)
  }
  const onPageHide = () => {
    stop()
    // BFCache restores the DOM and module cache; reload before any cached command can run.
    window.addEventListener('pageshow', onPageShow, { once: true })
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', onPageHide, { once: true })
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('visibilitychange', onVisibility)

  if (navigator.locks) {
    verifyOwner = () => ownsSession
    checking = setTimeout(() => state('blocked'), 150)
    void navigator.locks
      .request('idlelc-account', { signal: abort.signal }, async () => {
        if (stopped || invalidated) return
        clearTimeout(checking)
        await new Promise<void>((resolve) => {
          release = resolve
          ownsSession = true
          state('active')
        })
      })
      .catch(() => {
        if (!stopped) lost()
      })
  } else {
    // Older browsers: a renewable lease, checked again at the point of each save write.
    const owner = crypto.randomUUID()
    type Lease = { owner: string; expiresAt: number }
    const read = (): Lease | null => {
      try {
        return JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as Lease | null
      } catch {
        return null
      }
    }
    const renew = () =>
      localStorage.setItem(LEASE_KEY, JSON.stringify({ owner, expiresAt: Date.now() + LEASE_MS }))
    verifyOwner = () => {
      const lease = read()
      return ownsSession && lease?.owner === owner && lease.expiresAt > Date.now()
    }
    const claim = () => {
      if (stopped || invalidated) return
      const lease = read()
      if (lease && lease.owner !== owner && lease.expiresAt > Date.now()) {
        state('blocked')
        return
      }
      try {
        renew()
        release = () => {
          if (read()?.owner === owner) localStorage.removeItem(LEASE_KEY)
        }
        // Let simultaneous opening tabs settle before either one loads the account.
        checking = setTimeout(() => {
          if (stopped || invalidated) return
          ownsSession = read()?.owner === owner
          if (!ownsSession) {
            state('blocked')
            return
          }
          state('active')
        }, 100)
      } catch {
        // Storage-disabled browsers have isolated memory accounts, so no shared save can collide.
        ownsSession = true
        verifyOwner = () => ownsSession
        state('active')
      }
    }
    claim()
    timer = setInterval(() => {
      if (!ownsSession) {
        claim()
        return
      }
      if (read()?.owner !== owner) {
        lost()
        return
      }
      try {
        renew()
      } catch {
        lost()
      }
    }, LEASE_MS / 4)
  }
  return stop
}
