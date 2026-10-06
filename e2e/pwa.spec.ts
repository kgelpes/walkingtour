import { expect, test } from '@playwright/test';

test('installable PWA: manifest is valid and Chrome reports no installability errors', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // Test browsers are incognito profiles, which Chrome never installs from; anything else is a real problem.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([]);
  const { errors: manifestErrors } = await cdp.send('Page.getAppManifest');
  expect(manifestErrors).toEqual([]);
});

test('the whole app works offline right after the first visit, without saving anything', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Precache finished during install; nothing else was opened.
  await context.setOffline(true);
  await page.goto('./#/tour/shinkansen-kyoto-tokyo');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shinkansen to Tokyo');
  await page.goto('./#/tour/kiyomizu-dera');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kiyomizu-dera');
  await context.setOffline(false);
});
