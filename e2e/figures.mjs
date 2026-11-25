// Screenshot der Figuren-Galerie: node e2e/figures.mjs [url] [ausgabe.png]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = (process.argv[2] ?? 'http://localhost:4173/') + '#figuren';
const out = process.argv[3] ?? 'e2e/out/figuren.png';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1500, height: 900 }, colorScheme: process.env.DARK ? 'dark' : 'light' })).newPage();
await p.goto(url);
await p.waitForSelector('.figure');
await p.addStyleTag({ content: '*{animation:none!important}' });
await p.waitForTimeout(400);
await p.screenshot({ path: out, fullPage: true });
await b.close();
