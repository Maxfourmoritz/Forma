import { useEffect, useState } from 'preact/hooks';
import { data, nav, toast, useStore } from '../state';
import { repo } from '../db/repo';
import { TESTS, deriveLevels, statesFromDerived, type Derived } from '../domain/assessment';
import { EXERCISE_MAP, PATHS } from '../domain/exercises';
import { equipmentFor } from '../domain/planner';
import { resolve } from '../domain/progression';
import type { AssessmentResult, PathId } from '../domain/types';
import { fmtClock, uid } from '../domain/util';
import { Card, Check, Chips, Field, NumInput, Stepper, SubPage } from '../ui/kit';
import { Figure } from '../ui/Figure';
import { beep, unlockAudio } from '../ui/audio';

function Timer({ max, onStop }: { max: number; onStop: (sec: number) => void }) {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!start) return; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, [start]);
  const el = start ? Math.min(max, (now - start) / 1000) : 0;
  useEffect(() => { if (start && el >= max) { beep('done'); onStop(max); setStart(null); } }, [el]);
  return (
    <div class="card tight center">
      <div class="num" style={{ fontSize: 48, fontWeight: 700 }}>{fmtClock(el)}</div>
      {start ? <button class="btn primary block" onClick={() => { beep('done'); onStop(Math.round(el)); setStart(null); }}>Stopp</button>
        : <button class="btn tinted block" onClick={() => { unlockAudio(); beep('go'); setStart(Date.now()); setNow(Date.now()); }}>Timer starten (max. {max} s)</button>}
    </div>
  );
}

const INITIAL: AssessmentResult = {
  pushVariant: 'schraeg_hoch', pushReps: 10, chairStand30s: 12, plankSec: 30, sidePlankKnees: false, sidePlankL: 20, sidePlankR: 20,
  singleLegL: 20, singleLegR: 20, bridgeSingleL: 6, bridgeSingleR: 6, proneYHoldSec: 20, toeTouch: 'schienbein', deepSquat30s: 'ausgelassen',
};

export function AssessmentScreen() {
  const d = useStore(data);
  const prev = d.assessments[0]?.results;
  const [r, setR] = useState<AssessmentResult>(prev ? { ...prev } : INITIAL);
  const [i, setI] = useState(-1);
  const [result, setResult] = useState<Derived | null>(null);
  const eq = equipmentFor(d.profile!, 'zuhause');
  const set = (p: Partial<AssessmentResult>) => setR({ ...r, ...p });
  const t = i >= 0 && i < TESTS.length ? TESTS[i] : undefined;

  const finish = () => setResult(deriveLevels(r, d.profile!, eq));
  const save = async () => {
    if (!result) return;
    await repo.saveAssessment({ id: uid(), date: new Date().toISOString(), results: r, levels: result.levels, notes: result.notes, focus: result.focus });
    await repo.saveStates(statesFromDerived(result, d.states));
    toast('Standortbestimmung gespeichert – Plan aktualisiert');
    nav.pop();
  };

  if (result) {
    return (
      <SubPage title="Ergebnis">
        <h1 class="title-l display" style={{ margin: '4px 0' }}>Dein Einstiegsniveau</h1>
        <p class="muted">Abgeleitet aus deinen Testwerten, bewusst konservativ. FORMA passt die Stufen nach jeder Einheit an.</p>
        <div class="list">
          {(Object.keys(result.levels) as PathId[]).map((p) => {
            const ex = resolve(p, result.levels[p]!, eq)?.exercise ?? EXERCISE_MAP[PATHS[p].levels[result.levels[p]!][0]];
            return <div key={p} class="list-row"><div class="grow"><div>{PATHS[p].name}</div><div class="small muted">{ex.name} · Ziel {result.targets[p] ?? '–'} {ex.mode === 'reps' ? 'Wdh.' : 's'}</div></div><span class="pill num">Stufe {result.levels[p]! + 1}/{PATHS[p].levels.length}</span></div>;
          })}
        </div>
        {result.notes.length > 0 && <Card class="mt"><ul class="bullets" style={{ color: 'var(--text)' }}>{result.notes.map((n) => <li key={n}>{n}</li>)}</ul></Card>}
        <button class="btn primary xl block mt-l" onClick={save}>Übernehmen</button>
        <button class="btn secondary block mt" onClick={() => { setResult(null); setI(TESTS.length - 1); }}>Werte korrigieren</button>
      </SubPage>
    );
  }

  if (!t) {
    return (
      <SubPage title="Standortbestimmung">
        <h1 class="title-l display" style={{ margin: '4px 0' }}>Wo stehst du?</h1>
        <p class="muted">8 kurze Tests, ca. 20 Minuten. Kein Test geht bis zum Muskelversagen – du stoppst, sobald die Technik nachlässt. Wiederhole die Standortbestimmung alle 6 Wochen, um deine Entwicklung objektiv zu sehen.</p>
        <Card class="warn">
          <strong>Vorher</strong>
          <ul class="bullets" style={{ color: 'inherit' }}>
            <li>5 Minuten aufwärmen (Marschieren, Armkreisen, halbe Kniebeugen).</li>
            <li>Stabiler Stuhl, Wand in Reichweite, Matte.</li>
            <li>Bei Schmerz, Schwindel oder ungewöhnlicher Atemnot: abbrechen.</li>
          </ul>
        </Card>
        <div class="list mt">{TESTS.map((x, k) => <div key={x.id} class="list-row"><span class="num muted" style={{ width: 20 }}>{k + 1}</span><div class="grow"><div>{x.title}</div><div class="small muted">{x.what}</div></div></div>)}</div>
        <button class="btn primary xl block mt-l" onClick={() => setI(0)}>Beginnen</button>
      </SubPage>
    );
  }

  return (
    <SubPage title={`Test ${i + 1} von ${TESTS.length}`} onBack={() => setI(i - 1)}>
      <div class="eyebrow">{t.what}</div>
      <h1 class="title-l display" style={{ margin: '4px 0 12px' }}>{t.title}</h1>
      <div class="fig-box"><Figure anim={t.anim} /></div>
      <ol class="mt" style={{ paddingLeft: 20 }}>{t.how.map((h) => <li key={h} style={{ margin: '6px 0' }}>{h}</li>)}</ol>
      <p class="small" style={{ color: 'var(--warn)' }}>{t.safety}</p>
      <div class="stack mt">
        {t.id === 'push' && (<>
          <Field label="Schwerste saubere Variante"><Chips value={r.pushVariant} options={[['wand', 'Wand'], ['schraeg_hoch', 'Tischkante'], ['schraeg_tief', 'Stuhl'], ['boden', 'Boden']]} onChange={(v) => set({ pushVariant: v })} /></Field>
          <Field label="Saubere Wiederholungen"><Stepper value={r.pushReps} onChange={(v) => set({ pushReps: v })} max={80} /></Field>
        </>)}
        {t.id === 'chair' && (<>
          <Timer max={30} onStop={() => {}} />
          <Field label="Anzahl Aufstehen in 30 s"><Stepper value={r.chairStand30s} onChange={(v) => set({ chairStand30s: v })} max={50} /></Field>
          <div class="list"><Check on={!!r.chairStandPain} onChange={(v) => set({ chairStandPain: v })}>Knieschmerz beim Test</Check></div>
        </>)}
        {t.id === 'plank' && (<>
          <Timer max={90} onStop={(s) => set({ plankSec: s })} />
          <Field label="Haltezeit"><Stepper value={r.plankSec} step={5} onChange={(v) => set({ plankSec: v })} max={90} suffix="s" /></Field>
        </>)}
        {t.id === 'side' && (<>
          <Timer max={60} onStop={() => {}} />
          <div class="grid2">
            <Field label="Links"><Stepper value={r.sidePlankL} step={5} onChange={(v) => set({ sidePlankL: v })} max={60} suffix="s" /></Field>
            <Field label="Rechts"><Stepper value={r.sidePlankR} step={5} onChange={(v) => set({ sidePlankR: v })} max={60} suffix="s" /></Field>
          </div>
          <div class="list"><Check on={r.sidePlankKnees} onChange={(v) => set({ sidePlankKnees: v })}>Variante mit gebeugten Knien</Check></div>
        </>)}
        {t.id === 'balance' && (<>
          <Timer max={45} onStop={() => {}} />
          <div class="grid2">
            <Field label="Links (Augen offen)"><Stepper value={r.singleLegL} step={5} onChange={(v) => set({ singleLegL: v })} max={45} suffix="s" /></Field>
            <Field label="Rechts (Augen offen)"><Stepper value={r.singleLegR} step={5} onChange={(v) => set({ singleLegR: v })} max={45} suffix="s" /></Field>
          </div>
          {Math.min(r.singleLegL, r.singleLegR) >= 30 && (
            <div class="grid2">
              <Field label="Links (Augen zu)"><Stepper value={r.eyesClosedL ?? 0} step={1} onChange={(v) => set({ eyesClosedL: v })} max={30} suffix="s" /></Field>
              <Field label="Rechts (Augen zu)"><Stepper value={r.eyesClosedR ?? 0} step={1} onChange={(v) => set({ eyesClosedR: v })} max={30} suffix="s" /></Field>
            </div>
          )}
        </>)}
        {t.id === 'bridge' && (
          <div class="grid2">
            <Field label="Links"><Stepper value={r.bridgeSingleL} onChange={(v) => set({ bridgeSingleL: v })} max={20} /></Field>
            <Field label="Rechts"><Stepper value={r.bridgeSingleR} onChange={(v) => set({ bridgeSingleR: v })} max={20} /></Field>
          </div>
        )}
        {t.id === 'prone' && (<>
          <Timer max={45} onStop={(s) => set({ proneYHoldSec: s })} />
          <Field label="Haltezeit"><Stepper value={r.proneYHoldSec} step={5} onChange={(v) => set({ proneYHoldSec: v })} max={45} suffix="s" /></Field>
          {eq.includes('stange') && (
            <div class="grid2">
              <Field label="Hängen an der Stange"><NumInput value={r.deadHangSec} suffix="s" onChange={(v) => set({ deadHangSec: v })} /></Field>
              <Field label="Saubere Klimmzüge"><NumInput value={r.pullups} onChange={(v) => set({ pullups: v })} /></Field>
            </div>
          )}
        </>)}
        {t.id === 'mobility' && (<>
          <div class="grid2">
            <Field label="Schulter L oben (cm)"><NumInput value={r.backScratchL} onChange={(v) => set({ backScratchL: v })} placeholder="z. B. -8" /></Field>
            <Field label="Schulter R oben (cm)"><NumInput value={r.backScratchR} onChange={(v) => set({ backScratchR: v })} placeholder="z. B. -12" /></Field>
          </div>
          <Field label="Vorbeuge: Fingerspitzen erreichen"><Chips value={r.toeTouch} options={[['knie', 'Knie'], ['schienbein', 'Schienbein'], ['knoechel', 'Knöchel'], ['boden', 'Boden']]} onChange={(v) => set({ toeTouch: v })} /></Field>
          <Field label="Tiefe Hocke 30 s (optional)"><Chips value={r.deepSquat30s ?? 'ausgelassen'} options={[['ja', 'Ja'], ['mit_hilfe', 'Mit Festhalten'], ['nein', 'Nein'], ['ausgelassen', 'Ausgelassen']]} onChange={(v) => set({ deepSquat30s: v })} /></Field>
        </>)}
      </div>
      <button class="btn primary xl block mt-l" onClick={() => (i === TESTS.length - 1 ? finish() : setI(i + 1))}>{i === TESTS.length - 1 ? 'Auswerten' : 'Weiter'}</button>
      <button class="btn plain block mt" onClick={() => (i === TESTS.length - 1 ? finish() : setI(i + 1))}>Test überspringen (Vorwert behalten)</button>
    </SubPage>
  );
}
