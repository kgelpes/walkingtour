import { h } from '../dom';
import { distance, formatDistance, formatDuration } from '../geo';
import { icons, tourArt } from '../icons';
import { canOfferInstall, dismissInstall, install, onInstallChange } from '../install';
import { loadIndex, progress } from '../store';

export async function homeView(root: HTMLElement) {
  const tours = await loadIndex();
  document.title = 'Walking Tours';

  const cards = tours.map((t) => {
    const p = progress.get(t.id);
    const started = p.done.length > 0 && p.done.length < t.stops;
    const dist = h('span', { class: 'chip-dist', hidden: true });
    const card = h('a', { class: 'tour-card', href: `#/tour/${t.id}`, style: `--accent:${t.accent}` },
      h('div', { class: 'tour-card-art', html: tourArt(t.art) }),
      h('div', { class: 'tour-card-body' },
        h('div', { class: 'eyebrow' }, t.city, dist),
        h('h2', null, t.title, t.jp && h('span', { class: 'jp' }, t.jp)),
        h('p', null, t.tagline),
        h('div', { class: 'meta' },
          h('span', { html: icons.clock }), formatDuration(t.durationMin),
          h('span', { class: 'dot' }), `${t.stops} ${t.stopNoun ?? 'stop'}s`,
          started && h('span', { class: 'dot' }), started && h('strong', null, `${p.done.length}/${t.stops} done`)),
      ),
    );
    return { card, dist, t };
  });

  // "Install the app" card: shown where the browser can install, or on iOS with manual steps.
  const installSlot = h('div');
  const renderInstall = () => {
    installSlot.replaceChildren(
      canOfferInstall()
        ? h('div', { class: 'install-card' },
            h('img', { src: 'icons/icon-192.png', alt: '', width: '48', height: '48' }),
            h('div', null, h('strong', null, 'Get the app'), h('span', null, 'Full screen, offline, one tap from your home screen.')),
            h('button', { class: 'btn primary small', onclick: () => void install() }, 'Install'),
            h('button', { class: 'icon-btn plain', 'aria-label': 'Not now', html: icons.close, onclick: dismissInstall }))
        : '',
    );
  };
  renderInstall();
  const offInstall = onInstallChange(renderInstall);

  root.append(
    h('main', { class: 'home' },
      h('header', { class: 'home-head' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: icons.headphones }), 'Walking Tours'),
        h('h1', null, 'Audio guides that play themselves as you go.'),
      ),
      installSlot,
      h('section', { class: 'tour-list', 'aria-label': 'Tours' }, ...cards.map((c) => c.card)),
      h('div', { class: 'soon' },
        h('span', { html: icons.sparkle }),
        h('div', null, h('strong', null, 'More tours coming'), h('p', null, 'New walks and rides are added here as they’re recorded.'))),
    ),
  );

  // Show distances only if location is already allowed — never prompt on the home screen.
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' });
    if (perm?.state === 'granted') {
      navigator.geolocation.getCurrentPosition((pos) => {
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        for (const { dist, t } of cards) {
          dist.textContent = ` · ${formatDistance(distance(me, t))} away`;
          dist.hidden = false;
        }
      }, () => {}, { maximumAge: 60000, timeout: 10000 });
    }
  } catch { /* permissions API missing */ }
  return () => offInstall();
}
