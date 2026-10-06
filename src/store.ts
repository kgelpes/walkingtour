import type { MusicMode } from './audio';
import type { Tour, TourSummary } from './types';

export interface Progress {
  /** Stops arrived at, skipped, or listened to in full — never auto-played again. */
  done: string[];
  /** Stops whose narration was listened to in full. */
  heard: string[];
  skipped: string[];
  introHeard: boolean;
  /** Last clip and position, to resume after a reload. */
  last: { id: string; time: number } | null;
  startedAt: number | null;
}

const empty = (): Progress => ({ done: [], heard: [], skipped: [], introHeard: false, last: null, startedAt: null });

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode / quota: progress just won't persist */ }
}

export const progress = {
  get: (tourId: string): Progress => read(`wt:progress:${tourId}`, empty()),
  set: (tourId: string, p: Progress) => write(`wt:progress:${tourId}`, p),
  clear: (tourId: string) => write(`wt:progress:${tourId}`, empty()),
};

export interface Settings {
  autoplay: boolean;
  music: MusicMode;
  /** Story volume, 0–2 (above 1 is a boost). */
  volume: number;
}

export const settings = {
  get: (): Settings => read('wt:settings', { autoplay: true, music: 'lower', volume: 1 }),
  set: (s: Settings) => write('wt:settings', s),
};

const cache = new Map<string, Promise<any>>();
function json<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    }).catch((e) => {
      cache.delete(url);
      throw e;
    }));
  }
  return cache.get(url)!;
}

export const tourBase = (id: string) => new URL(`tours/${id}/`, document.baseURI).href;
export const loadIndex = () => json<{ tours: TourSummary[] }>(new URL('tours/index.json', document.baseURI).href).then((d) => d.tours);
export const loadTour = (id: string) => json<Tour>(`${tourBase(id)}tour.json`);
