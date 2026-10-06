# Walking Tours

**Live:** https://kgelpes.github.io/walkingtour/

GPS-triggered audio tours, as an installable app (PWA: install it from the home screen card, works offline from the first launch):

- **Kiyomizu-dera, Kyoto**: a walking tour with 9 stops and about 14 minutes of narration.
- **Shinkansen to Tokyo**: the view from seat E of a Nozomi, Kyoto → Tokyo. 18 views, each announced about a minute before it appears, voiced with ElevenLabs v4 and its expressive tags (`[excited]`, `[whispers]`, …).

Walk around, and each story starts by itself with a soft chime when you arrive at a stop. There's no app store install and no account. It also works offline once saved.

## How it behaves

- **Arrival detection** (`src/geofence.ts`). Each stop has a radius. An arrival needs two consecutive GPS fixes inside it, so a single GPS jump never starts the wrong story. Fixes worse than ±60 m are ignored. Stops that would skip over an unvisited required stop need a precise fix: the stage hangs 40 m above the waterfall, and this keeps one from triggering the other. A phone standing still is re-checked every 3 s.
- **Never interrupts.** If you arrive while a story is still playing, the next one is queued with a "Play now" banner and starts when the current one ends. A stop you missed and walk past again on the way out is *offered*, not auto-played.
- **Mobile audio rules.** Audio is unlocked by the Start tap, so later GPS-triggered playback is allowed on iOS and Android. If a browser still refuses, the play button turns into "Tap to play". Lock-screen controls come from the Media Session API.
- **Keeps the screen on** with the Wake Lock API. Mobile browsers stop GPS for pages in the background, so the screen needs to stay on.
- **Progress is saved** (stops done, position in the current story) and survives reloads.
- **Offline.** "Save for offline" caches the audio, the app and the map tiles for the area. The service worker answers Range requests from the cache, which Safari needs to play cached audio.
- **Demo walk.** Lets you try the whole tour at home: a simulated walker follows the route. Tap the map to jump anywhere. Demo progress is kept separate.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173 (use the demo walk, or devtools → Sensors to fake GPS)
npm test             # unit tests (geofence logic against the real tour data)
npm run test:e2e     # Playwright: full walk, queueing, resume, denied location, offline
npm run build        # static site in dist/
```

Geolocation needs HTTPS on phones. To test on a phone, deploy it (see below) or use a tunnel.

## Deploy

`dist/` is a static site that works from any path. `.github/workflows/deploy.yml` publishes it to GitHub Pages on every push to `main`. To turn that on, go to **Settings → Pages → Source: GitHub Actions**.

## Add another attraction

1. Create `public/tours/<id>/tour.json`, copying the structure of `kiyomizu-dera/tour.json`. Each stop needs `id`, `title`, `lat`, `lng`, `radius` (metres; keep stop centres at least about 35 m apart) and the narration `text`. Mark detours with `"optional": true`.
2. Add a summary entry to `public/tours/index.json`.
3. Generate the narration: put `ELEVENLABS_API_KEY=...` in `.env` (gitignored), then run `npm run audio -- <id>`.
   Clips are content-hashed: only new or edited text is sent to ElevenLabs, and the generated file names and durations are written back into `tour.json`.
4. `npm test` checks that every stop has audio and that the fences don't overlap.

The API key is only used at build time on your machine. It never ships to the browser.

## Add a train ride

Train tours set `"mode": "train"` and carry the real track as `path`. Triggers sit *ahead* of each sight, since at 285 km/h a minute is about 5 km.

1. Find the line's OSM route relation (e.g. 9802494 is the Nozomi, Shin-Osaka → Tokyo) and build the track:
   `python3 scripts/osm-route.py 9802494 京都 東京 > route.json` (prints the length; check it against the official figure).
2. Get the km of each sight with `--km lat,lng`. Then place its trigger about a minute earlier with `--at <km>`, and use a radius of 1–2 km.
3. Use `"geofence": {"maxAccuracy": 300}`: GPS through a train window is coarser.
4. `npm test` checks that every trigger is on the track and that no two trigger zones overlap.
