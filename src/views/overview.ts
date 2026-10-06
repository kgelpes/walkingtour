import { go, narrator, primeFromGesture } from '../app';
import { h, sheet, toast } from '../dom';
import { formatTime } from '../geo';
import { icons, tourArt } from '../icons';
import { estimateMB, offlineStatus, saveOffline } from '../offline';
import { loadTour, progress, tourBase } from '../store';
import type { Clip, Stop } from '../types';
import { transcript } from './transcript';

export async function overviewView(root: HTMLElement, id: string) {
  const tour = await loadTour(id);
  const base = tourBase(id);
  const train = tour.mode === 'train';
  document.title = `${tour.title} · Walking Tours`;
  narrator.setBase(base);
  const p = progress.get(id);
  const started = p.startedAt != null && p.done.length < tour.stops.length;
  const totalAudio = [tour.intro, ...tour.stops].reduce((a, c) => a + (c?.duration ?? 0), 0);

  const start = (opts: { demo?: boolean; fresh?: boolean }) => {
    primeFromGesture();
    const key = opts.demo ? `${id}:demo` : id;
    if (opts.fresh || opts.demo) progress.clear(key);
    const state = progress.get(key);
    // Start the welcome inside this tap so mobile browsers allow the audio.
    if (!state.introHeard && tour.intro) void narrator.play(tour.intro);
    else narrator.pause(); // stop any preview; the walk resumes where it left off
    go(`/tour/${id}/walk${opts.demo ? '/demo' : ''}`);
  };

  const offlineBtn = h('button', { class: 'btn ghost offline-btn' });
  const setOffline = (state: 'idle' | 'saving' | 'saved', pct = 0) => {
    offlineBtn.disabled = state !== 'idle';
    offlineBtn.classList.toggle('saved', state === 'saved');
    offlineBtn.style.setProperty('--pct', `${Math.round(pct * 100)}%`);
    offlineBtn.innerHTML =
      state === 'saved' ? `${icons.check}<span>Saved for offline</span>`
      : state === 'saving' ? `${icons.download}<span>Saving… ${Math.round(pct * 100)}%</span>`
      : `${icons.download}<span>Save for offline · ${estimateMB(tour)} MB</span>`;
  };
  setOffline('idle');
  offlineStatus(tour).then((s) => s.ready && setOffline('saved'));
  offlineBtn.addEventListener('click', async () => {
    setOffline('saving');
    try {
      await saveOffline(tour, (f) => setOffline('saving', f));
      setOffline('saved');
      toast('Saved — this tour now works without a connection.');
    } catch {
      setOffline('idle');
      toast('Couldn’t save everything. Check your connection and try again.');
    }
  });

  const openStop = (clip: Clip, n?: number) => {
    const stop = clip as Stop;
    const play = h('button', { class: 'btn primary small', onclick: () => {
      narrator.unlock();
      if (narrator.state.clip?.id === clip.id) narrator.toggle();
      else void narrator.play(clip);
    } });
    const unsub = narrator.subscribe((s) => {
      const on = s.clip?.id === clip.id && s.playing;
      play.innerHTML = `${on ? icons.pause : icons.play}<span>${on ? 'Pause preview' : `Preview · ${formatTime(clip.duration ?? 0)}`}</span>`;
    });
    sheet(
      h('div', { class: 'modal-scroll' },
        h('div', { class: 'eyebrow' }, n ? `Stop ${n}` : 'Introduction', stop.jp && h('span', { class: 'jp' }, ` ${stop.jp}`)),
        h('h2', { class: 'modal-title' }, clip.title),
        h('div', { class: 'modal-actions' }, play),
        transcript(clip),
      ),
      { label: clip.title, tall: true, onClose: () => { unsub(); if (narrator.state.clip?.id === clip.id) narrator.pause(); } },
    );
  };

  root.append(
    h('main', { class: 'overview', style: `--accent:${tour.accent}` },
      h('div', { class: 'hero' },
        h('div', { class: 'hero-art', html: tourArt(tour.art) }),
        h('button', { class: 'icon-btn floating', 'aria-label': 'All tours', html: icons.back, onclick: () => go('/') }),
      ),
      h('section', { class: 'overview-body' },
        h('div', { class: 'eyebrow' }, `${tour.city} · ${train ? 'Audio train ride' : 'Audio walking tour'}`),
        h('h1', null, tour.title, tour.jp && h('span', { class: 'jp' }, tour.jp)),
        h('p', { class: 'tagline' }, tour.tagline),
        h('ul', { class: 'stats' },
          tour.durationMin >= 90
            ? h('li', null, h('strong', null, `${Math.floor(tour.durationMin / 60)}h${String(tour.durationMin % 60).padStart(2, '0')}`), 'journey')
            : h('li', null, h('strong', null, `${tour.durationMin}`), 'min'),
          h('li', null, h('strong', null, `${tour.stops.length}`), `${tour.stopNoun ?? 'stop'}s`),
          h('li', null, h('strong', null, `${(tour.distanceM / 1000).toFixed(tour.distanceM >= 100_000 ? 0 : 1)}`), 'km'),
          h('li', null, h('strong', null, `${Math.round(totalAudio / 60)}`), 'min audio'),
        ),
        h('div', { class: 'cta' },
          started
            ? h('button', { class: 'btn primary big', onclick: () => start({}) },
                h('span', { html: icons.play }), h('span', null, 'Continue tour', h('small', null, `${p.done.length} of ${tour.stops.length} stops done`)))
            : h('button', { class: 'btn primary big', onclick: () => start({ fresh: true }) }, h('span', { html: icons.play }), 'Start tour'),
          started && h('button', { class: 'btn ghost', onclick: () => start({ fresh: true }) }, h('span', { html: icons.restart }), 'Start over'),
          offlineBtn,
        ),
        h('p', { class: 'desc' }, tour.description),
        h('ul', { class: 'how' },
          ...(train
            ? [
                h('li', null, h('span', { html: icons.pin }), h('div', null, h('strong', null, 'Book seat E'), 'On a Nozomi to Tokyo, E is the window on the mountain side, the one that faces Mount Fuji.')),
                h('li', null, h('span', { html: icons.headphones }), h('div', null, h('strong', null, 'Headphones in'), 'Each story starts by itself with a soft chime, about a minute before the sight.')),
                h('li', null, h('span', { html: icons.sun }), h('div', null, h('strong', null, 'Screen on, phone on the table'), 'GPS works through the window. Save for offline first: there are lots of tunnels.')),
              ]
            : [
                h('li', null, h('span', { html: icons.headphones }), h('div', null, h('strong', null, 'Bring headphones'), 'Or listen through the speaker at low volume.')),
                h('li', null, h('span', { html: icons.pin }), h('div', null, h('strong', null, 'Just walk'), 'Each story starts by itself with a soft chime when you arrive.')),
                h('li', null, h('span', { html: icons.sun }), h('div', null, h('strong', null, 'Keep the screen on'), 'Your phone can only follow you while the page is open.')),
              ]),
        ),
        h('button', { class: 'demo-link', onclick: () => start({ demo: true }) },
          h('span', { html: icons.walk }),
          train
            ? h('div', null, h('strong', null, 'Not on the train yet?'), 'Try a demo ride — the app simulates the journey at up to 30× speed.')
            : h('div', null, h('strong', null, 'Not in Kyoto yet?'), 'Try a demo walk — the app simulates walking the route.'),
          h('span', { html: icons.chevronRight })),
        h('h3', { class: 'section-title' }, 'Stops'),
        h('ol', { class: 'stop-preview' },
          ...tour.stops.map((s, i) =>
            h('li', null, h('button', { onclick: () => openStop(s, i + 1) },
              h('span', { class: `num${s.optional ? ' optional' : ''}` }, String(i + 1)),
              h('div', null,
                h('strong', null, s.title, s.jp && h('span', { class: 'jp' }, s.jp)),
                h('span', null, s.teaser ?? ''),
              ),
              h('span', { class: 'dur' }, formatTime(s.duration ?? 0)),
            )),
          ),
        ),
        tour.intro && h('button', { class: 'text-link', onclick: () => openStop(tour.intro!) }, 'Read the introduction'),
        h('p', { class: 'fineprint' }, 'Narration voiced with ElevenLabs. Map © OpenStreetMap contributors.'),
      ),
    ),
  );

  return () => {
    // Stop any preview when leaving, unless a walk is starting with it.
    if (!location.hash.includes('/walk')) narrator.pause();
  };
}

