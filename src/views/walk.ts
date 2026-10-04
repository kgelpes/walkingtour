import { compass, go, narrator, primeFromGesture, session } from '../app';
import { h, sheet, toast } from '../dom';
import { Geofence, type Arrival } from '../geofence';
import { bearing, compassWord, distance, formatDistance, formatTime, formatWalk } from '../geo';
import { icons } from '../icons';
import { DemoWalker, GpsSource, type GpsStatus, type LocationSource } from '../location';
import { TourMap } from '../map';
import { loadTour, progress, settings, tourBase, type Progress } from '../store';
import type { Clip, Fix, Stop } from '../types';
import { transcript } from './transcript';

type Banner =
  | { kind: 'queued'; stop: Stop }
  | { kind: 'arrived'; stop: Stop }
  | { kind: 'missed'; stop: Stop };

const GPS_LABEL: Record<GpsStatus, string> = {
  idle: 'GPS off',
  searching: 'Finding you…',
  good: 'GPS',
  weak: 'Weak GPS',
  denied: 'Location off',
  unavailable: 'No GPS',
  demo: 'Demo',
};

export async function walkView(root: HTMLElement, id: string, demo: boolean) {
  const tour = await loadTour(id);
  const key = demo ? `${id}:demo` : id;
  const stops = tour.stops;
  const clips: Clip[] = [...(tour.intro ? [tour.intro] : []), ...stops];
  const stopNo = (s: Clip) => stops.findIndex((x) => x.id === s.id) + 1;
  document.title = `${tour.title} · Walking`;
  narrator.setBase(tourBase(id));
  narrator.album = tour.title;
  narrator.artwork = new URL('icons/icon-512.png', document.baseURI).href;

  let prog: Progress = progress.get(key);
  prog.startedAt ??= Date.now();
  const save = () => progress.set(key, prog);
  save();
  const prefs = settings.get();

  const fence = new Geofence(stops);
  fence.reset(prog.done);

  let fix: Fix | null = null;
  let gps: GpsStatus = 'idle';
  let heading: number | null = null;
  let banner: Banner | null = null;
  let pending: Stop | null = null;
  let expanded = false;

  // ---------- DOM ----------
  const mapEl = h('div', { class: 'map' });
  const gpsPill = h('div', { class: 'gps-pill', role: 'status', 'aria-live': 'polite' });
  const locateBtn = h('button', { class: 'icon-btn locate-btn', 'aria-label': 'Follow my location', html: icons.locate });
  const bannerEl = h('div', { class: 'banner', hidden: true, role: 'status', 'aria-live': 'assertive' });
  const nextEl = h('div', { class: 'next-card' });
  const playerEl = h('div', { class: 'player' });
  const listEl = h('div', { class: 'stops-list', id: 'stops-list' });
  const handle = h('button', { class: 'sheet-handle', 'aria-expanded': 'false', 'aria-controls': 'stops-list' },
    h('span', { class: 'grabber', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'All stops'));
  const sheetEl = h('section', { class: 'walk-sheet', 'aria-label': 'Tour controls' }, handle, bannerEl, nextEl, playerEl, listEl);
  const demoBar = demo ? h('div', { class: 'demo-bar' }) : null;

  const view = h('div', { class: 'walk', style: `--accent:${tour.accent}` },
    mapEl,
    h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Leave tour', html: icons.close, onclick: () => go(`/tour/${id}`) }),
      demoBar,
      gpsPill),
    locateBtn,
    sheetEl,
  );
  root.append(view);

  const sheetHeight = () => (expanded ? 0 : sheetEl.getBoundingClientRect().height);
  const map = new TourMap(mapEl, stops, sheetHeight);
  map.onFollowChange = (f) => {
    locateBtn.classList.toggle('on', f);
    locateBtn.innerHTML = f ? icons.locateOn : icons.locate;
    locateBtn.setAttribute('aria-pressed', String(f));
  };
  locateBtn.addEventListener('click', () => {
    if (!fix) return toast(gps === 'denied' ? 'Location is off for this site.' : 'Still finding your location…');
    map.setFollowing(!map.isFollowing);
  });
  map.onStopTap = (s) => openStop(s);
  const ro = new ResizeObserver(() => {
    view.style.setProperty('--sheet-h', `${sheetEl.getBoundingClientRect().height}px`);
  });
  ro.observe(sheetEl);

  // ---------- rendering ----------
  function renderGps() {
    gpsPill.dataset.status = gps;
    const acc = fix && gps !== 'demo' && gps !== 'denied' ? ` ±${Math.round(fix.accuracy)} m` : '';
    gpsPill.innerHTML = `<span class="gps-dot"></span>${GPS_LABEL[gps]}${gps === 'good' || gps === 'weak' ? acc : ''}`;
  }

  function renderBanner() {
    bannerEl.hidden = !banner;
    if (!banner) return bannerEl.replaceChildren();
    const b = banner;
    const label = b.kind === 'missed' ? 'You passed' : b.kind === 'queued' ? 'You’ve reached' : 'You’ve arrived at';
    bannerEl.dataset.kind = b.kind;
    bannerEl.replaceChildren(
      h('span', { class: 'banner-icon', html: icons.pin }),
      h('div', { class: 'banner-text' }, h('small', null, label), h('strong', null, b.stop.title)),
      h('button', { class: 'btn primary small', onclick: () => { primeFromGesture(); playClip(b.stop); } }, h('span', { html: icons.play }), b.kind === 'queued' ? 'Play now' : 'Play'),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Dismiss', html: icons.close, onclick: () => { banner = null; pending = null; renderBanner(); } }),
    );
  }

  function renderNext() {
    const next = fence.next();
    if (!next) {
      const heard = stops.filter((s) => prog.heard.includes(s.id)).length;
      nextEl.className = 'next-card done';
      nextEl.replaceChildren(
        h('div', { class: 'next-main' },
          h('div', { class: 'eyebrow' }, 'Tour complete · お疲れさまでした'),
          h('h2', null, 'Thanks for walking with us'),
          h('p', { class: 'next-line' }, `You heard ${heard} of ${stops.length} stories. Tap any stop below to hear it again.`)),
        h('button', { class: 'btn ghost small', onclick: () => go('/') }, 'All tours'),
      );
      return;
    }
    const n = stops.indexOf(next) + 1;
    const required = stops.filter((s) => !s.optional).length;
    nextEl.className = `next-card${next.optional ? ' optional' : ''}`;
    let line: Node;
    let arrow: HTMLElement | null = null;
    if (fix) {
      const d = distance(fix, next);
      const b = bearing(fix, next);
      const rel = heading != null ? b - heading : b;
      arrow = h('span', { class: `dir-arrow${heading != null ? ' live' : ''}`, html: icons.arrow, style: `--rot:${rel}deg`, 'aria-hidden': 'true' });
      if (d <= next.radius) arrow = null;
      line = d <= next.radius
        ? h('span', null, h('strong', null, 'You’re here'), prefs.autoplay ? ' · starting in a moment' : '')
        : h('span', null, h('strong', null, formatDistance(d)), ` · ${formatWalk(d)}`, heading == null ? ` · ${compassWord(b)}` : '');
    } else if (gps === 'denied' || gps === 'unavailable') {
      line = h('span', null, 'Location is off — tap a stop below to listen');
    } else {
      line = h('span', { class: 'searching' }, 'Finding your location…');
    }
    nextEl.replaceChildren(
      h('button', { class: 'next-main', onclick: () => map.focusStop(next), 'aria-label': `Show ${next.title} on the map` },
        h('div', { class: 'eyebrow' }, next.optional ? 'Optional detour' : `Next stop · ${Math.min(n, required)} of ${required}`),
        h('h2', null, next.title),
        h('p', { class: 'next-line' }, arrow, line)),
      h('button', { class: 'btn ghost small skip', onclick: () => skip(next) }, next.optional ? 'Skip detour' : 'Skip'),
    );
  }

  let playerBuilt = false;
  const pl = {
    title: h('strong'),
    sub: h('small'),
    range: h('input', { type: 'range', min: '0', max: '100', step: '0.1', value: '0', 'aria-label': 'Seek' }),
    cur: h('span'),
    dur: h('span'),
    toggle: h('button', { class: 'play-btn', 'aria-label': 'Play' }),
  };
  let scrubbing = false;
  pl.range.addEventListener('input', () => { scrubbing = true; pl.cur.textContent = formatTime(Number(pl.range.value)); });
  pl.range.addEventListener('change', () => { scrubbing = false; narrator.seek(Number(pl.range.value)); });
  pl.toggle.addEventListener('click', () => { primeFromGesture(); narrator.toggle(); });

  function renderPlayer() {
    const s = narrator.state;
    const clip = s.clip && clips.some((c) => c.id === s.clip!.id) ? s.clip : null;
    if (!clip) {
      playerBuilt = false;
      playerEl.className = 'player idle';
      playerEl.replaceChildren(h('span', { html: icons.headphones }),
        h('p', null, demo ? 'Demo: the walker moves along the route. Tap the map to jump anywhere.' : 'Narration starts by itself at each stop. Keep this screen on.'));
      return;
    }
    if (!playerBuilt) {
      playerBuilt = true;
      playerEl.className = 'player';
      playerEl.replaceChildren(
        h('div', { class: 'player-head' },
          h('div', { class: 'player-title' }, pl.sub, pl.title),
          h('button', { class: 'icon-btn plain', 'aria-label': 'Read along', html: icons.text, onclick: () => openStop(narrator.state.clip!) })),
        pl.range,
        h('div', { class: 'player-times' }, pl.cur, pl.dur),
        h('div', { class: 'player-controls' },
          h('button', { class: 'icon-btn plain', 'aria-label': 'Back 15 seconds', html: icons.back15, onclick: () => narrator.skip(-15) }),
          pl.toggle,
          h('button', { class: 'icon-btn plain', 'aria-label': 'Forward 15 seconds', html: icons.fwd15, onclick: () => narrator.skip(15) })),
      );
    }
    const n = stopNo(clip);
    pl.title.textContent = clip.title;
    pl.sub.textContent = n ? `Stop ${n}` : 'Introduction';
    const d = s.duration || clip.duration || 0;
    pl.range.max = String(d);
    if (!scrubbing) {
      pl.range.value = String(s.time);
      pl.cur.textContent = formatTime(s.time);
    }
    pl.range.style.setProperty('--pct', `${d ? (s.time / d) * 100 : 0}%`);
    pl.dur.textContent = `-${formatTime(Math.max(0, d - s.time))}`;
    pl.toggle.innerHTML = s.playing ? icons.pause : s.blocked ? `${icons.play}<span>Tap to play</span>` : icons.play;
    pl.toggle.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    pl.toggle.classList.toggle('blocked', s.blocked);
    pl.toggle.classList.toggle('loading', s.loading && !s.playing);
    playerEl.classList.toggle('blocked', s.blocked);
  }

  let lastListRender = 0;
  function renderList() {
    lastListRender = Date.now();
    const playing = narrator.state.clip?.id;
    const next = fence.next();
    const row = (c: Clip, i: number | null) => {
      const s = c as Stop;
      const done = i == null ? prog.introHeard : prog.done.includes(c.id);
      const skipped = prog.skipped.includes(c.id);
      const isPlaying = playing === c.id && narrator.state.playing;
      const state = isPlaying ? 'playing' : skipped ? 'skipped' : done ? 'done' : next?.id === c.id ? 'next' : 'todo';
      const dist = fix && i != null ? ` · ${formatDistance(distance(fix, s))}` : '';
      return h('li', { 'data-state': state },
        h('button', { class: 'stop-row', onclick: () => { primeFromGesture(); playClip(c); } },
          h('span', { class: 'num' }, state === 'playing' ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : state === 'done' ? h('span', { html: icons.check }) : i == null ? '★' : String(i + 1)),
          h('div', null,
            h('strong', null, c.title),
            h('span', null, `${formatTime(c.duration ?? 0)}${skipped ? ' · skipped' : ''}${s.optional ? ' · optional' : ''}${dist}`)),
          h('span', { class: 'row-play', html: isPlaying ? icons.pause : icons.play }),
        ),
      );
    };
    const auto = h('input', { type: 'checkbox', role: 'switch', checked: prefs.autoplay });
    auto.addEventListener('change', () => { prefs.autoplay = auto.checked; settings.set(prefs); });
    listEl.replaceChildren(
      h('ol', null, ...(tour.intro ? [row(tour.intro, null)] : []), ...stops.map((s, i) => row(s, i))),
      h('div', { class: 'list-footer' },
        h('label', { class: 'switch' }, auto, h('span', { class: 'track' }), h('span', null, 'Play automatically on arrival')),
        h('button', { class: 'text-link', onclick: restart }, 'Restart tour')),
    );
  }

  function renderStatuses() {
    const next = fence.next();
    const playing = narrator.state.clip?.id;
    for (const s of stops) {
      map.setStatus(s.id,
        playing === s.id && narrator.state.playing ? 'playing'
        : prog.skipped.includes(s.id) ? 'skipped'
        : prog.done.includes(s.id) ? 'done'
        : next?.id === s.id ? 'next' : 'todo');
    }
  }

  function renderAll() {
    renderGps();
    renderBanner();
    renderNext();
    renderPlayer();
    if (expanded) renderList();
    renderStatuses();
  }

  // ---------- behaviour ----------
  function markDone(s: Stop) {
    if (!prog.done.includes(s.id)) prog.done.push(s.id);
    fence.markDone(s.id);
    save();
  }

  function playClip(c: Clip, from = 0) {
    if (pending?.id === c.id) pending = null;
    if (banner?.stop.id === c.id) banner = null;
    prog.last = { id: c.id, time: from };
    save();
    void narrator.play(c, { from });
    demoWalker?.setWalking(false);
    renderAll();
  }

  function skip(s: Stop) {
    const before = { ...prog, done: [...prog.done], skipped: [...prog.skipped] };
    prog.skipped.push(s.id);
    markDone(s);
    renderAll();
    toast(`Skipped ${s.title}`, {
      label: 'Undo',
      run: () => {
        prog = before;
        save();
        fence.reset(prog.done);
        renderAll();
      },
    });
  }

  function restart() {
    if (!confirm('Restart the tour from the beginning?')) return;
    narrator.pause();
    progress.clear(key);
    prog = progress.get(key);
    prog.startedAt = Date.now();
    save();
    fence.reset();
    banner = pending = null;
    if (demoWalker) {
      demoWalker.teleport(demoRoute[0]);
      demoWalker.setWalking(true);
    }
    renderAll();
  }

  async function onArrival({ stop, missed }: Arrival) {
    prog.done.includes(stop.id) || prog.done.push(stop.id);
    save();
    navigator.vibrate?.([80, 60, 80]);
    const s = narrator.state;
    if (s.clip?.id === stop.id) return renderAll(); // already listening to it
    if (missed || prog.heard.includes(stop.id)) {
      banner = { kind: missed ? 'missed' : 'arrived', stop };
      void narrator.chime();
    } else if (s.playing) {
      pending = stop;
      banner = { kind: 'queued', stop };
    } else if (!prefs.autoplay) {
      banner = { kind: 'arrived', stop };
      void narrator.chime();
    } else {
      banner = null;
      demoWalker?.setWalking(false);
      renderAll();
      await narrator.chime();
      if (narrator.state.playing) return; // user started something during the chime
      playClip(stop);
      return;
    }
    renderAll();
  }

  const offEnded = narrator.onEnded((clip, completed) => {
    if (!clips.some((c) => c.id === clip.id)) return;
    if (completed) {
      if (clip.id === tour.intro?.id) prog.introHeard = true;
      else if (!prog.heard.includes(clip.id)) prog.heard.push(clip.id);
      prog.last = null;
      save();
    }
    if (pending && completed) {
      const s = pending;
      pending = null;
      banner = null;
      setTimeout(async () => {
        if (narrator.state.playing) return;
        await narrator.chime();
        playClip(s);
      }, 700);
    } else if (completed && demoWalker && !demoWalker.finished) {
      setTimeout(() => !narrator.state.playing && demoWalker?.setWalking(true), 1200);
    }
    renderAll();
  });

  let lastSaved = 0;
  let wasPlaying = narrator.state.playing;
  const offState = narrator.subscribe((s) => {
    renderPlayer();
    // Remember the position: continuously-but-throttled while playing, at once on pause/seek.
    const ours = s.clip && clips.some((c) => c.id === s.clip!.id) && !s.loading;
    if (ours && s.time > 0 && s.time < s.duration - 1 && (!s.playing || Date.now() - lastSaved > 4000) && prog.last?.time !== s.time) {
      lastSaved = Date.now();
      prog.last = { id: s.clip!.id, time: s.time };
      save();
    }
    // Keep play/pause icons in list & pins in sync on play state changes.
    if (s.playing !== wasPlaying) {
      wasPlaying = s.playing;
      renderStatuses();
      if (expanded) renderList();
    }
  });

  // ---------- sheet expand/collapse ----------
  function setExpanded(e: boolean) {
    expanded = e;
    sheetEl.classList.toggle('expanded', e);
    view.classList.toggle('sheet-expanded', e);
    handle.setAttribute('aria-expanded', String(e));
    if (e) renderList();
  }
  handle.addEventListener('click', () => setExpanded(!expanded));
  let dragY: number | null = null;
  sheetEl.addEventListener('touchstart', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, .stops-list ol') && !t.closest('.sheet-handle')) return;
    dragY = e.touches[0].clientY;
  }, { passive: true });
  sheetEl.addEventListener('touchend', (e) => {
    if (dragY == null) return;
    const dy = e.changedTouches[0].clientY - dragY;
    dragY = null;
    if (dy < -40 && !expanded) setExpanded(true);
    else if (dy > 40 && expanded) setExpanded(false);
  });

  // ---------- stop detail sheet ----------
  function openStop(c: Clip) {
    const s = c as Stop;
    const n = stopNo(c);
    const btn = h('button', { class: 'btn primary small' });
    const unsub = narrator.subscribe((st) => {
      const on = st.clip?.id === c.id && st.playing;
      btn.innerHTML = `${on ? icons.pause : icons.play}<span>${on ? 'Pause' : st.clip?.id === c.id && st.time > 0 ? 'Resume' : `Play · ${formatTime(c.duration ?? 0)}`}</span>`;
    });
    btn.addEventListener('click', () => {
      primeFromGesture();
      if (narrator.state.clip?.id === c.id) narrator.toggle();
      else playClip(c);
    });
    const dist = fix && n ? h('span', null, ` · ${formatDistance(distance(fix, s))} away`) : null;
    sheet(h('div', { class: 'modal-scroll' },
      h('div', { class: 'eyebrow' }, n ? `Stop ${n}` : 'Introduction', dist),
      h('h2', { class: 'modal-title' }, c.title, s.jp && h('span', { class: 'jp' }, s.jp)),
      h('div', { class: 'modal-actions' }, btn),
      transcript(c)), { label: c.title, tall: true, onClose: () => unsub() });
  }

  // ---------- location ----------
  const demoRoute = [{ lat: 34.99578, lng: 135.78185 }, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
  const demoWalker = demo ? new DemoWalker(demoRoute) : null;
  const source: LocationSource = demoWalker ?? new GpsSource();

  if (demoWalker && demoBar) {
    const speeds = [1, 4, 12];
    const renderDemo = () => {
      demoBar.replaceChildren(
        h('button', { class: 'demo-toggle', 'aria-label': demoWalker.walking ? 'Stop walking' : 'Walk', html: demoWalker.walking ? icons.pause : icons.walk,
          onclick: () => demoWalker.setWalking(!demoWalker.walking) }),
        ...speeds.map((sp) => h('button', { class: `demo-speed${demoWalker.speed === sp ? ' on' : ''}`, onclick: () => { demoWalker.speed = sp; renderDemo(); } }, `${sp}×`)),
      );
    };
    demoWalker.onChange = renderDemo;
    // Wait for the welcome to finish before walking, like a real visitor would.
    demoWalker.walking = !(narrator.state.clip?.id === tour.intro?.id && narrator.state.playing);
    renderDemo();
    map.onMapTap = (p) => demoWalker.teleport(p);
  }

  let firstFix = true;
  let dwell: number | null = null;
  const onFix = (f: Fix) => {
      fix = f;
      // Phones standing still may stop reporting; re-check the last fix so a
      // walker who stops at a stop is still confirmed as having arrived.
      if (dwell != null) clearTimeout(dwell);
      dwell = window.setTimeout(() => {
        dwell = null;
        if (fix === f) onFix({ ...f, timestamp: Date.now() });
      }, 3000);
      map.setUser(f);
      if (heading == null && f.heading != null && (f.speed ?? 0) > 0.6) map.setHeading(f.heading);
      if (firstFix) {
        firstFix = false;
        // Only follow the walker if they're actually near the tour.
        if (distance(f, stops[0]) < 3000) map.setFollowing(true);
      }
      const arrival = fence.update(f);
      if (arrival) void onArrival(arrival);
      else {
        renderNext();
        renderGps();
        if (expanded && Date.now() - lastListRender > 5000) renderList();
      }
  };
  source.start(
    onFix,
    (s) => {
      gps = s;
      renderGps();
      renderNext();
      if (s === 'denied') toast('Location is off. Allow it in your browser’s site settings to auto-play stops.', undefined, 6000);
    },
  );

  const offCompass = compass.subscribe((hd) => {
    heading = hd;
    map.setHeading(hd);
    const arrow = nextEl.querySelector<HTMLElement>('.dir-arrow');
    if (arrow && fix && hd != null) {
      const next = fence.next();
      if (next) {
        arrow.classList.add('live');
        arrow.style.setProperty('--rot', `${bearing(fix, next) - hd}deg`);
      }
    }
  });

  // ---------- keep the screen on ----------
  let lock: WakeLockSentinel | null = null;
  const acquire = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    } catch { /* not allowed (e.g. low battery) */ }
  };
  const onVisible = () => document.visibilityState === 'visible' && acquire();
  document.addEventListener('visibilitychange', onVisible);
  void acquire();

  // ---------- resume ----------
  if (prog.last && !narrator.state.clip) {
    const c = clips.find((x) => x.id === prog.last!.id);
    if (c) void narrator.play(c, { from: prog.last.time, autoplay: false });
  }
  if (!session.primed) {
    // Arrived here by reload or link: one tap is needed before audio may auto-play.
    const close = sheet(h('div', { class: 'resume' },
      h('h2', { class: 'modal-title' }, prog.done.length ? 'Welcome back' : tour.title),
      h('p', null, prog.done.length ? `You’ve done ${prog.done.length} of ${stops.length} stops.` : 'Ready when you are.'),
      h('button', { class: 'btn primary big', onclick: () => {
        primeFromGesture();
        if (!prog.introHeard && tour.intro && !prog.done.length) playClip(tour.intro);
        close();
      } }, h('span', { html: icons.play }), prog.done.length ? 'Continue tour' : 'Start tour')),
    { label: 'Continue tour' });
  }

  renderAll();
  requestAnimationFrame(() => map.invalidate());

  return () => {
    source.stop();
    if (dwell != null) clearTimeout(dwell);
    offEnded();
    offState();
    offCompass();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => {});
    if (narrator.state.clip && narrator.state.playing) {
      prog.last = { id: narrator.state.clip.id, time: narrator.state.time };
      save();
    }
    narrator.pause();
    map.destroy();
    document.querySelectorAll('.modal, .modal-backdrop').forEach((e) => e.remove());
  };
}
