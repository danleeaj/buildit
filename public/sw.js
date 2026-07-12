const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_PREFIX = 'superflow-shell-'
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`
const PRECACHE_MANIFEST = 'precache-manifest.json'

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href
}

function isApiRequest(request, url) {
  // Browser fetch/XHR calls have no resource destination. Treat them as API
  // traffic even when a deployment uses something other than an /api path.
  return request.destination === '' || /\/api(?:\/|$)/i.test(url.pathname)
}

async function readPrecacheManifest() {
  const manifestUrl = scopedUrl(PRECACHE_MANIFEST)
  const response = await fetch(manifestUrl, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Precache manifest request failed with ${response.status}.`)
  }

  const manifestResponse = response.clone()
  const manifest = await response.json()

  if (
    manifest?.version !== BUILD_VERSION
    || !Array.isArray(manifest.assets)
    || manifest.assets.some((asset) => typeof asset !== 'string' || asset.length === 0)
  ) {
    throw new Error('Precache manifest does not match this service worker.')
  }

  const scope = new URL(self.registration.scope)
  const assets = manifest.assets.map((asset) => {
    const url = new URL(asset, scope)
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
      throw new Error(`Precache asset is outside the service-worker scope: ${asset}`)
    }
    return url.href
  })

  return { assets: [...new Set(assets)], manifestResponse, manifestUrl }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const { assets, manifestResponse, manifestUrl } = await readPrecacheManifest()
      const cache = await caches.open(CACHE_NAME)

      // Cache.addAll commits the requested shell as one batch. A failed batch keeps
      // this worker from installing, so the currently active shell stays intact.
      await cache.addAll(assets)
      await cache.put(manifestUrl, manifestResponse)
      await self.skipWaiting()
    } catch (error) {
      await caches.delete(CACHE_NAME)
      throw error
    }
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
  })())
})

async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(scopedUrl('index.html'))) || Response.error()
  }
}

async function cacheFirstPrecachedAsset(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request, { ignoreSearch: true })
  return cached || fetch(request)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API traffic, cross-origin traffic, and mutations always bypass the cache.
  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || isApiRequest(request, url)
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  event.respondWith(cacheFirstPrecachedAsset(request))
})
