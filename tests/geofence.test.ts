import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Geofence } from '../src/geofence';
import { distance, towards, bearing, formatDistance } from '../src/geo';
import type { Fix, Tour } from '../src/types';

const tour: Tour = JSON.parse(readFileSync(new URL('../public/tours/kiyomizu-dera/tour.json', import.meta.url), 'utf8'));
const stop = (id: string) => tour.stops.find((s) => s.id === id)!;
let t = 0;
const fix = (p: { lat: number; lng: number }, accuracy = 10): Fix => ({ ...p, accuracy, timestamp: (t += 1000) });
/** Offset a point by metres north/east. */
const offset = (p: { lat: number; lng: number }, north: number, east: number) => ({
  lat: p.lat + north / 111_320,
  lng: p.lng + east / (111_320 * Math.cos((p.lat * Math.PI) / 180)),
});

describe('geo', () => {
  it('measures distance and bearing', () => {
    const a = { lat: 34.99545, lng: 135.7833 };
    const b = offset(a, 100, 0);
    expect(distance(a, b)).toBeCloseTo(100, 0);
    expect(bearing(a, b)).toBeCloseTo(0, 0);
    expect(bearing(a, offset(a, 0, 50))).toBeCloseTo(90, 0);
    expect(distance(a, towards(a, b, 30))).toBeCloseTo(30, 0);
  });
  it('formats distances', () => {
    expect(formatDistance(4)).toBe('here');
    expect(formatDistance(123)).toBe('125 m');
    expect(formatDistance(1530)).toBe('1.5 km');
  });
});

describe('tour data', () => {
  it('has unique ids, audio, and well-separated fences', () => {
    const ids = new Set(tour.stops.map((s) => s.id));
    expect(ids.size).toBe(tour.stops.length);
    for (const s of [tour.intro!, ...tour.stops]) {
      expect(s.audio, s.id).toMatch(/^audio\/.+\.mp3$/);
      expect(s.duration, s.id).toBeGreaterThan(20);
    }
    // No point may sit at the centre of two fences: centres must be further apart than the larger radius.
    for (const a of tour.stops)
      for (const b of tour.stops)
        if (a !== b) expect(distance(a, b), `${a.id}↔${b.id}`).toBeGreaterThan(Math.max(a.radius, b.radius) + 10);
  });
});

describe('Geofence', () => {
  it('starts with the first stop as next', () => {
    expect(new Geofence(tour.stops).next()?.id).toBe('niomon');
  });

  it('arrives after two consecutive fixes inside the fence', () => {
    const g = new Geofence(tour.stops);
    const p = offset(stop('niomon'), 15, 0);
    expect(g.update(fix(p, 20))).toBeNull();
    expect(g.update(fix(p, 20))?.stop.id).toBe('niomon');
    expect(g.next()?.id).toBe('pagoda');
    // never fires twice
    expect(g.update(fix(p, 20))).toBeNull();
    expect(g.update(fix(p, 20))).toBeNull();
  });

  it('arrives immediately on a precise fix near the centre', () => {
    const g = new Geofence(tour.stops);
    expect(g.update(fix(stop('niomon'), 5))?.stop.id).toBe('niomon');
  });

  it('ignores a single GPS jump', () => {
    const g = new Geofence(tour.stops);
    const far = offset(stop('niomon'), 200, 0);
    expect(g.update(fix(far))).toBeNull();
    expect(g.update(fix(offset(stop('niomon'), 12, 0), 20))).toBeNull();
    expect(g.update(fix(far))).toBeNull();
    expect(g.update(fix(offset(stop('niomon'), 12, 0), 20))).toBeNull();
    expect(g.done.size).toBe(0);
  });

  it('ignores inaccurate fixes', () => {
    const g = new Geofence(tour.stops);
    for (let i = 0; i < 5; i++) expect(g.update(fix(stop('niomon'), 80))).toBeNull();
    expect(g.update(fix(stop('niomon'), NaN))).toBeNull();
  });

  it('does not fire the waterfall from the stage when the shrine is still ahead', () => {
    const g = new Geofence(tour.stops);
    g.reset(['niomon', 'pagoda', 'zuigudo', 'todorokimon', 'stage']);
    // Drift from the stage toward the waterfall: 28 m from it, inside its radius+bonus but not its radius.
    const drift = towards(stop('otowa'), stop('stage'), 20);
    for (let i = 0; i < 6; i++) expect(g.update(fix(drift, 25))).toBeNull();
    // Truly at the waterfall, it fires (out of order needs 3 fixes).
    expect(g.update(fix(stop('otowa'), 15))).toBeNull();
    expect(g.update(fix(stop('otowa'), 15))).toBeNull();
    expect(g.update(fix(stop('otowa'), 15))?.stop.id).toBe('otowa');
  });

  it('treats optional stops as skippable', () => {
    const g = new Geofence(tour.stops);
    g.reset(['niomon', 'pagoda', 'zuigudo', 'todorokimon', 'stage', 'jishu', 'okunoin']);
    expect(g.next()?.id).toBe('koyasu');
    // Going straight to the waterfall is in order (koyasu is optional).
    const p = offset(stop('otowa'), 8, 0);
    g.update(fix(p, 15));
    expect(g.update(fix(p, 15))?.stop.id).toBe('otowa');
    expect(g.next()).toBeNull();
  });

  it('reports a stop passed again on the way out as missed', () => {
    const g = new Geofence(tour.stops);
    g.reset(['niomon', 'zuigudo', 'todorokimon']);
    const a = g.update(fix(stop('pagoda'), 5));
    expect(a).toEqual({ stop: stop('pagoda'), missed: true });
    expect(g.next()?.id).toBe('stage');
  });

  it('handles starting mid-route: wraps round to the unfinished stops', () => {
    const g = new Geofence(tour.stops);
    // Started the tour standing at the Koyasu Pagoda (stop 8, out of order).
    for (let i = 0; i < 3; i++) g.update(fix(stop('koyasu'), 5));
    expect(g.done.has('koyasu')).toBe(true);
    expect(g.next()?.id).toBe('otowa');
    g.update(fix(stop('otowa'), 5));
    // After the end, guidance wraps to stop 1 instead of declaring the tour complete.
    expect(g.next()?.id).toBe('niomon');
    // Walking to the stage next (out of order again) still triggers it.
    for (let i = 0; i < 3; i++) g.update(fix(stop('stage'), 5));
    expect(g.done.has('stage')).toBe(true);
    expect(g.next()?.id).toBe('jishu');
  });

  it('is complete only when every required stop is done', () => {
    const g = new Geofence(tour.stops);
    g.reset(tour.stops.filter((s) => !s.optional).map((s) => s.id));
    expect(g.next()).toBeNull();
  });

  it('picks the closest fence when two overlap', () => {
    const g = new Geofence(tour.stops);
    g.reset(['niomon', 'pagoda', 'zuigudo', 'todorokimon', 'stage', 'jishu']);
    const nearOkunoin = towards(stop('okunoin'), stop('otowa'), 8);
    g.update(fix(nearOkunoin, 25));
    expect(g.update(fix(nearOkunoin, 25))?.stop.id).toBe('okunoin');
  });

  it('walks the whole tour in order with realistic noise', () => {
    const g = new Geofence(tour.stops);
    const route = tour.stops.filter((s) => !s.optional);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const arrived: string[] = [];
    let pos = offset(route[0], 120, -120);
    for (const target of route) {
      // walk at ~1.3 m/s, one fix per second, ±6 m jitter, 8–25 m reported accuracy
      for (let i = 0; i < 400 && distance(pos, target) > 1; i++) {
        pos = towards(pos, target, 1.3);
        const noisy = offset(pos, rand() * 6, rand() * 6);
        const a = g.update(fix(noisy, 8 + Math.abs(rand()) * 17));
        if (a) arrived.push(a.stop.id);
      }
      for (let i = 0; i < 5; i++) {
        const a = g.update(fix(offset(pos, rand() * 6, rand() * 6), 15));
        if (a) arrived.push(a.stop.id);
      }
    }
    expect(arrived).toEqual(route.map((s) => s.id));
  });
});
