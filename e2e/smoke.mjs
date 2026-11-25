// End-to-End-Smoke-Test im iPhone-Viewport: node e2e/smoke.mjs [url]
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'e2e/out';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], colorScheme: process.env.DARK ? 'dark' : 'light' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const shot = async (n) => { await p.waitForTimeout(450); await p.screenshot({ path: `${out}/${n}.png` }); };
const click = (t, o = {}) => p.getByRole('button', { name: t, exact: o.exact ?? false }).first().click();
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('✓', m); };

await p.goto(url);
await p.waitForSelector('text=FORMA');
await shot('01-welcome');
await click('Einrichten');
await shot('02-about');
ok(await p.getByRole('button', { name: 'Weiter', exact: true }).isDisabled(), 'Weiter gesperrt ohne Pflichtangaben');
ok(await p.locator('input').nth(0).inputValue() === '', 'Geburtsjahr nicht vorbelegt');
ok(await p.locator('input').nth(1).inputValue() === '', 'Größe nicht vorbelegt');
await click('Männlich');
await p.locator('input').nth(0).fill('1980');
await p.locator('input').nth(1).fill('176');
await p.locator('input').nth(2).fill('82');
await p.locator('input').nth(3).fill('90');
await click('Weiter', { exact: true });
await click('Weiter', { exact: true });
await p.getByRole('button', { name: /Herz & Kreislauf/ }).click();
await p.getByText('Bluthochdruck', { exact: true }).click();
await p.getByRole('button', { name: /Gelenke, Rücken & Muskeln/ }).click();
await p.getByText('Kniearthrose oder Knorpelschaden').click();
await p.getByRole('searchbox').fill('Diabetes');
ok(await p.getByText('Diabetes Typ 2').isVisible(), 'Suche in der Gesundheitsauswahl');
await p.getByRole('searchbox').fill('');
ok(await p.getByText('Ausgewählt (2)').isVisible(), 'Zwei Angaben ausgewählt');
await shot('03-health');
await click('Weiter', { exact: true });
await click('6 Tage'.slice(0,0) || 'Weiter', { exact: true });
await p.getByText('Ich habe verstanden').click();
await click('Später – leicht einsteigen');
await p.waitForSelector('text=Heute');
await shot('04-today');
ok(await p.getByText('Kraft A').first().isVisible(), 'Tagesplan Kraft A sichtbar');

// Check-in
await p.getByText('Wie geht es dir heute?').click();
await p.locator('.sheet .scale button').nth(3).click();
await shot('05-checkin');
await p.locator('.sheet').getByRole('button', { name: 'Speichern' }).click();
await p.waitForTimeout(300);

// Workout
await click('Training starten');
await p.waitForSelector('.player');
await shot('06-player-work');
let guard = 0;
while (guard++ < 120) {
  if (await p.getByText('Zusammenfassung').isVisible().catch(() => false)) break;
  const fertig = p.getByRole('button', { name: 'Satz fertig' });
  const erledigt = p.getByRole('button', { name: 'Erledigt' });
  const weiter = p.getByRole('button', { name: 'Weiter', exact: true });
  if (guard === 3) await shot('07-player-step3');
  if (await weiter.isVisible().catch(() => false)) {
    const rir = p.locator('.chip.accent', { hasText: /^2$/ });
    if (await rir.isVisible().catch(() => false)) { await rir.click(); await p.getByRole('button', { name: 'Technik sauber' }).click(); if (!globalThis.restShot) { globalThis.restShot = 1; await shot('08-rest'); } }
    await weiter.click();
  } else if (await fertig.isVisible().catch(() => false)) await fertig.click();
  else if (await erledigt.isVisible().catch(() => false)) await erledigt.click();
  await p.waitForTimeout(60);
}
await shot('09-summary');
ok(await p.getByText('Zusammenfassung').isVisible(), 'Workout bis zur Zusammenfassung durchlaufen');
for (const c of await p.locator('.chip.accent', { hasText: '2 RIR' }).all()) await c.click();
await p.locator('.scale').first().locator('button').nth(6).click();
await click('Speichern');
await p.waitForSelector('text=Gut gemacht');
await shot('10-saved');
await click('Fertig');

// Persistenz nach Neuladen
await p.reload();
await p.waitForSelector('text=Heute');
await shot('11-today-after');
await p.locator('.tabbar').getByRole('button', { name: 'Historie' }).click();
ok(await p.getByText('Kraft A').first().isVisible(), 'Einheit nach Reload in Historie');
await shot('12-history');

// Messung + Aktivität
await p.locator('.tabbar').getByRole('button', { name: 'Fortschritt' }).click();
await shot('13-progress');
await p.getByRole('button', { name: '+ Messung' }).click();
await p.locator('input.input.num').first().fill('94,6');
await click('Speichern');
await p.locator('.tabbar').getByRole('button', { name: 'Heute' }).click();
await p.locator('.qa', { hasText: 'Aktivität' }).click();
await click('Speichern');
await p.waitForTimeout(200);
await shot('14-today-final');
await p.evaluate(() => window.scrollTo(0, 900));
await shot('14b-today-scrolled');

// Training-Tab, Bibliothek, Detail, Assessment-Start
await p.locator('.tabbar').getByRole('button', { name: 'Training' }).click();
await shot('15-training');
await p.getByText('Übungsbibliothek').click();
await shot('16-library');
await p.locator('.overlay .list-row').nth(3).click();
await shot('17-exercise');
await p.getByRole('button', { name: /Zurück/ }).first().click();
await p.getByRole('button', { name: /Zurück/ }).first().click();
await p.getByText('Standortbestimmung').first().click();
await click('Beginnen');
await shot('18-assessment');
for (let i = 0; i < 8; i++) await p.getByRole('button', { name: i === 7 ? 'Auswerten' : 'Weiter', exact: true }).click();
await shot('19-assessment-result');
await click('Übernehmen');
await p.waitForTimeout(200);

// Profil/Export
await p.locator('.tabbar').getByRole('button', { name: 'Profil' }).click();
await shot('20-profile');
ok(await p.getByText('2 Angaben').isVisible(), 'Profil zeigt Anzahl der Gesundheitsangaben');
await p.getByText('FORMA teilen').click();
await p.waitForSelector('.overlay svg rect, .overlay svg path', { timeout: 5000 });
ok(await p.getByText('QR-Code zum Einscannen').isVisible(), 'Teilen-Seite mit QR-Code');
await shot('24-share');
await p.getByRole('button', { name: /Zurück/ }).first().click();
await p.getByText('Daten, Backup & Export').click();
const [dl] = await Promise.all([p.waitForEvent('download'), click('Backup exportieren (JSON)')]);
const path = await dl.path();
const json = JSON.parse(fs.readFileSync(path, 'utf8'));
ok(json.format === 'forma-backup' && json.data.sessions.length === 1 && json.data.assessments.length === 1, 'Backup enthält Einheit und Assessment');
await shot('21-data');
await p.getByRole('button', { name: /Zurück/ }).first().click();
await p.getByText('Integrationen').click();
await shot('22-integrations');

// Offline: Service Worker vorhanden?
const sw = await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none');
console.log('Service Worker:', sw);
await ctx.setOffline(true);
await p.reload();
await p.waitForTimeout(2500);
await shot('23-offline');
ok(await p.locator('.tabbar').isVisible(), 'App lädt offline');
await ctx.setOffline(false);
console.log(errors.length ? 'FEHLER:\n' + errors.join('\n') : 'Keine Konsolenfehler');
await b.close();
