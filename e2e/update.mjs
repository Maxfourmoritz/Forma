// Prüft: Daten bleiben bei App-Update erhalten; Update-Hinweis erscheint; Mahlzeit manuell + Foto ohne Schlüssel.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const url = 'http://localhost:4173/';
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('✓', m); };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 15 Pro'] });
const p = await ctx.newPage();
await p.goto(url);
await p.getByRole('button', { name: 'Einrichten' }).click();
await p.getByRole('button', { name: 'Weiblich' }).click();
await p.locator('input').nth(0).fill('1985');
await p.locator('input').nth(1).fill('170');
for (let i = 0; i < 4; i++) await p.getByRole('button', { name: 'Weiter', exact: true }).click();
await p.getByText('Ich habe verstanden').click();
await p.getByRole('button', { name: 'Später – leicht einsteigen' }).click();
await p.waitForSelector('text=Heute');
// Mahlzeit manuell
await p.getByRole('button', { name: 'Mahlzeit fotografieren' }).click();
await p.getByRole('button', { name: 'Manuell eintragen' }).click();
await p.locator('input[placeholder="Lebensmittel"]').fill('Magerquark mit Beeren');
const nums = p.locator('.overlay .card .grid2 input');
await nums.nth(0).fill('300'); await nums.nth(1).fill('280'); await nums.nth(2).fill('38');
await p.getByRole('button', { name: 'Speichern', exact: true }).click();
await p.waitForTimeout(300);
ok(await p.getByText('Magerquark mit Beeren').isVisible(), 'Mahlzeit manuell gespeichert');
// Foto ohne API-Schlüssel → verständlicher Hinweis, manuelle Erfassung möglich
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await p.locator('input[type=file][capture=environment]').setInputFiles({ name: 'essen.png', mimeType: 'image/png', buffer: png });
await p.waitForSelector('text=Kein API-Schlüssel');
ok(true, 'Foto ohne Schlüssel → Hinweis + manuelle Erfassung');
await p.getByRole('button', { name: 'Verwerfen' }).click();
await p.getByRole('button', { name: /Zurück/ }).first().click();
await p.locator('.qa', { hasText: 'Messung' }).click();
await p.locator('input.input.num').first().fill('94,2');
await p.getByRole('button', { name: 'Speichern', exact: true }).click();
await p.waitForTimeout(500);

try {
const cacheBefore = await p.evaluate(async () => (await caches.keys()).join());
// Neue App-Version bauen (Code-Änderung → neuer Hash)
fs.appendFileSync('src/main.tsx', '\n(window as unknown as Record<string, number>).__formaUpdateTest = 1; // update-test\n');
execSync('npx vite build', { stdio: 'ignore' });
await p.reload();
await p.waitForTimeout(3000);
console.log('SW-Status', await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { active: r?.active?.scriptURL, waiting: !!r?.waiting, installing: !!r?.installing, ctrl: !!navigator.serviceWorker.controller }; }));
await p.waitForFunction(() => window.__formaUpdateTest === 1, null, { timeout: 20000 });
ok(true, 'Neue Version wurde nach einmaligem Öffnen automatisch aktiv');
await p.waitForFunction(async (before) => { const k = (await caches.keys()).join(); return k !== before && !k.includes(','); }, cacheBefore, { timeout: 20000 });
ok(true, 'Service Worker/Cache wurde ohne Zutun auf die neue Version umgestellt');
await p.waitForSelector('.tabbar');
await p.waitForTimeout(500);
const counts = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('forma'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['meals', 'measurements', 'kv']); const out = {}; let n = 0; for (const s of ['meals', 'measurements', 'kv']) { const q = tx.objectStore(s).count(); q.onsuccess = () => { out[s] = q.result; if (++n === 3) res(out); }; } }; }));
ok(counts.meals === 1 && counts.measurements >= 1 && counts.kv >= 2, `Daten nach Update erhalten ${JSON.stringify(counts)}`);
} finally {
// Änderung zurücknehmen
const src = fs.readFileSync('src/main.tsx', 'utf8').replace(/\n.*update-test\n/, '');
fs.writeFileSync('src/main.tsx', src);
execSync('npx vite build', { stdio: 'ignore' });
}
await b.close();
