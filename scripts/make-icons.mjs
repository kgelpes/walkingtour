#!/usr/bin/env node
// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, maskable] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180, true], ['icon-maskable-512.png', 512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable/iOS icons are full-bleed squares; the platform applies its own rounding.
  const body = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${body}`);
  await page.screenshot({ path: out(file), omitBackground: !maskable });
}
await browser.close();
