/*
 * Offline shell for the wardrobe.
 *
 * Bump CACHE_NAME whenever the shell or the strategy changes. Hashed Vite
 * assets are safe to cache-first; the HTML is network-first so a deploy is
 * picked up on the next load. The 24 MB cutout WASM is deliberately not
 * cached: it would dominate storage and cutout still needs the network on
 * first use.
 */
const CACHE_NAME = 'wardrobe-shell-v1'

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheShell()
      .then(() => self.skipWaiting()),
  )
})

/**
 * The built HTML names the hashed entry script and stylesheet, so read them
 * from there instead of hard-coding them. Lazy chunks stay runtime-cached;
 * the cutout WASM is never cached.
 */
async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  await cache.addAll(SHELL)

  try {
    const response = await fetch('./index.html', { cache: 'reload' })
    const html = await response.text()
    const assets = [
      ...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+\.(?:js|css))"/g),
    ].map((match) => match[1])
    await cache.addAll(assets)
  } catch {
    // Runtime caching still fills the gap once the page is controlled.
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const scope = new URL(self.registration.scope)
  const url = new URL(request.url)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
    return
  }
  if (url.pathname.endsWith('.wasm')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put('./index.html', copy))
            .catch(() => {})
          return response
        })
        // Vite's preview server sends `Vary: Origin`, and module/style requests
        // carry an Origin header while the precached shell does not. Ignore
        // Vary here so the cached shell still matches.
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    )
    return
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response

        const copy = response.clone()
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => {})
        return response
      })
    }),
  )
})
