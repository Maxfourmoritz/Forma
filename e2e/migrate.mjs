// Bestandsprofil (vor der Gesundheitsauswahl) wird beim Laden automatisch in die Auswahl übernommen.
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('✓', m); };
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['iPhone 15 Pro'] })).newPage();
await p.goto('http://localhost:4173/');
await p.waitForSelector('text=FORMA');
await p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('forma'); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ sex: 'maennlich', birthYear: 1975, heightCm: 180, kneeHistory: ['meniskus', 'kreuzband'], kneeStatus: 'beschwerdefrei', neuropathy: true, cardioClearance: 'ausstehend', bpMeds: true, hr: {}, equipmentHome: ['matte'], equipmentTravel: [], daysPerWeek: 5, defaultMinutes: 15, goals: {}, nutrition: { enabled: true }, programStart: '2026-11-01', createdAt: new Date().toISOString() }, 'profile'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); }));
await p.reload();
await p.waitForSelector('.tabbar');
await p.locator('.tabbar').getByRole('button', { name: 'Profil' }).click();
ok(await p.getByText('Ärztliche Freigabe ausstehend').isVisible(), 'Freigabe-Status übernommen');
await p.getByText('Gesundheit & Sicherheit').click();
ok(await p.getByText('Ausgewählt (5)').isVisible(), 'Bestandsangaben als 5 Auswahlpunkte übernommen');
for (const t of ['Meniskusriss', 'Kreuzbandverletzung', 'Gefühlsstörungen', 'pulssenkende', 'ärztliche Abklärung meiner']) ok(await p.getByText(t).first().isVisible().catch(() => false) || (await p.locator('.chip.on', { hasText: t.split(' ')[0] }).count()) > 0, 'Auswahl enthält: ' + t);
await b.close();
