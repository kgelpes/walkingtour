// Offline support. Media/tile cache names must match src/offline.ts.
// VERSION and PRECACHE are filled in at build time (vite.config.ts).
const VERSION = 'dev';
const PRECACHE = ['./'];
const SHELL = `wt-shell-${VERSION}`;
const FONTS = 'wt-fonts-v1';
const MEDIA = 'wt-media-v1';
const TILES = 'wt-tiles-v2';
const KEEP = [SHELL, FONTS, MEDIA, TILES];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => {
      // First install: take over right away. Updates wait until the page says
      // so, so new code never swaps in under someone in the middle of a tour.
      if (!self.registration.active) return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wt-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'tile.openstreetmap.org') return event.respondWith(tile(req));
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com'))
    return event.respondWith(staleWhileRevalidate(req, FONTS));
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('.mp3')) return event.respondWith(audio(event, req));
  if (req.mode === 'navigate') return event.respondWith(networkFirst(req, new URL('./', self.registration.scope).href));
  if (url.pathname.endsWith('.json')) return event.respondWith(networkFirst(req));
  if (url.pathname.includes('/assets/')) return event.respondWith(cacheFirst(req, SHELL)); // hashed, immutable
  event.respondWith(staleWhileRevalidate(req, SHELL));
});

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(fallbackKey || req, { ignoreSearch: true, ignoreVary: true })) || (await caches.match(req, { ignoreSearch: true, ignoreVary: true }));
    return hit || Response.error();
  }
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  const update = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    update.catch(() => {});
    return hit;
  }
  return update;
}

async function tile(req) {
  const key = req.url;
  const cache = await caches.open(TILES);
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

/** Serves narration from cache, honouring Range requests (required by Safari). */
async function audio(event, req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (!hit) {
    // Stream from the network now, and keep a full copy for next time / offline.
    event.waitUntil(fetch(req.url).then((r) => r.ok && cache.put(req.url, r)).catch(() => {}));
    return fetch(req);
  }
  const range = req.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = size - Number(m[2]); end = size - 1; } // suffix range
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
