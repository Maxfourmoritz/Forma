import { useState } from 'preact/hooks';
import { repo } from '../db/repo';
import { requestPersistence } from '../db/db';
import { defaultStates } from '../domain/assessment';
import { EQUIPMENT_LABEL } from '../domain/exercises';
import type { Equipment, Profile, Sex } from '../domain/types';
import { dayKey, uid } from '../domain/util';
import { Check, Chips, Field, NumInput, Stepper } from '../ui/kit';
import { Figure } from '../ui/Figure';
import { nav } from '../state';
import { screeningFor } from '../domain/screening';
import { profileRules, withConditions } from '../domain/conditions';
import { ConditionPicker } from '../ui/ConditionPicker';

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const EQ_OPTIONS: Equipment[] = ['matte', 'band', 'stange', 'ringe', 'tisch', 'stufe'];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>({
    birthYear: 0, heightCm: 0, sex: undefined, startWeightKg: undefined, startWaistCm: undefined,
    kneeHistory: [], kneeStatus: 'beschwerdefrei', neuropathy: false, cardioClearance: 'frei', bpMeds: false,
    hr: {}, equipmentHome: ['matte'], equipmentTravel: [], daysPerWeek: 5, defaultMinutes: 15,
    conditions: [], goals: {}, nutrition: { enabled: true }, screening: {}, programStart: dayKey(), createdAt: new Date().toISOString(),
  });
  const set = (o: Partial<Profile>) => setP({ ...p, ...o });
  const [ack, setAck] = useState(false);
  const rules = profileRules(p);
  const anyYes = screeningFor(p.sex).some((q) => p.screening?.[q.id]);
  const year = new Date().getFullYear();
  const validBody = !!p.sex && p.birthYear >= 1920 && p.birthYear <= year - 18 && p.heightCm >= 120 && p.heightCm <= 230;

  const finish = async (toAssessment: boolean) => {
    await repo.saveProfile(p);
    await repo.saveStates(defaultStates());
    if (p.startWeightKg || p.startWaistCm) await repo.saveMeasurement({ id: uid(), date: new Date().toISOString(), weightKg: p.startWeightKg, waistCm: p.startWaistCm });
    await requestPersistence();
    onDone();
    if (toAssessment) nav.push({ name: 'assessment' });
  };

  const steps = [
    // 0 Willkommen
    <div class="stack" key="0">
      <div class="fig-box" style={{ padding: 10 }}><Figure anim="squat?depth=par" /></div>
      <h1 class="title-xl display" style={{ margin: 0 }}>FORMA</h1>
      <p class="title-m muted" style={{ margin: 0, fontWeight: 500 }}>Personal Strength & Longevity Coach</p>
      <p class="muted">Täglich ein klarer Vorschlag, 5–45 Minuten, mit dem eigenen Körpergewicht – zu Hause, im Hotel oder draußen. Deine Daten bleiben auf diesem Gerät.</p>
      <p class="small faint">FORMA ersetzt keine ärztliche Beratung und stellt keine Diagnosen. Bei Beschwerden oder Unsicherheit bitte ärztlich abklären.</p>
      {!isStandalone() && (
        <div class="card tinted small">
          <strong>Tipp: Als App installieren</strong>
          <p style={{ margin: '6px 0 0' }}>Damit deine Daten dauerhaft gespeichert bleiben und FORMA im Vollbild läuft: in Safari auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen (Android/Chrome: Menü ⋮ → „App installieren“). Danach FORMA über das neue Symbol starten – deine Eingaben hier bleiben nicht erhalten, wenn du die Seite danach wechselst, daher am besten gleich zuerst installieren.</p>
        </div>
      )}
    </div>,
    // 1 Körper
    <div class="stack" key="1">
      <h1 class="title-l display">Über dich</h1>
      <Field label="Geschlecht"><Chips<Sex> value={p.sex ?? ('' as Sex)} options={[['maennlich', 'Männlich'], ['weiblich', 'Weiblich']]} onChange={(v) => set({ sex: v })} /></Field>
      <div class="grid2">
        <Field label="Geburtsjahr"><NumInput value={p.birthYear || undefined} placeholder="z. B. 1975" step="1" onChange={(v) => set({ birthYear: v ? Math.round(v) : 0 })} /></Field>
        <Field label="Körpergröße"><NumInput value={p.heightCm || undefined} placeholder="z. B. 175" suffix="cm" step="1" onChange={(v) => set({ heightCm: v ? Math.round(v) : 0 })} /></Field>
      </div>
      <div class="grid2">
        <Field label="Gewicht (optional)"><NumInput value={p.startWeightKg} suffix="kg" onChange={(v) => set({ startWeightKg: v })} /></Field>
        <Field label="Bauchumfang (optional)"><NumInput value={p.startWaistCm} suffix="cm" onChange={(v) => set({ startWaistCm: v })} /></Field>
      </div>
      <p class="xs faint" style={{ margin: 0 }}>Bauchumfang auf Nabelhöhe, nach dem Ausatmen. Geschlecht, Alter und Größe nutzt FORMA nur für die Schätzung des Kalorienbedarfs und für angemessene Startwerte. FORMA ist für Erwachsene ab 18 Jahren gedacht.</p>
    </div>,
    // 2 Screening
    <div class="stack" key="2">
      <h1 class="title-l display">Gesundheits-Check</h1>
      <p class="muted small" style={{ margin: 0 }}>Kurzes Screening vor Trainingsbeginn. Ein „Ja“ heißt nicht, dass du nicht trainieren darfst – nur, dass eine ärztliche Rücksprache sinnvoll ist.</p>
      <div class="list">
        {screeningFor(p.sex).map((s) => <Check key={s.id} on={!!p.screening?.[s.id]} onChange={(v) => set({ screening: { ...p.screening, [s.id]: v } })}>{s.q}</Check>)}
      </div>
      {anyYes && <div class="card warn small">Bitte kläre mit deiner Ärztin oder deinem Arzt, welche Belastung für dich passt. FORMA startet konservativ.</div>}
    </div>,
    // 3 Gesundheit
    <div class="stack" key="3">
      <h1 class="title-l display">Gesundheit & Beschwerden</h1>
      <p class="muted small" style={{ margin: 0 }}>Wähle alles, was auf dich zutrifft – so plant FORMA vorsichtiger und weist auf ärztliche Abstimmung hin. Die Liste ist bewusst breit; nichts davon ist Pflicht. Deine Angaben bleiben auf deinem Gerät und lassen sich jederzeit im Profil ändern.</p>
      <ConditionPicker ids={p.conditions ?? []} sex={p.sex} onChange={(ids) => setP(withConditions(p, ids))} />
      {rules.kneeHistory.length > 0 && (
        <Field label="Knie aktuell"><Chips value={p.kneeStatus} options={[['beschwerdefrei', 'Beschwerdefrei'], ['leicht', 'Leichte Beschwerden'], ['regelmaessig', 'Regelmäßig']]} onChange={(v) => set({ kneeStatus: v })} /></Field>
      )}
      {rules.needsClearance && (
        <Field label="Liegt eine ärztliche Freigabe für sportliche Belastung vor?">
          <Chips value={p.cardioClearance} options={[['ausstehend', 'Noch nicht geklärt'], ['frei', 'Ja, freigegeben'], ['eingeschraenkt', 'Mit Einschränkung']]} onChange={(v) => set({ cardioClearance: v })} />
          <span class="xs faint">Solange sie nicht bestätigt ist, bleiben hochintensive Intervalle und Kopf-unten-Übungen gesperrt.</span>
        </Field>
      )}
      <Field label="Weitere Hinweise (optional)"><textarea class="input" value={p.otherConditions ?? ''} onInput={(e) => set({ otherConditions: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
    </div>,
    // 4 Equipment & Rhythmus
    <div class="stack" key="4">
      <h1 class="title-l display">Equipment & Rhythmus</h1>
      <p class="muted small" style={{ margin: 0 }}>Wand, Stuhl, Tür, Handtuch und Bettkante setzt FORMA überall voraus.</p>
      <Field label="Zu Hause vorhanden"><Chips wrap value={p.equipmentHome} options={EQ_OPTIONS.map((q) => [q, EQUIPMENT_LABEL[q]])} onChange={(v) => set({ equipmentHome: p.equipmentHome.includes(v) ? p.equipmentHome.filter((x) => x !== v) : [...p.equipmentHome, v] })} /></Field>
      <Field label="Auf Reisen dabei"><Chips wrap value={p.equipmentTravel} options={(['band', 'matte'] as Equipment[]).map((q) => [q, EQUIPMENT_LABEL[q]])} onChange={(v) => set({ equipmentTravel: p.equipmentTravel.includes(v) ? p.equipmentTravel.filter((x) => x !== v) : [...p.equipmentTravel, v] })} /></Field>
      <Field label="Aktive Tage pro Woche"><Stepper value={p.daysPerWeek} min={2} max={7} onChange={(v) => set({ daysPerWeek: v })} /></Field>
      <Field label="Übliche Trainingszeit"><Chips value={p.defaultMinutes} options={[[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']]} onChange={(v) => set({ defaultMinutes: v })} /></Field>
      <div class="list"><Check on={p.nutrition.enabled} onChange={(v) => set({ nutrition: { ...p.nutrition, enabled: v } })}>Ernährung mit erfassen (Essensfotos, Eiweiß, Kalorien)</Check></div>
    </div>,
    // 5 Fertig
    <div class="stack" key="5">
      <h1 class="title-l display">Fast geschafft</h1>
      <p class="muted">Als Nächstes empfiehlt sich die Standortbestimmung: 8 sichere Tests, aus denen FORMA deine Einstiegsvarianten ableitet. Du kannst auch sofort mit einem leichten Einstieg beginnen und den Test später machen.</p>
      <div class="card small">
        <strong>Datenschutz & Datensicherheit</strong>
        <p class="muted" style={{ margin: '6px 0 0' }}>Alle Daten liegen ausschließlich lokal in diesem Browser-Speicher. Installiere FORMA über „Zum Home-Bildschirm“ und exportiere regelmäßig ein Backup (Profil › Daten) – z. B. nach iCloud Drive.</p>
      </div>
      <div class="list"><Check on={ack} onChange={setAck}>Ich habe verstanden: FORMA ersetzt keine ärztliche oder physiotherapeutische Beratung, stellt keine Diagnosen, und ich trainiere eigenverantwortlich.</Check></div>
    </div>,
  ];

  return (
    <div class="page sub" style={{ paddingTop: 'calc(var(--safe-top) + 24px)', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div class="row" style={{ gap: 4, marginBottom: 20 }}>{steps.map((_, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--fill)' }} />)}</div>
      <div style={{ flex: 1 }}>{steps[step]}</div>
      <div class="stack mt-l">
        {step < steps.length - 1 ? (
          <button class="btn primary xl block" disabled={step === 1 && !validBody} onClick={() => setStep(step + 1)}>{step === 0 ? 'Einrichten' : 'Weiter'}</button>
        ) : (
          <>
            <button class="btn primary xl block" disabled={!ack} onClick={() => finish(true)}>Zur Standortbestimmung</button>
            <button class="btn secondary block" disabled={!ack} onClick={() => finish(false)}>Später – leicht einsteigen</button>
          </>
        )}
        {step === 1 && !validBody && <p class="xs faint center" style={{ margin: 0 }}>Bitte Geschlecht, Geburtsjahr (ab 18 Jahren) und Körpergröße angeben.</p>}
        {step > 0 && <button class="btn plain block" onClick={() => setStep(step - 1)}>Zurück</button>}
      </div>
    </div>
  );
}
