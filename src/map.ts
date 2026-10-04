import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_MAX_NATIVE_ZOOM, TILE_URL } from './offline';
import type { Fix, LatLng, Stop } from './types';

export type StopStatus = 'todo' | 'next' | 'done' | 'skipped' | 'playing';

/** Leaflet wrapper: stops, route, user dot, follow mode. */
export class TourMap {
  readonly map: L.Map;
  private markers = new Map<string, L.Marker>();
  private status = new Map<string, StopStatus>();
  private user: L.Marker | null = null;
  private accuracy: L.Circle | null = null;
  private following = false;
  private programmatic = 0;
  onFollowChange?: (following: boolean) => void;
  onStopTap?: (stop: Stop) => void;
  onMapTap?: (p: LatLng) => void;

  constructor(el: HTMLElement, private stops: Stop[], private bottomInset: () => number) {
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 20,
      minZoom: 13,
      zoomSnap: 0.25,
      tapTolerance: 20,
    });
    this.map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL(), {
      subdomains: 'abcd',
      maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
      maxZoom: 20,
      detectRetina: false,
      r: L.Browser.retina ? '@2x' : '',
      crossOrigin: true,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    } as L.TileLayerOptions).addTo(this.map);

    const pts = stops.map((s) => [s.lat, s.lng] as L.LatLngTuple);
    const required = stops.filter((s) => !s.optional).map((s) => [s.lat, s.lng] as L.LatLngTuple);
    L.polyline(required, { className: 'route-line', interactive: false }).addTo(this.map);
    stops.forEach((s, i) => {
      if (!s.optional) return;
      const prev = stops[i - 1];
      if (prev) L.polyline([[prev.lat, prev.lng], [s.lat, s.lng]], { className: 'route-line optional', interactive: false }).addTo(this.map);
    });

    stops.forEach((s, i) => {
      const m = L.marker([s.lat, s.lng], { icon: this.icon(i, 'todo', s), keyboard: true, title: s.title, riseOnHover: true })
        .addTo(this.map)
        .on('click', () => this.onStopTap?.(s));
      this.markers.set(s.id, m);
    });

    this.map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [24, 80], paddingBottomRight: [24, bottomInset() + 24], maxZoom: 18 });

    const stopFollow = () => {
      if (this.programmatic === 0 && this.following) this.setFollowing(false);
    };
    this.map.on('dragstart', stopFollow);
    this.map.on('zoomstart', () => { if (this.programmatic === 0 && !this.following) return; });
    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapTap?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
  }

  private icon(i: number, status: StopStatus, s: Stop) {
    const label = status === 'done' ? '✓' : String(i + 1);
    return L.divIcon({
      className: '',
      html: `<div class="pin pin-${status}${s.optional ? ' pin-optional' : ''}"><span>${label}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  setStatus(id: string, status: StopStatus) {
    if (this.status.get(id) === status) return;
    this.status.set(id, status);
    const i = this.stops.findIndex((s) => s.id === id);
    const m = this.markers.get(id);
    if (m) {
      m.setIcon(this.icon(i, status, this.stops[i]));
      m.setZIndexOffset(status === 'next' || status === 'playing' ? 1000 : 0);
    }
  }

  setUser(fix: Fix | null) {
    if (!fix) {
      this.user?.remove();
      this.accuracy?.remove();
      this.user = this.accuracy = null;
      return;
    }
    const ll: L.LatLngTuple = [fix.lat, fix.lng];
    if (!this.user) {
      this.accuracy = L.circle(ll, { radius: fix.accuracy, className: 'accuracy', interactive: false }).addTo(this.map);
      this.user = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me"><div class="me-cone"></div><div class="me-dot"></div></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(this.map);
    } else {
      this.user.setLatLng(ll);
      this.accuracy!.setLatLng(ll).setRadius(fix.accuracy);
    }
    if (this.following) this.pan(ll);
  }

  setHeading(h: number | null) {
    const el = this.user?.getElement()?.querySelector<HTMLElement>('.me');
    if (!el) return;
    el.classList.toggle('has-heading', h != null);
    if (h != null) el.style.setProperty('--heading', `${h}deg`);
  }

  setFollowing(f: boolean) {
    this.following = f;
    this.onFollowChange?.(f);
    if (f && this.user) this.pan(this.user.getLatLng(), Math.max(this.map.getZoom(), 18));
  }

  get isFollowing() {
    return this.following;
  }

  /** Centre a point in the visible area above the bottom sheet. */
  private pan(ll: L.LatLngExpression, zoom = this.map.getZoom()) {
    this.programmatic++;
    const offset = this.bottomInset() / 2;
    const target = this.map.project(ll, zoom).add([0, offset]);
    this.map.setView(this.map.unproject(target, zoom), zoom, { animate: true });
    setTimeout(() => this.programmatic--, 400);
  }

  focusStop(s: Stop) {
    this.setFollowing(false);
    this.pan([s.lat, s.lng], Math.max(this.map.getZoom(), 18));
  }

  invalidate() {
    this.map.invalidateSize();
  }

  destroy() {
    this.map.remove();
  }
}
