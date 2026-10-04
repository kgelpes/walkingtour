import './styles.css';
import { go } from './app';
import { h } from './dom';
import { homeView } from './views/home';
import { overviewView } from './views/overview';
import { walkView } from './views/walk';

type Cleanup = void | (() => void);
const root = document.getElementById('app')!;
let cleanup: Cleanup;

async function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  root.replaceChildren();
  window.scrollTo(0, 0);
  try {
    if (parts[0] === 'tour' && parts[1] && parts[2] === 'walk') cleanup = await walkView(root, parts[1], parts[3] === 'demo');
    else if (parts[0] === 'tour' && parts[1]) cleanup = await overviewView(root, parts[1]);
    else cleanup = await homeView(root);
  } catch (e) {
    console.error(e);
    root.replaceChildren(
      h('main', { class: 'error-page' },
        h('h1', null, 'Couldn’t load this tour'),
        h('p', null, navigator.onLine ? 'Something went wrong. Please try again.' : 'You’re offline, and this tour hasn’t been saved for offline use yet.'),
        h('button', { class: 'btn primary', onclick: () => route() }, 'Try again'),
        h('button', { class: 'btn ghost', onclick: () => go('/') }, 'All tours')),
    );
  }
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').then(async (reg) => {
    await navigator.serviceWorker.ready;
    const urls = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && /\.(js|css|svg|png|webmanifest)$/.test(new URL(u).pathname));
    (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'warm', urls: [location.href.split('#')[0], ...urls] });
  }).catch(() => {});
}
