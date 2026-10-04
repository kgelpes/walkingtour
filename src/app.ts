import { Narrator } from './audio';
import { Compass } from './location';

/** Session-wide singletons: one audio element and one compass for the whole app. */
export const narrator = new Narrator();
export const compass = new Compass();

/**
 * Everything that must happen inside the tap that starts a walk:
 * unlock audio, and ask for compass permission (iOS).
 */
export const session = { primed: false };

export function primeFromGesture() {
  session.primed = true;
  narrator.unlock();
  void Compass.request().then((ok) => ok && compass.start());
}

export function go(path: string) {
  location.hash = path;
}

// Handy for debugging on a device (and used by the e2e tests).
(window as any).__wt = { narrator };
