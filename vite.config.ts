/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
});
