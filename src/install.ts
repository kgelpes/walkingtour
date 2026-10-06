import { h, sheet, toast } from './dom';
import { icons } from './icons';
import { persistStorage } from './offline';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

// Chrome/Edge/Android: hold on to the install prompt so we can show our own button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  changed();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  persistStorage();
  changed();
  toast('Installed. Open Walking Tours from your home screen.');
});

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const DISMISS_KEY = 'wt:install-dismissed';
const dismissed = () => {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now() - 14 * 864e5; // ask again after two weeks
  } catch {
    return false;
  }
};

/** Whether we can offer installation here: a captured prompt, or iOS (manual steps). */
export const canOfferInstall = () => !isStandalone() && !dismissed() && (deferred != null || isIOS());

export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* ignore */ }
  changed();
}

export async function install() {
  if (deferred) {
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'dismissed') dismissInstall();
    changed();
    return;
  }
  // iOS has no install prompt: show the steps.
  const share = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
  const plus = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
  sheet(
    h('div', { class: 'install-steps' },
      h('h2', { class: 'modal-title' }, 'Add to your Home Screen'),
      h('p', null, 'It opens full screen like an app, keeps your saved tours, and works without a connection.'),
      h('ol', null,
        h('li', null, h('span', { class: 'step-icon', html: share }), h('div', null, 'Tap ', h('strong', null, 'Share'), ' in Safari’s toolbar (in Chrome, it’s in the address bar).')),
        h('li', null, h('span', { class: 'step-icon', html: plus }), h('div', null, 'Scroll down and tap ', h('strong', null, 'Add to Home Screen'), '.')),
        h('li', null, h('span', { class: 'step-icon', html: icons.check }), h('div', null, 'Tap ', h('strong', null, 'Add'), '. Then open Walking Tours from your Home Screen.')),
      ),
    ),
    { label: 'Add to Home Screen' },
  );
}
