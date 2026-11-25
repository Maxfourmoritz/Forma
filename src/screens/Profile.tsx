import { useEffect, useState } from 'preact/hooks';
import { data, nav, toast, useStore, applyTheme } from '../state';
import { repo } from '../db/repo';
import { createBackup, restoreBackup, validateBackup, offerFile, sessionsCSV, activitiesCSV, measurementsCSV, mealsCSV, listSnapshots, type BackupFile } from '../db/backup';
import { requestPersistence } from '../db/db';
import { EQUIPMENT_LABEL } from '../domain/exercises';
import { estimateTargets } from '../domain/nutrition';
import { profileSafetyNotes, STOP_RULES } from '../domain/safety';
import type { Equipment, Profile, Settings, Sex } from '../domain/types';
import { dayKey, fmtDate } from '../domain/util';
import { Card, Check, Chips, Field, NumInput, Row, SecTitle, Seg, Stepper, SubPage, Toggle } from '../ui/kit';
import { age, latestWeight } from './common';
import { checkVersion, forceUpdate, hardReload, type VersionInfo } from '../sw-register';
import { screeningFor } from '../domain/screening';
import { profileRules, withConditions } from '../domain/conditions';
import { ConditionPicker } from '../ui/ConditionPicker';


function UpdateCard() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => { setBusy(true); setInfo(await checkVersion()); setBusy(false); };
  return (
    <Card>
      <div class="title-m">Aktualisierung</div>
      <p class="small muted" style={{ margin: '4px 0 10px' }}>Installierte Version: Build {__BUILD_ID__} ({__BUILD_DATE__}).{info && (info.latest === undefined ? ' Der Server war nicht erreichbar – bist du online?' : info.newer ? ' Es gibt eine neuere Version.' : ' Du nutzt die aktuelle Version.')}</p>
      <div class="grid2">
        <button class="btn secondary" disabled={busy} onClick={check}>{busy ? 'Prüfe …' : 'Nach Updates suchen'}</button>
        <button class="btn primary" onClick={() => void forceUpdate()}>Jetzt aktualisieren</button>
      </div>
      <button class="btn plain small mt" onClick={() => void hardReload()}>Neu laden (App-Cache leeren, Daten bleiben erhalten)</button>
    </Card>
  );
}

function ShareSection() {
  const url = new URL('./', location.href).href;
  const [qr, setQr] = useState('');
  useEffect(() => {
    void import('qrcode-generator').then((m) => {
      const q = m.default(0, 'M');
      q.addData(url);
      q.make();
      setQr(q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
    }).catch(() => {});
  }, [url]);
  const text = 'FORMA – mein persönlicher Calisthenics- & Longevity-Coach (kostenlos, Daten bleiben auf deinem Gerät):';
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try { await navigator.share({ title: 'FORMA', text, url }); } catch (e) { if ((e as Error).name !== 'AbortError') toast('Teilen nicht möglich – bitte Link kopieren'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch { toast('Kopieren nicht möglich – Link markieren und kopieren'); }
  };
  return (
    <div class="stack">
      <Card>
        <div class="label">Link</div>
        <p class="num" style={{ margin: '6px 0 12px', wordBreak: 'break-all' }}>{url}</p>
        <div class="grid2">
          {canShare && <button class="btn primary" onClick={share}>Teilen …</button>}
          <button class={`btn ${canShare ? 'secondary' : 'primary'}`} onClick={copy}>Link kopieren</button>
        </div>
      </Card>
      {qr && (
        <Card class="center">
          <div class="label">QR-Code zum Einscannen</div>
          <div style={{ background: '#fff', borderRadius: 16, padding: 10, width: 220, margin: '12px auto 0' }} dangerouslySetInnerHTML={{ __html: qr }} />
          <p class="xs faint" style={{ margin: '10px 0 0' }}>Mit der Kamera-App scannen – öffnet FORMA direkt.</p>
        </Card>
      )}
      <SecTitle>Hinweise für deine Freunde</SecTitle>
      <Card class="small">
        <ul class="bullets" style={{ color: 'var(--text)', margin: 0 }}>
          <li><strong>Jeder hat seine eigenen Daten.</strong> FORMA speichert alles nur auf dem jeweiligen Gerät. Du siehst nichts von anderen, und niemand sieht deine Daten.</li>
          <li><strong>iPhone:</strong> Link in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“. Danach nur noch über das Symbol starten.</li>
          <li><strong>Android:</strong> In Chrome öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</li>
          <li><strong>Mac / PC:</strong> Safari ab macOS Sonoma: Teilen → „Zum Dock hinzufügen“. Chrome/Edge: Installieren-Symbol in der Adressleiste.</li>
          <li><strong>Backups:</strong> Beim Gerätewechsel gehen Daten nur über das Backup unter „Daten, Backup &amp; Export“ mit.</li>
          <li><strong>Essensfotos</strong> funktionieren nur mit eigenem Anthropic-API-Schlüssel und sind kostenpflichtig – sie sind optional. Teile deinen Schlüssel und deine Backup-Dateien nie mit anderen.</li>
        </ul>
      </Card>
      <Card class="warn small">
        <strong>Bitte mitgeben</strong>
        <p style={{ margin: '6px 0 0' }}>FORMA ist ein Trainingswerkzeug für gesunde Erwachsene und ersetzt keine ärztliche Beratung. Wer Vorerkrankungen hat oder unsicher ist, klärt vor dem Start mit Arzt oder Ärztin ab, welche Belastung passt.</p>
      </Card>
    </div>
  );
}

export function ProfileTab() {
  const d = useStore(data);
  const p = d.profile!;
  const go = (section: string) => nav.push({ name: 'settings', section });
  return (
    <div class="page">
      <header class="page-head">
        <div class="eyebrow">{age(p.birthYear)} Jahre · {p.heightCm} cm</div>
        <h1 class="title-xl display">Profil</h1>
      </header>
      <div class="list">
        <Row title="Persönliche Daten" icon="◉" onClick={() => go('profil')} />
        <Row title="Gesundheit & Sicherheit" sub={(() => { const r = profileRules(p); const n = p.conditions?.length ?? 0; return r.needsClearance && !r.cleared ? 'Ärztliche Freigabe ausstehend' : n ? `${n} ${n === 1 ? 'Angabe' : 'Angaben'}` : 'Keine Angaben'; })()} icon="✚" iconBg="var(--danger)" onClick={() => go('gesundheit')} />
        <Row title="Equipment" sub={p.equipmentHome.map((q) => EQUIPMENT_LABEL[q]).join(', ') || 'Nur Körpergewicht'} icon="▣" iconBg="var(--c-other)" onClick={() => go('equipment')} />
        <Row title="Trainingsrhythmus & Pulszonen" sub={`${p.daysPerWeek} Tage/Woche · ${p.defaultMinutes} min`} icon="◷" iconBg="var(--c-mobility)" onClick={() => go('rhythmus')} />
        <Row title="Ziele" icon="◎" onClick={() => go('ziele')} />
        <Row title="Ernährung" sub={p.nutrition.enabled ? 'aktiv' : 'aus'} icon="◒" iconBg="var(--c-cardio)" onClick={() => go('ernaehrung')} />
      </div>
      <div class="list mt-l">
        <Row title="FORMA teilen" sub="Link, QR-Code und Hinweise für Freunde" icon="↗" onClick={() => go('teilen')} />
        <Row title="Integrationen" sub="Apple Health, Watch, Oura – Status" icon="⇄" iconBg="var(--c-other)" onClick={() => go('integrationen')} />
        <Row title="Daten, Backup & Export" sub={d.settings.lastBackupAt ? `Letztes Backup ${fmtDate(d.settings.lastBackupAt)}` : 'Noch kein Backup'} icon="⇩" onClick={() => go('daten')} />
        <Row title="Darstellung & Ton" icon="◐" iconBg="var(--c-mobility)" onClick={() => go('darstellung')} />
        <Row title="Über FORMA" icon="i" iconBg="var(--c-other)" onClick={() => go('ueber')} />
      </div>
    </div>
  );
}

export function SettingsScreen({ section }: { section: string }) {
  const d = useStore(data);
  const [p, setP] = useState<Profile>(d.profile!);
  const [s, setS] = useState<Settings>(d.settings);
  const save = async (np: Profile) => { setP(np); await repo.saveProfile(np); };
  const saveS = async (ns: Settings) => { setS(ns); await repo.saveSettings(ns); applyTheme(ns.theme); };
  const titles: Record<string, string> = { profil: 'Persönliche Daten', gesundheit: 'Gesundheit & Sicherheit', equipment: 'Equipment', rhythmus: 'Rhythmus & Pulszonen', ziele: 'Ziele', ernaehrung: 'Ernährung', integrationen: 'Integrationen', daten: 'Daten & Backup', darstellung: 'Darstellung & Ton', ueber: 'Über FORMA', teilen: 'FORMA teilen' };

  return (
    <SubPage title={titles[section] ?? 'Einstellungen'}>
      {section === 'profil' && (
        <div class="stack">
          <Field label="Name (optional)"><input class="input" value={p.name ?? ''} onInput={(e) => save({ ...p, name: (e.target as HTMLInputElement).value || undefined })} /></Field>
          <Field label="Geschlecht"><Chips<Sex> value={p.sex ?? ('' as Sex)} options={[['maennlich', 'Männlich'], ['weiblich', 'Weiblich']]} onChange={(v) => save({ ...p, sex: v })} /></Field>
          <Field label="Geburtsjahr"><Stepper value={p.birthYear} min={1930} max={2010} onChange={(v) => save({ ...p, birthYear: v })} /></Field>
          <Field label="Körpergröße"><Stepper value={p.heightCm} min={140} max={220} suffix="cm" onChange={(v) => save({ ...p, heightCm: v })} /></Field>
          <Field label="Programmstart"><input class="input" type="date" value={p.programStart} onInput={(e) => save({ ...p, programStart: (e.target as HTMLInputElement).value || dayKey() })} /></Field>
          <p class="xs faint">Gewicht und Bauchumfang erfasst du als Messung (Fortschritt › Körper), damit der Verlauf erhalten bleibt.</p>
        </div>
      )}
      {section === 'gesundheit' && <Health p={p} save={save} />}
      {section === 'equipment' && (
        <div class="stack">
          <Field label="Zu Hause"><Chips wrap value={p.equipmentHome} options={(['matte', 'band', 'stange', 'ringe', 'tisch', 'stufe'] as Equipment[]).map((q) => [q, EQUIPMENT_LABEL[q]])} onChange={(v) => save({ ...p, equipmentHome: p.equipmentHome.includes(v) ? p.equipmentHome.filter((x) => x !== v) : [...p.equipmentHome, v] })} /></Field>
          <Field label="Auf Reisen"><Chips wrap value={p.equipmentTravel} options={(['band', 'matte'] as Equipment[]).map((q) => [q, EQUIPMENT_LABEL[q]])} onChange={(v) => save({ ...p, equipmentTravel: p.equipmentTravel.includes(v) ? p.equipmentTravel.filter((x) => x !== v) : [...p.equipmentTravel, v] })} /></Field>
          <Card class="tinted small">
            <strong>Empfehlung mit großer Wirkung</strong>
            <p style={{ margin: '6px 0 0' }}>Für Rücken und Schultern ist Ziehen entscheidend – mit reinem Körpergewicht ohne Hilfsmittel aber begrenzt. Ein Set <strong>Widerstandsbänder mit Türanker</strong> (leicht, reisetauglich) und eine <strong>Klimmzugstange für den Türrahmen</strong> schalten Band-Rudern, Latzug und die Klimmzug-Progression frei.</p>
          </Card>
        </div>
      )}
      {section === 'rhythmus' && (
        <div class="stack">
          <Field label="Aktive Tage pro Woche"><Stepper value={p.daysPerWeek} min={2} max={7} onChange={(v) => save({ ...p, daysPerWeek: v })} /></Field>
          <Field label="Standard-Trainingsdauer"><Chips value={p.defaultMinutes} options={[[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30'], [45, '45']]} onChange={(v) => save({ ...p, defaultMinutes: v })} /></Field>
          <SecTitle>Pulszonen</SecTitle>
          <p class="small muted" style={{ marginTop: 0 }}>Aus deiner Spiroergometrie übernehmen. FORMA nutzt sie für Ausdauerempfehlungen – Puls wird in der Web-Version nicht live gemessen.</p>
          <div class="grid2">
            <Field label="Rad Zone 1 von"><NumInput value={p.hr.z1Bike?.[0]} onChange={(v) => save({ ...p, hr: { ...p.hr, z1Bike: v ? [v, p.hr.z1Bike?.[1] ?? v + 10] : undefined } })} /></Field>
            <Field label="bis"><NumInput value={p.hr.z1Bike?.[1]} onChange={(v) => p.hr.z1Bike && v && save({ ...p, hr: { ...p.hr, z1Bike: [p.hr.z1Bike[0], v] } })} /></Field>
            <Field label="Laufen Zone 1 von"><NumInput value={p.hr.z1Run?.[0]} onChange={(v) => save({ ...p, hr: { ...p.hr, z1Run: v ? [v, p.hr.z1Run?.[1] ?? v + 10] : undefined } })} /></Field>
            <Field label="bis"><NumInput value={p.hr.z1Run?.[1]} onChange={(v) => p.hr.z1Run && v && save({ ...p, hr: { ...p.hr, z1Run: [p.hr.z1Run[0], v] } })} /></Field>
            <Field label="Max. Herzfrequenz (gemessen)"><NumInput value={p.hr.max} onChange={(v) => save({ ...p, hr: { ...p.hr, max: v } })} /></Field>
            <Field label="Schwelle VT2"><NumInput value={p.hr.vt2} onChange={(v) => save({ ...p, hr: { ...p.hr, vt2: v } })} /></Field>
          </div>
        </div>
      )}
      {section === 'ziele' && (
        <div class="stack">
          <p class="small muted" style={{ marginTop: 0 }}>Realistische Ziele, gemessen statt geschätzt. Häufig empfohlen wird ein Gewichtsverlust von etwa 0,5–1 % des Körpergewichts pro Woche, um Muskulatur zu erhalten – langsamer ist bei hohem Trainingsziel oft besser.</p>
          <Field label="Zielgewicht"><NumInput value={p.goals.weightKg} suffix="kg" onChange={(v) => save({ ...p, goals: { ...p.goals, weightKg: v } })} /></Field>
          <Field label="Ziel-Bauchumfang"><NumInput value={p.goals.waistCm} suffix="cm" onChange={(v) => save({ ...p, goals: { ...p.goals, waistCm: v } })} /></Field>
          <Field label="Saubere Liegestütze am Stück"><NumInput value={p.goals.pushups} onChange={(v) => save({ ...p, goals: { ...p.goals, pushups: v } })} /></Field>
          <Field label="Mein langfristiges Ziel (Freitext)"><textarea class="input" value={p.goals.note ?? ''} onInput={(e) => save({ ...p, goals: { ...p.goals, note: (e.target as HTMLTextAreaElement).value || undefined } })} /></Field>
          <p class="xs faint">Taille-Größe-Verhältnis unter 0,5 gilt allgemein als günstig. Bei {p.heightCm} cm entspricht das ca. {Math.round(p.heightCm * 0.5)} cm.</p>
        </div>
      )}
      {section === 'ernaehrung' && <Nutrition p={p} save={save} />}
      {section === 'integrationen' && <Integrations />}
      {section === 'teilen' && <ShareSection />}
      {section === 'daten' && <DataSection s={s} saveS={saveS} />}
      {section === 'darstellung' && (
        <div class="stack">
          <Field label="Erscheinungsbild"><Seg value={s.theme} options={[['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']]} onChange={(v) => saveS({ ...s, theme: v })} /></Field>
          <div class="list">
            <Row title="Tonsignale bei Timern" right={<Toggle on={s.sound} onChange={(v) => saveS({ ...s, sound: v })} />} />
            <Row title="Sprachansagen" sub="Übungsname und Ziel ansagen" right={<Toggle on={s.voice} onChange={(v) => saveS({ ...s, voice: v })} />} />
          </div>
          <p class="xs faint">Auf dem iPhone sind Töne nur hörbar, wenn der Stummschalter aus ist. Bei gesperrtem Bildschirm pausieren Web-Apps – FORMA hält den Bildschirm während des Trainings wach, wo das System es erlaubt.</p>
        </div>
      )}
      {section === 'ueber' && (
        <div class="stack">
          <UpdateCard />
          <Card>
            <div class="title-m">FORMA</div>
            <div class="small muted">Personal Strength & Longevity Coach · Version 1.0 · Build {__BUILD_DATE__}</div>
            <p class="small">Progressive Web App. Alle Daten werden ausschließlich lokal gespeichert (IndexedDB). Updates der App verändern die gespeicherten Daten nicht; vor Datenbank-Änderungen wird automatisch eine interne Sicherung angelegt.</p>
          </Card>
          <Card class="warn small">
            <strong>Medizinischer Hinweis</strong>
            <p style={{ margin: '6px 0 0' }}>FORMA ist ein Trainingswerkzeug, kein Medizinprodukt. Es stellt keine Diagnosen und ersetzt keine ärztliche oder physiotherapeutische Untersuchung. Bei Beschwerden, neuen Symptomen oder Unsicherheit bitte ärztlich abklären lassen.</p>
          </Card>
          <Card class="small">
            <strong>Datenqualität</strong>
            <p style={{ margin: '6px 0 0' }}>„Gemessen“ = objektive Messung (Waage, Maßband, Testzeit). „Erfasst“ = von dir protokolliert. „Subjektiv“ = Einschätzung (Schlafqualität, RPE). „Geschätzt“ = berechnete oder KI-gestützte Näherung (Kalorien, Körperfett per Waage). FORMA verzichtet bewusst auf zusammengesetzte „Fitness-Scores“.</p>
          </Card>
        </div>
      )}
    </SubPage>
  );
}

function Health({ p, save }: { p: Profile; save: (p: Profile) => void }) {
  const rules = profileRules(p);
  const notes = profileSafetyNotes(p);
  return (
    <div class="stack">
      <p class="small muted" style={{ margin: 0 }}>Wähle alles, was auf dich zutrifft. FORMA plant damit vorsichtiger: betroffene Übungen werden ersetzt oder ausgelassen, und bei Bedarf wird eine ärztliche Abstimmung empfohlen. Die Angaben bleiben auf deinem Gerät.</p>
      <ConditionPicker ids={p.conditions ?? []} sex={p.sex} onChange={(ids) => save(withConditions(p, ids))} />
      {rules.kneeHistory.length > 0 && (
        <Field label="Knie aktuell"><Chips value={p.kneeStatus} options={[['beschwerdefrei', 'Beschwerdefrei'], ['leicht', 'Leichte Beschwerden'], ['regelmaessig', 'Regelmäßig']]} onChange={(v) => save({ ...p, kneeStatus: v })} /></Field>
      )}
      {(rules.needsClearance || p.cardioClearance !== 'frei') && (
        <>
          <Field label="Ärztliche Freigabe für sportliche Belastung">
            <Seg value={p.cardioClearance} options={[['ausstehend', 'Ausstehend'], ['frei', 'Freigegeben'], ['eingeschraenkt', 'Mit Einschränkung']]} onChange={(v) => save({ ...p, cardioClearance: v })} />
          </Field>
          <p class="xs faint" style={{ margin: 0 }}>Erst auf „Freigegeben“ stellen, wenn die ärztliche Untersuchung erfolgt ist und keine Einschränkungen ausgesprochen wurden. Dann werden hochintensive Intervalle und – soweit nicht aus anderen Gründen gesperrt – Kopf-unten-Übungen freigeschaltet.</p>
        </>
      )}
      {notes.length > 0 && <Card class="warn small"><strong>So berücksichtigt FORMA das</strong><ul class="bullets" style={{ color: 'inherit' }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul></Card>}
      <SecTitle>Sofort aufhören bei</SecTitle>
      <Card class="small"><ul class="bullets" style={{ color: 'var(--text)', margin: 0 }}>{STOP_RULES.map((r) => <li key={r}>{r}</li>)}</ul></Card>
      <SecTitle>Wann abklären lassen?</SecTitle>
      <Card class="small">
        <ul class="bullets" style={{ color: 'var(--text)', margin: 0 }}>
          <li>Gelenkschmerzen, die länger als 1–2 Wochen anhalten oder wiederkehren (FORMA weist darauf hin, wenn eine Region an ≥3 Tagen innerhalb von 10 Tagen auftaucht).</li>
          <li>Schwellung, Instabilität oder Blockaden im Knie.</li>
          <li>Neue oder zunehmende Taubheit, Kribbeln oder Kraftverlust.</li>
          <li>Atemnot, die stärker ist als gewohnt, Brustschmerz, Herzstolpern.</li>
        </ul>
      </Card>
      <SecTitle>Screening</SecTitle>
      <div class="list">{screeningFor(p.sex).map((sq) => <Check key={sq.id} on={!!p.screening?.[sq.id]} onChange={(v) => save({ ...p, screening: { ...p.screening, [sq.id]: v } })}>{sq.q}</Check>)}</div>
      <Field label="Weitere Hinweise"><textarea class="input" value={p.otherConditions ?? ''} onInput={(e) => save({ ...p, otherConditions: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
    </div>
  );
}

function Nutrition({ p, save }: { p: Profile; save: (p: Profile) => void }) {
  const d = useStore(data);
  const [key, setKey] = useState<string>('');
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { void repo.apiKey().then((k) => setHasKey(!!k)); }, []);
  const w = latestWeight(d) ?? 90;
  const t = estimateTargets(p, w, age(p.birthYear));
  return (
    <div class="stack">
      {profileRules(p).noCalories && <Card class="warn small">Wegen deiner Angaben sind Kalorien- und Gewichtsfunktionen ausgeblendet. Du kannst sie bei Bedarf hier wieder einschalten – sprich bei Unsicherheit bitte mit deinem Behandlungsteam.</Card>}
      <div class="list"><Row title="Ernährung erfassen" right={<Toggle on={p.nutrition.enabled} onChange={(v) => save({ ...p, nutrition: { ...p.nutrition, enabled: v } })} />} /></div>
      <Card class="small">
        <strong>Startwerte (geschätzt)</strong>
        {!p.sex && <p class="small" style={{ margin: '6px 0 0', color: 'var(--warn)' }}>Geschlecht fehlt (Profil › Persönliche Daten) – bis dahin wird mit dem männlichen Wert gerechnet.</p>}
        <p style={{ margin: '6px 0 0' }}>Grundumsatz ca. {t.bmr} kcal (Mifflin-St-Jeor), Gesamtbedarf ca. {t.tdee} kcal bei aktivem Alltag. Vorschlag: ~{t.kcal} kcal/Tag (moderates Defizit) und ~{t.protein} g Eiweiß (≈1,6 g/kg) zum Muskelerhalt.</p>
        <p class="muted" style={{ margin: '6px 0 0' }}>Das sind rechnerische Näherungen – der Gewichtstrend über 2–4 Wochen zeigt, ob sie für dich passen. Bitte mit ärztlichen Empfehlungen abgleichen, insbesondere bei Medikamenten, die Appetit oder Gewicht beeinflussen.</p>
      </Card>
      <div class="grid2">
        <Field label="Kalorienziel"><NumInput value={p.nutrition.kcalTarget} placeholder={String(t.kcal)} suffix="kcal" onChange={(v) => save({ ...p, nutrition: { ...p.nutrition, kcalTarget: v } })} /></Field>
        <Field label="Eiweißziel"><NumInput value={p.nutrition.proteinTarget} placeholder={String(t.protein)} suffix="g" onChange={(v) => save({ ...p, nutrition: { ...p.nutrition, proteinTarget: v } })} /></Field>
        <Field label="Kohlenhydrate max."><NumInput value={p.nutrition.carbsMax} placeholder="optional" suffix="g" onChange={(v) => save({ ...p, nutrition: { ...p.nutrition, carbsMax: v } })} /></Field>
      </div>
      <SecTitle>KI-Fotoanalyse</SecTitle>
      <Card class="small">
        <p style={{ marginTop: 0 }}>Die Analyse von Essensfotos nutzt die Claude-API von Anthropic mit deinem eigenen API-Schlüssel (console.anthropic.com). Beim Analysieren wird das Foto (verkleinert) an Anthropic übertragen; es entstehen Kosten pro Foto gemäß Anthropic-Preisliste. Ohne Internet ist die Analyse nicht möglich.</p>
        <p class="muted" style={{ margin: 0 }}>Der Schlüssel wird nur auf diesem Gerät gespeichert und nie in Backups exportiert. Hinweis: Eine Web-App kann den Schlüssel nicht so stark schützen wie eine native App – nutze einen eigenen Schlüssel mit niedrigem Ausgabenlimit.</p>
      </Card>
      <Field label={hasKey ? 'API-Schlüssel gespeichert – zum Ersetzen neu eingeben' : 'Anthropic API-Schlüssel'}>
        <input class="input" type="password" autocomplete="off" placeholder="sk-ant-…" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value.trim())} />
      </Field>
      <div class="grid2">
        <button class="btn primary" disabled={!key} onClick={async () => { await repo.saveApiKey(key); setKey(''); setHasKey(true); toast('Schlüssel gespeichert'); }}>Speichern</button>
        <button class="btn danger" disabled={!hasKey} onClick={async () => { await repo.saveApiKey(''); setHasKey(false); toast('Schlüssel entfernt'); }}>Entfernen</button>
      </div>
    </div>
  );
}

function Integrations() {
  const items: { name: string; status: 'aktiv' | 'manuell' | 'nativ'; text: string }[] = [
    { name: 'Lokale Speicherung & Offline', status: 'aktiv', text: 'Funktioniert vollständig ohne Internet (nach der ersten Installation).' },
    { name: 'Export CSV/JSON & Backup', status: 'aktiv', text: 'Vollständig verfügbar unter Daten & Backup.' },
    { name: 'Claude-API (Essensfotos)', status: 'aktiv', text: 'Mit eigenem API-Schlüssel, benötigt Internet.' },
    { name: 'Apple Health / HealthKit', status: 'nativ', text: 'Web-Apps haben unter iOS keinen Zugriff auf HealthKit. Erfordert die native iOS-App (Xcode, Apple-Developer-Konto).' },
    { name: 'Apple Watch (Herzfrequenz live, Workouts)', status: 'nativ', text: 'Erfordert eine native watchOS-Erweiterung.' },
    { name: 'Schlaf, Ruhepuls, HRV', status: 'manuell', text: 'Im Tagesform-Check manuell eintragbar. Automatisch nur über HealthKit (nativ) möglich.' },
    { name: 'Oura Ring', status: 'manuell', text: 'Manuell eintragbar. Oura bietet eine Web-API mit Zugangsdaten; eine Anbindung ist möglich, aber noch nicht umgesetzt und wäre bei Oura gesondert zu prüfen.' },
    { name: 'Lauf-/Rad-/Peloton-Aktivitäten', status: 'manuell', text: 'Manuell erfassen. Automatisch über HealthKit in der nativen App.' },
    { name: 'iCloud-Synchronisierung', status: 'nativ', text: 'Nicht in der Web-App. Ersatz: Backup-Datei in iCloud Drive speichern.' },
  ];
  const label = { aktiv: 'Funktioniert', manuell: 'Manuell', nativ: 'Benötigt native App' } as const;
  const cls = { aktiv: 'gemessen', manuell: 'erfasst', nativ: 'geschaetzt' } as const;
  return (
    <div class="stack">
      <p class="small muted" style={{ margin: 0 }}>Ehrlicher Stand: FORMA zeigt keine Verbindung an, die nicht tatsächlich besteht.</p>
      <div class="list">
        {items.map((i) => <div key={i.name} class="list-row"><div class="grow"><div class="row between"><span>{i.name}</span><span class={`tag ${cls[i.status]}`}>{label[i.status]}</span></div><div class="small muted">{i.text}</div></div></div>)}
      </div>
      <Card class="tinted small">
        <strong>Weg zur nativen App</strong>
        <p style={{ margin: '6px 0 0' }}>Die Trainingslogik ist vom Oberflächen-Code getrennt (src/domain) und kann in eine native SwiftUI-App oder eine Capacitor-Hülle übernommen werden. Für HealthKit sind Xcode, ein Apple-Developer-Konto und die HealthKit-Berechtigungen nötig. Bestehende Daten lassen sich per JSON-Backup übernehmen.</p>
      </Card>
    </div>
  );
}

function DataSection({ s, saveS }: { s: Settings; saveS: (s: Settings) => void }) {
  const d = useStore(data);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [snaps, setSnaps] = useState<{ id: string; date: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    void navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB belegt`)).catch(() => {});
    void listSnapshots().then(setSnaps);
  }, []);
  const stamp = dayKey();

  const exportJSON = async (photos: boolean) => {
    setBusy(true);
    try {
      const b = await createBackup(photos);
      await offerFile(`forma-backup-${stamp}${photos ? '-mit-fotos' : ''}.json`, JSON.stringify(b), 'application/json');
      await saveS({ ...s, lastBackupAt: new Date().toISOString() });
      toast('Backup erstellt');
    } finally { setBusy(false); }
  };
  const pickFile = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((t) => {
      let parsed: unknown;
      try { parsed = JSON.parse(t); } catch { toast('Datei ist kein gültiges JSON'); return; }
      const v = validateBackup(parsed);
      if (!v.ok) { toast(v.error); return; }
      setPending(v.file);
    });
    (e.target as HTMLInputElement).value = '';
  };

  return (
    <div class="stack">
      <Card class="small">
        <div class="row between"><strong>Speicher</strong><span class="muted">{usage}</span></div>
        <p style={{ margin: '6px 0 0' }}>{persisted === true ? 'Dauerhafter Speicher ist aktiv – der Browser löscht die Daten nicht automatisch.' : persisted === false ? 'Der Browser hat dauerhaften Speicher (noch) nicht bestätigt. Als Home-Bildschirm-App genutzt, ist das Risiko nach meinem Kenntnisstand gering – regelmäßige Backups sind trotzdem wichtig.' : 'Status nicht abfragbar.'}</p>
        {persisted === false && <button class="btn tinted small mt" onClick={async () => setPersisted(await requestPersistence())}>Erneut anfragen</button>}
        <p class="muted" style={{ margin: '8px 0 0' }}>{d.sessions.length} Einheiten · {d.activities.length} Aktivitäten · {d.measurements.length} Messungen · {d.checkins.length} Check-ins · {d.meals.length} Mahlzeiten</p>
      </Card>
      <SecTitle>Backup</SecTitle>
      <button class="btn primary block" disabled={busy} onClick={() => exportJSON(false)}>Backup exportieren (JSON)</button>
      <button class="btn secondary block" disabled={busy} onClick={() => exportJSON(true)}>Backup inkl. Fotos exportieren</button>
      <p class="xs faint" style={{ margin: 0 }}>Auf dem iPhone öffnet sich das Teilen-Menü: „In Dateien sichern“ → iCloud Drive. Der API-Schlüssel ist nie enthalten.</p>
      <Field label="Erinnerung an Backup alle"><Chips value={s.backupReminderDays} options={[[7, '7 Tage'], [14, '14 Tage'], [30, '30 Tage']]} onChange={(v) => saveS({ ...s, backupReminderDays: v })} /></Field>
      <SecTitle>Wiederherstellen</SecTitle>
      <label class="btn secondary block" style={{ position: 'relative' }}>
        Backup-Datei wählen …
        <input type="file" accept="application/json,.json" onChange={pickFile} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
      </label>
      {pending && (
        <Card class="warn small">
          <strong>Backup vom {fmtDate(pending.exportedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
          <p style={{ margin: '6px 0' }}>{(pending.data.sessions ?? []).length} Einheiten, {(pending.data.activities ?? []).length} Aktivitäten, {(pending.data.measurements ?? []).length} Messungen{pending.includesPhotos ? ', inkl. Fotos' : ''}. Die aktuellen Daten werden ersetzt; vorher legt FORMA automatisch eine interne Sicherung an.</p>
          <div class="grid2">
            <button class="btn secondary" onClick={() => setPending(null)}>Abbrechen</button>
            <button class="btn primary" onClick={async () => { setBusy(true); try { await restoreBackup(pending); toast('Wiederhergestellt'); setPending(null); setSnaps(await listSnapshots()); } catch (e) { toast(`Fehler: ${(e as Error).message}`); } finally { setBusy(false); } }}>Wiederherstellen</button>
          </div>
        </Card>
      )}
      {snaps.length > 0 && (
        <>
          <SecTitle>Interne Sicherungen</SecTitle>
          <div class="list">{snaps.slice(0, 5).map((sn) => <Row key={sn.id} title={sn.reason} sub={fmtDate(sn.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} right={<button class="btn plain small" onClick={async () => { const all = await listSnapshots(); const full = all.find((x) => x.id === sn.id); if (full) await offerFile(`forma-sicherung-${sn.id}.json`, JSON.stringify({ format: 'forma-backup', version: 1, schema: 1, exportedAt: sn.date, includesPhotos: false, data: full.data }), 'application/json'); }}>Export</button>} />)}</div>
        </>
      )}
      <SecTitle>Export für Tabellen (CSV)</SecTitle>
      <div class="list">
        <Row title="Trainings (pro Satz)" onClick={() => offerFile(`forma-training-${stamp}.csv`, sessionsCSV(d.sessions), 'text/csv')} />
        <Row title="Aktivitäten" onClick={() => offerFile(`forma-aktivitaeten-${stamp}.csv`, activitiesCSV(d.activities), 'text/csv')} />
        <Row title="Messungen" onClick={() => offerFile(`forma-messungen-${stamp}.csv`, measurementsCSV(d.measurements), 'text/csv')} />
        <Row title="Ernährung" onClick={() => offerFile(`forma-ernaehrung-${stamp}.csv`, mealsCSV(d.meals), 'text/csv')} />
      </div>
      <p class="xs faint">CSV mit Semikolon und Dezimalkomma – öffnet direkt in Numbers und deutschem Excel.</p>
    </div>
  );
}
