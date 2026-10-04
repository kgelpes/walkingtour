import { distance } from './geo';
import type { Fix, Stop } from './types';

export interface GeofenceOptions {
  /** Fixes less accurate than this (m) never trigger an arrival. */
  maxAccuracy: number;
  /** Consecutive fixes inside a fence needed to confirm an arrival. */
  confirmFixes: number;
  /** Extra fixes required when arriving out of order (skipping a required stop). */
  outOfOrderFixes: number;
}

export const DEFAULT_OPTIONS: GeofenceOptions = {
  maxAccuracy: 60,
  confirmFixes: 2,
  outOfOrderFixes: 3,
};

export interface Arrival {
  stop: Stop;
  missed: boolean;
}

/**
 * Decides when the walker has arrived at a stop.
 *
 * - Noisy fixes are ignored; fences grow slightly with reported inaccuracy
 *   (capped) so a 25 m fix at the gate still counts as "at the gate".
 * - An arrival needs consecutive fixes in the same fence, so a single GPS jump
 *   never starts the wrong story. A very precise fix near the centre counts at once.
 * - Stops that would skip over an unfinished required stop must be reached
 *   precisely (no accuracy bonus, more fixes). This keeps adjacent fences — e.g.
 *   the stage hanging right above the waterfall — from firing early.
 * - Each stop fires at most once; `done` stops never fire again.
 * - A stop behind the walker's progress (missed earlier, passed again on the way
 *   out) is reported as `missed` so the app can offer it instead of auto-playing.
 */
export class Geofence {
  readonly done = new Set<string>();
  private candidate: { id: string; count: number } | null = null;

  constructor(
    readonly stops: Stop[],
    private opts: GeofenceOptions = DEFAULT_OPTIONS,
  ) {}

  markDone(id: string) {
    this.done.add(id);
    if (this.candidate?.id === id) this.candidate = null;
  }

  reset(done: Iterable<string> = []) {
    this.done.clear();
    for (const id of done) this.done.add(id);
    this.candidate = null;
  }

  /** The stop the walker should head to: the first unfinished stop after the furthest finished one. */
  next(): Stop | null {
    for (let i = this.furthest() + 1; i < this.stops.length; i++) {
      if (!this.done.has(this.stops[i].id)) return this.stops[i];
    }
    return null;
  }

  private furthest(): number {
    let furthest = -1;
    this.stops.forEach((s, i) => this.done.has(s.id) && (furthest = i));
    return furthest;
  }

  /** Feed a position fix. Returns the arrival it confirms, if any. */
  update(fix: Fix): Arrival | null {
    if (!(fix.accuracy <= this.opts.maxAccuracy)) return null; // also rejects NaN

    const next = this.next();
    const nextIdx = next ? this.stops.indexOf(next) : this.stops.length;
    const bonus = Math.min(fix.accuracy, 30) / 3;

    let best: { stop: Stop; ratio: number; strict: boolean; d: number } | null = null;
    this.stops.forEach((stop, i) => {
      if (this.done.has(stop.id)) return;
      const strict = this.skipsRequired(nextIdx, i);
      const threshold = stop.radius + (strict ? 0 : bonus);
      const d = distance(fix, stop);
      if (d > threshold) return;
      const ratio = d / threshold;
      if (!best || ratio < best.ratio) best = { stop, ratio, strict, d };
    });

    if (!best) {
      this.candidate = null;
      return null;
    }
    const { stop, strict, d } = best as { stop: Stop; strict: boolean; d: number };
    const count = this.candidate?.id === stop.id ? this.candidate.count + 1 : 1;
    this.candidate = { id: stop.id, count };

    const precise = !strict && fix.accuracy <= 12 && d <= stop.radius * 0.5;
    const needed = strict ? this.opts.outOfOrderFixes : this.opts.confirmFixes;
    if (precise || count >= needed) {
      const missed = this.stops.indexOf(stop) < this.furthest();
      this.markDone(stop.id);
      return { stop, missed };
    }
    return null;
  }

  /** True if arriving at stop i would jump over an unfinished, non-optional stop. */
  private skipsRequired(nextIdx: number, i: number): boolean {
    for (let j = nextIdx; j < i; j++) {
      const s = this.stops[j];
      if (!s.optional && !this.done.has(s.id)) return true;
    }
    return false;
  }
}
