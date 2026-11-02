/**
 * IdleLC service worker: after the first visit the game opens from the cache (fast, and offline).
 * - the page: network first, so a new deploy shows up on the next start when online;
 * - /assets/ (file names change with every build): cache first, retaining chunks for open tabs;
 * - models, icons, fonts: served from the cache and refreshed in the background.
 */
const CACHE_PREFIX = 'idlelc-'
const CACHE = `${CACHE_PREFIX}v2`
/** Static files: a "Vary: Origin" header (module scripts send Origin) must not cause a miss. */
const MATCH = { ignoreVary: true }

/** The page and the files it loads right away (the first visit loads them before we can cache). */
async function precacheShell() {
  const cache = await caches.open(CACHE)
  const page = await fetch('./', { cache: 'no-cache' })
  const html = await page.clone().text()
  const files = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
  await cache.put('./', page)
  await cache.addAll([...new Set(files), './manifest.webmanifest'])
  // the font stylesheet too, so offline starts keep the game's fonts when they were cached
  for (const [, href] of html.matchAll(/href="(https:\/\/fonts\.googleapis\.com[^"]+)"/g)) {
    await cache.add(href.replaceAll('&amp;', '&')).catch(() => undefined)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put('./', response.clone()).catch(() => undefined)
    return response
  } catch {
    return (await cache.match('./', MATCH)) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request, MATCH)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    // Other tabs can still import chunks from the preceding build. Activation cleans old caches.
    await cache.put(request, response.clone()).catch(() => undefined)
  }
  return response
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(event.request, MATCH)
  const refresh = fetch(event.request)
    .then(async (response) => {
      if (response.ok || response.type === 'opaque') {
        await cache.put(event.request, response.clone()).catch(() => undefined)
      }
      return response
    })
    .catch(() => cached ?? Response.error())
  // Keep the worker alive until the cache write completes, including a cache-miss request.
  event.waitUntil(refresh)
  return cached ?? refresh
}

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

/** Caches what the page loaded before this worker controlled it (sent by the page). */
async function cacheLoaded(urls) {
  const cache = await caches.open(CACHE)
  for (const href of urls) {
    const url = new URL(href)
    if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) continue
    if (url.pathname.endsWith('/sw.js') || (await cache.match(href, MATCH))) continue
    await cache.add(href).catch(() => undefined)
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'cache-loaded' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheLoaded(event.data.urls))
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request))
  } else if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else if (url.origin === self.location.origin || FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event))
  }
})
