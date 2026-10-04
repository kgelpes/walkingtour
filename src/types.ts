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

export interface Tour {
  id: string;
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
