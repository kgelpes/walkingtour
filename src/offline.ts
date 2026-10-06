import { tourBase } from './store';
import type { Tour } from './types';

// Must match public/sw.js.
export const MEDIA_CACHE = 'wt-media-v1';

// OpenStreetMap's standard tiles: no key needed. Their usage policy forbids bulk
// prefetching, so offline maps are limited to tiles already viewed (cached by the SW).
export const TILE_URL = () => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_MAX_NATIVE_ZOOM = 19;

function audioUrls(tour: Tour): string[] {
  const base = tourBase(tour.id);
  return [tour.intro, ...tour.stops].filter((c) => c?.audio).map((c) => new URL(c!.audio!, base).href);
}

export async function offlineStatus(tour: Tour): Promise<{ ready: boolean; bytes: number }> {
  if (!('caches' in window)) return { ready: false, bytes: 0 };
  const cache = await caches.open(MEDIA_CACHE);
  const hits = await Promise.all(audioUrls(tour).map((u) => cache.match(u, { ignoreVary: true })));
  return { ready: hits.every(Boolean), bytes: 0 };
}

/** Rough size for the button label, from durations at 96 kbps. */
export function estimateMB(tour: Tour): number {
  const secs = [tour.intro, ...tour.stops].reduce((a, c) => a + (c?.duration ?? 90), 0);
  return Math.round((secs * 96_000) / 8 / 1e6 + 1);
}

/** Ask the browser not to evict saved tours under storage pressure. */
export function persistStorage() {
  void navigator.storage?.persist?.().catch(() => {});
}

/** The app itself is precached by the service worker; this saves a tour's narration. */
export async function saveOffline(tour: Tour, onProgress: (fraction: number) => void): Promise<void> {
  persistStorage();
  const jobs: [string, string][] = [
    ...audioUrls(tour).map((u) => [MEDIA_CACHE, u] as [string, string]),
  ];
  let done = 0;
  let failedAudio = 0;
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [name, url] = job;
      try {
        const cache = await caches.open(name);
        if (!(await cache.match(url, { ignoreVary: true }))) {
          const res = await fetch(url, { credentials: 'omit' });
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(url, res);
        }
      } catch {
        if (name === MEDIA_CACHE) failedAudio++;
      }
      onProgress(++done / jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failedAudio) throw new Error(`${failedAudio} audio files could not be downloaded`);
}
