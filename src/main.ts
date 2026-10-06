import './styles.css';
import { go } from './app';
import { toast } from './dom';
import './install';
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
  // Updates install in the background and wait; the user picks the moment to switch,
  // so new code never replaces the app in the middle of a tour.
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => updating && location.reload());
  const offer = (worker: ServiceWorker) =>
    toast('A new version of the app is ready.', {
      label: 'Update',
      run: () => {
        updating = true;
        worker.postMessage({ type: 'skip-waiting' });
      },
    }, 20000);
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    // Installed apps can stay open for days: check for updates when brought back.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch(() => {});
}
