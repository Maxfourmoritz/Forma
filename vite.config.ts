import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BUILD_ID = Date.now().toString(36);

/** Erzeugt sw.js mit Precache-Liste aller Build-Dateien (Offline-Fähigkeit). */
function serviceWorker(): Plugin {
  return {
    name: 'forma-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const statics = ['./', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'];
      const assets = [...new Set([...statics, ...files.map((f) => `./${f}`)])];
      const hash = createHash('sha256').update(assets.join('|') + Object.values(bundle).map((b) => ('code' in b ? b.code : String(b.source))).join('')).digest('hex').slice(0, 12);
      const tpl = readFileSync('src/sw-template.js', 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl.replace('__VERSION__', hash).replace('__ASSETS__', JSON.stringify(assets)) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: hash, build: BUILD_ID, built: new Date().toISOString() }) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
