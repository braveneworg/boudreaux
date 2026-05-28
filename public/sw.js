/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written service worker for the Fake Four Inc. PWA.
 *
 * Caching strategy (deliberately conservative — only static, immutable assets
 * are cached so dynamic data is never served stale):
 *   - Navigations: network-first, falling back to the last cached HTML for the
 *     route, then to the precached /offline page.
 *   - Hashed build assets (/_next/static, brand icons, manifest) and the same
 *     assets served from the production CDN: cache-first. These URLs are
 *     content-addressed, so a cache hit is always fresh.
 *   - Everything else (APIs, media streams, auth): network passthrough, no
 *     caching.
 *
 * Bump CACHE_VERSION to invalidate all caches on the next activation.
 */

const CACHE_VERSION = 'v1';
const PRECACHE = `ffi-precache-${CACHE_VERSION}`;
const RUNTIME = `ffi-runtime-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline';

// The production build serves /_next/static assets from this CDN host.
const CDN_HOST = 'cdn.fakefourrecords.com';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== PRECACHE && key !== RUNTIME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isCacheableStaticAsset(url) {
  const isNextStatic = url.pathname.startsWith('/_next/static/');
  const isBrandAsset = url.pathname.startsWith('/icons/');
  const isCdnStatic = url.hostname === CDN_HOST && url.pathname.includes('/_next/static/');
  return isNextStatic || isBrandAsset || isCdnStatic;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  // Cache successful or opaque (cross-origin CDN) responses; opaque responses
  // have status 0 but are still usable for replaying static assets offline.
  if (response.ok || response.type === 'opaque') {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
