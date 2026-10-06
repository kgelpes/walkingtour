import { distance, towards } from './geo';
import type { Fix, LatLng } from './types';

export type GpsStatus = 'idle' | 'searching' | 'good' | 'weak' | 'denied' | 'unavailable' | 'demo';

export interface LocationSource {
  start(onFix: (f: Fix) => void, onStatus: (s: GpsStatus) => void): void;
  stop(): void;
}

export const WEAK_ACCURACY = 50;

export class GpsSource implements LocationSource {
  private id: number | null = null;
  private restart: number | null = null;

  start(onFix: (f: Fix) => void, onStatus: (s: GpsStatus) => void) {
    if (!('geolocation' in navigator)) return onStatus('unavailable');
    onStatus('searching');
    const watch = () => {
      this.id = navigator.geolocation.watchPosition(
        (p) => {
          const { latitude: lat, longitude: lng, accuracy, heading, speed } = p.coords;
          onStatus(accuracy > WEAK_ACCURACY ? 'weak' : 'good');
          onFix({ lat, lng, accuracy, heading, speed, timestamp: p.timestamp });
        },
        (e) => {
          if (e.code === e.PERMISSION_DENIED) return onStatus('denied');
          onStatus('searching');
          // Some browsers end the watch on POSITION_UNAVAILABLE; start a fresh one.
          if (e.code === e.POSITION_UNAVAILABLE && this.id != null) {
            navigator.geolocation.clearWatch(this.id);
            this.restart = window.setTimeout(watch, 3000);
          }
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
      );
    };
    watch();
  }

  stop() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    if (this.restart != null) clearTimeout(this.restart);
    this.id = this.restart = null;
  }
}

/** Walks a route at walking pace, emitting slightly noisy fixes once a second. */
export class DemoWalker implements LocationSource {
  pos: LatLng;
  private target = 0;
  private timer: number | null = null;
  private onFix: ((f: Fix) => void) | null = null;
  walking = true;
  speed = 4; // × walking pace
  onChange?: () => void;

  /** `pace`: metres per second at 1× (walking ≈ 1.3, Shinkansen ≈ 75). */
  constructor(private route: LatLng[], private pace = 1.3) {
    this.pos = { ...route[0] };
  }

  start(onFix: (f: Fix) => void, onStatus: (s: GpsStatus) => void) {
    this.onFix = onFix;
    onStatus('demo');
    this.emit();
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  setWalking(w: boolean) {
    this.walking = w;
    this.onChange?.();
  }

  /** Jump to a point (map tap) and continue the route from the nearest waypoint ahead. */
  teleport(p: LatLng) {
    this.pos = { ...p };
    let best = this.target;
    let bestD = Infinity;
    this.route.forEach((r, i) => {
      const d = distance(p, r);
      if (d < bestD) (bestD = d), (best = i);
    });
    this.target = Math.min(best + 1, this.route.length - 1);
    this.emit();
    this.onChange?.();
  }

  get finished() {
    return this.target >= this.route.length - 1 && distance(this.pos, this.route[this.route.length - 1]) < 1;
  }

  private tick() {
    if (this.walking && !this.finished) {
      let step = this.pace * this.speed;
      while (step > 0 && this.target < this.route.length) {
        const goal = this.route[this.target];
        const d = distance(this.pos, goal);
        if (d > step) {
          this.pos = towards(this.pos, goal, step);
          step = 0;
        } else {
          this.pos = { ...goal };
          step -= d;
          if (this.target < this.route.length - 1) this.target++;
          else break;
        }
      }
      if (this.finished) this.setWalking(false);
    }
    this.emit();
  }

  private emit() {
    const j = () => (Math.random() - 0.5) * 0.00003; // ≈ ±1.5 m
    this.onFix?.({ lat: this.pos.lat + j(), lng: this.pos.lng + j(), accuracy: 8, speed: this.walking ? this.pace * this.speed : 0, timestamp: Date.now() });
  }
}

/**
 * Compass heading (degrees from north), smoothed. iOS needs permission,
 * requested from a tap via `Compass.request()`.
 */
export class Compass {
  heading: number | null = null;
  private listeners = new Set<(h: number | null) => void>();
  private started = false;

  static async request(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        return (await DOE.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const absolute = 'ondeviceorientationabsolute' in window;
    window.addEventListener(absolute ? 'deviceorientationabsolute' : 'deviceorientation', this.handle as EventListener, true);
  }

  stop() {
    this.started = false;
    window.removeEventListener('deviceorientationabsolute', this.handle as EventListener, true);
    window.removeEventListener('deviceorientation', this.handle as EventListener, true);
  }

  subscribe(f: (h: number | null) => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private handle = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
    if (h == null || Number.isNaN(h)) return;
    const screenAngle = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
    h = (h + screenAngle + 360) % 360;
    if (this.heading == null) this.heading = h;
    else {
      const diff = ((h - this.heading + 540) % 360) - 180; // shortest way round
      this.heading = (this.heading + diff * 0.25 + 360) % 360;
    }
    this.listeners.forEach((f) => f(this.heading));
  };
}
