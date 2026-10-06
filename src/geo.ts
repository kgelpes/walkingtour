import type { LatLng } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from true north, 0–360. */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `meters` along the great circle from a toward b (clamped to b). */
export function towards(a: LatLng, b: LatLng, meters: number): LatLng {
  const total = distance(a, b);
  if (total === 0 || meters >= total) return { ...b };
  const t = meters / total;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function compassWord(deg: number): string {
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function formatDistance(m: number): string {
  if (m < 10) return 'here';
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Rough walking time on temple paths (steps, crowds): ~1.1 m/s. */
export function formatWalk(m: number): string {
  const min = Math.max(1, Math.round(m / 1.1 / 60));
  if (min < 60) return `${min} min walk`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Time to cover `m` at `speed` m/s (train tours), e.g. "about 4 min". */
export function formatEta(m: number, speed: number): string {
  const s = m / Math.max(speed, 1);
  if (s < 50) return 'under a minute';
  const min = Math.round(s / 60);
  if (min < 60) return `about ${min} min`;
  return `about ${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatDuration(min: number): string {
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
}
