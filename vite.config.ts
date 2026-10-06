/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes the build's file list and a content hash into dist/sw.js, so the
 * installed app works offline from the first launch and every deploy is a
 * new, versioned app shell. Narration audio is left out: it's cached per
 * tour by "Save for offline" (or as it plays).
 */
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'walkingtour-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split(sep).join('/'));
        }
      };
      walk(outDir);
      const shell = files.filter((f) => f !== 'sw.js' && !f.endsWith('.mp3') && !f.startsWith('screenshots/')).sort();
      const hash = createHash('sha256');
      for (const f of shell) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("const VERSION = 'dev';", `const VERSION = '${hash.digest('hex').slice(0, 10)}';`)
        .replace("const PRECACHE = ['./'];", `const PRECACHE = ${JSON.stringify(['./', ...shell.filter((f) => f !== 'index.html')])};`);
      if (!sw.includes('const PRECACHE = [".')) throw new Error('sw.js precache placeholder not found');
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true },
  plugins: [precache()],
  test: { include: ['tests/**/*.test.ts'] },
});
