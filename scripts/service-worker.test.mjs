import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://example.test'

function worker({ entries = [], names = ['idlelc-v2'], fetch = vi.fn() } = {}) {
  const data = new Map(entries)
  const key = (request) => (typeof request === 'string' ? request : request.url)
  const cache = {
    match: vi.fn(async (request) => data.get(key(request))?.clone()),
    put: vi.fn(async (request, response) => data.set(key(request), response)),
    add: vi.fn(),
    addAll: vi.fn(),
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => names),
    delete: vi.fn(async () => true),
  }
  const listeners = new Map()
  const self = {
    location: { origin },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (name, listener) => listeners.set(name, listener),
  }
  vm.runInNewContext(source, { self, caches, fetch, URL, Response })

  const request = (pathname) => {
    const event = {
      request: new Request(`${origin}/IdleLC/${pathname}`),
      respondWith: vi.fn(),
      waitUntil: vi.fn(),
    }
    listeners.get('fetch')(event)
    return event
  }
  return { cache, caches, data, listeners, request, self }
}

describe('IdleLC service worker', () => {
  it('removes only obsolete IdleLC caches when activating', async () => {
    const app = worker({ names: ['idlelc-v1', 'other-game-v1', 'idlelc-v2', 'unrelated-cache'] })
    const event = { waitUntil: vi.fn() }
    app.listeners.get('activate')(event)
    await event.waitUntil.mock.calls[0][0]
    expect(app.caches.delete.mock.calls).toEqual([['idlelc-v1']])
    expect(app.self.clients.claim).toHaveBeenCalledOnce()
  })

  it('keeps background refresh alive until the new model finishes writing to the cache', async () => {
    const url = `${origin}/IdleLC/models/lc/fox.glb`
    const app = worker({
      entries: [[url, new Response('cached model')]],
      fetch: vi.fn(async () => new Response('updated model')),
    })
    let finishWrite
    const write = new Promise((resolve) => (finishWrite = resolve))
    app.cache.put.mockImplementationOnce(() => write)

    const event = app.request('models/lc/fox.glb')
    const response = await event.respondWith.mock.calls[0][0]
    expect(await response.text()).toBe('cached model')
    await vi.waitFor(() => expect(app.cache.put).toHaveBeenCalledOnce())
    const refresh = event.waitUntil.mock.calls[0][0]
    let completed = false
    refresh.then(() => (completed = true))
    await Promise.resolve()
    expect(completed).toBe(false)
    finishWrite()
    await refresh
    expect(completed).toBe(true)
  })

  it('serves a successful model response even if cache storage rejects its write', async () => {
    const app = worker({ fetch: vi.fn(async () => new Response('fresh model')) })
    app.cache.put.mockRejectedValueOnce(new Error('cache quota exceeded'))
    const event = app.request('models/lc/fox.glb')
    const response = await event.respondWith.mock.calls[0][0]
    expect(await response.text()).toBe('fresh model')
    await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeInstanceOf(Response)
  })

  it('retains old build chunks so an existing tab can still import them offline', async () => {
    const oldUrl = `${origin}/IdleLC/assets/index-previous.js`
    const app = worker({
      entries: [[oldUrl, new Response('old chunk')]],
      fetch: vi.fn(async () => new Response('new chunk')),
    })
    const newEvent = app.request('assets/index-current.js')
    expect(await (await newEvent.respondWith.mock.calls[0][0]).text()).toBe('new chunk')
    expect(app.data.has(oldUrl)).toBe(true)
    expect(app.data.has(`${origin}/IdleLC/assets/index-current.js`)).toBe(true)
    const oldEvent = app.request('assets/index-previous.js')
    expect(await (await oldEvent.respondWith.mock.calls[0][0]).text()).toBe('old chunk')
    expect(app.caches.delete).not.toHaveBeenCalled()
  })

  it('returns the cached model when background fetch fails', async () => {
    const url = `${origin}/IdleLC/models/lc/fox.glb`
    const app = worker({
      entries: [[url, new Response('offline model')]],
      fetch: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    const event = app.request('models/lc/fox.glb')
    expect(await (await event.respondWith.mock.calls[0][0]).text()).toBe('offline model')
    await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeInstanceOf(Response)
    expect(app.cache.put).not.toHaveBeenCalled()
  })
})
