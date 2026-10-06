export interface Clip {
  id: string;
  title: string;
  text: string;
  audio?: string;
  duration?: number;
}

export interface Stop extends Clip {
  jp?: string;
  teaser?: string;
  lat: number;
  lng: number;
  /** Arrival radius in metres. */
  radius: number;
  /** Detours are suggested but never block "next stop" guidance. */
  optional?: boolean;
}

export type TourMode = 'walk' | 'train';

export interface Tour {
  id: string;
  /** 'train' tours trigger well ahead of each sight and move at train speed. */
  mode?: TourMode;
  /** Word for a stop in the UI ("stop", "view"). */
  stopNoun?: string;
  /** Artwork key (see icons.ts). */
  art?: string;
  /** The actual route as [lat, lng] points, when it isn't a straight line between stops. */
  path?: [number, number][];
  /** Geofence tuning, e.g. looser accuracy on a train. */
  geofence?: { maxAccuracy?: number; confirmFixes?: number; outOfOrderFixes?: number };
  title: string;
  jp?: string;
  city: string;
  tagline: string;
  description: string;
  durationMin: number;
  distanceM: number;
  accent: string;
  intro?: Clip;
  stops: Stop[];
}

export interface TourSummary {
  id: string;
  title: string;
  jp?: string;
  city: string;
  tagline: string;
  durationMin: number;
  stops: number;
  lat: number;
  lng: number;
  accent: string;
  art?: string;
  mode?: TourMode;
  stopNoun?: string;
}

export interface Fix {
  lat: number;
  lng: number;
  /** 68% confidence radius in metres. */
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
