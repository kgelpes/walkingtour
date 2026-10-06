import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const tour = JSON.parse(readFileSync(new URL('../public/tours/kiyomizu-dera/tour.json', import.meta.url), 'utf8'));
const at = (id: string) => tour.stops.find((s: any) => s.id === id);

/** Two slightly different fixes, so the geofence sees consecutive readings. */
async function walkTo(page: Page, p: { lat: number; lng: number }, accuracy = 15) {
  for (const d of [0.00001, -0.00001, 0]) {
    await page.context().setGeolocation({ latitude: p.lat + d, longitude: p.lng, accuracy });
    await page.waitForTimeout(250);
  }
}

const player = (page: Page) =>
  page.evaluate(() => {
    const n = (window as any).__wt.narrator;
    return { id: n.state.clip?.id ?? null, playing: !n.el.paused, time: n.el.currentTime, blocked: n.state.blocked };
  });

async function finishClip(page: Page) {
  await page.waitForFunction(() => Number.isFinite((window as any).__wt.narrator.el.duration));
  await page.evaluate(() => {
    const el: HTMLAudioElement = (window as any).__wt.narrator.el;
    el.currentTime = Math.max(0, el.duration - 0.4);
  });
}

test('full walk: intro, arrival while narrating, auto-play, resume after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await page.getByRole('link', { name: /Kiyomizu-dera/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kiyomizu-dera');
  await page.getByRole('button', { name: 'Start tour' }).click();

  // The welcome starts from the tap.
  await expect(page.locator('.player-title')).toContainText('Welcome');
  await expect.poll(async () => (await player(page)).time, { timeout: 10_000 }).toBeGreaterThan(0.5);
  expect((await player(page)).id).toBe('intro');
  await expect(page.locator('.next-card')).toContainText('Niōmon Gate');
  await expect(page.locator('.next-line')).toContainText('min walk');

  // Arriving during the welcome queues the stop rather than cutting it off.
  await walkTo(page, at('niomon'));
  await expect(page.locator('.banner')).toContainText('You’ve reached', { timeout: 12_000 });
  await expect(page.locator('.banner')).toContainText('Niōmon Gate');
  expect((await player(page)).id).toBe('intro');

  // When the welcome ends, the queued stop plays by itself.
  await finishClip(page);
  await expect.poll(async () => (await player(page)).id, { timeout: 10_000 }).toBe('niomon');
  await expect.poll(async () => (await player(page)).playing).toBe(true);
  await expect(page.locator('.banner')).toBeHidden();
  await expect(page.locator('.next-card')).toContainText('West Gate & Pagoda');

  // Finish Niōmon, walk to the pagoda: chime, then auto-play.
  await finishClip(page);
  await expect.poll(async () => (await player(page)).playing).toBe(false);
  await walkTo(page, at('pagoda'));
  await expect.poll(async () => (await player(page)).id, { timeout: 15_000 }).toBe('pagoda');
  await expect.poll(async () => (await player(page)).playing).toBe(true);

  // Pause/seek controls.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await player(page)).playing).toBe(false);
  await page.getByRole('button', { name: 'Forward 15 seconds' }).click();
  expect((await player(page)).time).toBeGreaterThan(14);

  // Skip the next stop with undo.
  await expect(page.locator('.next-card')).toContainText('Zuigu-dō');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('.next-card')).toContainText('Todoroki-mon');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.next-card')).toContainText('Zuigu-dō');

  // Stop list.
  await page.locator('.sheet-handle').click();
  await expect(page.locator('.stops-list li')).toHaveCount(tour.stops.length + 1);
  await expect(page.locator('.stops-list li[data-state="done"]')).toHaveCount(3); // intro, niomon heard + pagoda arrived
  await page.locator('.sheet-handle').click();

  // Reload: progress and position survive; one tap to continue.
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Welcome back');
  await page.getByRole('button', { name: 'Continue tour' }).click();
  await expect(page.locator('.next-card')).toContainText('Zuigu-dō');
  expect((await player(page)).id).toBe('pagoda');
  expect((await player(page)).time).toBeGreaterThan(10);

  expect(errors).toEqual([]);
});

test('starting mid-route: an earlier, unheard stop still plays by itself', async ({ page }) => {
  await page.goto('./#/tour/kiyomizu-dera');
  await page.evaluate(() => localStorage.setItem('wt:progress:kiyomizu-dera', JSON.stringify({
    done: ['koyasu', 'otowa'], heard: ['koyasu', 'otowa'], skipped: [], introHeard: true, last: null, startedAt: 1,
  })));
  await page.reload();
  await page.getByRole('button', { name: /Continue tour/ }).click();
  await expect(page.locator('.next-card')).toContainText('Niōmon Gate');
  await walkTo(page, at('pagoda'), 5);
  await expect.poll(async () => (await player(page)).id, { timeout: 15_000 }).toBe('pagoda');
  await expect.poll(async () => (await player(page)).playing).toBe(true);
});

test('demo walk reaches the first stop by itself', async ({ page }) => {
  await page.goto('./#/tour/kiyomizu-dera');
  await page.getByRole('button', { name: /demo walk/ }).click();
  await expect(page.locator('.gps-pill')).toContainText('Demo');
  // Skip the welcome so the walker sets off, at top speed.
  await finishClip(page);
  await page.getByRole('button', { name: '12×' }).click();
  await expect.poll(async () => (await player(page)).id, { timeout: 30_000 }).toBe('niomon');
  // Real progress is untouched by the demo.
  const real = await page.evaluate(() => localStorage.getItem('wt:progress:kiyomizu-dera'));
  expect(real).toBeNull();
});

test('location denied still lets you listen', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: [], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('./#/tour/kiyomizu-dera');
  await page.getByRole('button', { name: 'Start tour' }).click();
  await expect(page.locator('.gps-pill')).toContainText(/Location off|Finding/);
  await page.locator('.sheet-handle').click();
  await page.locator('.stop-row', { hasText: 'Main Hall & Stage' }).click();
  await expect.poll(async () => (await player(page)).id).toBe('stage');
  await ctx.close();
});

test('works offline after saving', async ({ page, context }) => {
  await page.goto('./#/tour/kiyomizu-dera');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await page.getByRole('button', { name: /Save for offline/ }).click();
  await expect(page.getByRole('button', { name: /Saved for offline/ })).toBeVisible({ timeout: 60_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kiyomizu-dera');
  await page.getByRole('button', { name: /Start tour|Continue tour/ }).click();
  await expect.poll(async () => (await player(page)).time, { timeout: 10_000 }).toBeGreaterThan(0.5);
  // Seeking (Range requests) works from the cache.
  await page.evaluate(() => { (window as any).__wt.narrator.el.currentTime = 30; });
  await expect.poll(async () => (await player(page)).time, { timeout: 10_000 }).toBeGreaterThan(30.2);
  await context.setOffline(false);
});

test('train tour: demo ride keeps moving and plays the first view', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /Shinkansen to Tokyo/ }).click();
  await expect(page.getByText('Book seat E')).toBeVisible();
  await page.getByRole('button', { name: /demo ride/ }).click();
  await expect(page.locator('.next-card')).toContainText('Next view · 1 of 18');
  await expect(page.locator('.next-line')).toContainText(/km · (about|under)/);
  // The train doesn't wait for the welcome: it reaches Lake Biwa while it's playing, and queues it.
  await page.getByRole('button', { name: '30×' }).click();
  await expect(page.locator('.banner')).toContainText('Lake Biwa Country', { timeout: 20_000 });
  expect((await player(page)).id).toBe('intro');
  await finishClip(page);
  await expect.poll(async () => (await player(page)).id, { timeout: 10_000 }).toBe('biwa');
  // Delivery tags are hidden from the read-along text.
  await page.getByRole('button', { name: 'Read along' }).click();
  await expect(page.locator('.transcript')).toContainText('out of the tunnels');
  await expect(page.locator('.transcript')).not.toContainText('[excited]');
});

test('"Keep my music playing" ducks other audio only while a story plays', async ({ page }) => {
  // Safari's Audio Session API, stubbed so the wiring can be checked in Chromium.
  await page.addInitScript(() => {
    (navigator as any).audioSession = { type: 'auto', log: [] as string[] };
    const s = (navigator as any).audioSession;
    let t = 'auto';
    Object.defineProperty(s, 'type', { get: () => t, set: (v: string) => { t = v; s.log.push(v); } });
  });
  await page.goto('./#/tour/kiyomizu-dera');
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.locator('.sheet-handle').click();
  await page.getByText('Keep my music playing').click();
  await page.locator('.sheet-handle').click();
  const type = () => page.evaluate(() => (navigator as any).audioSession.type);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(type).toBe('ambient');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(type).toBe('transient');
  await expect.poll(async () => (await player(page)).playing).toBe(true);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(type).toBe('ambient');
});
