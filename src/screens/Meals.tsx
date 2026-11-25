import { useEffect, useMemo, useState } from 'preact/hooks';
import { data, nav, toast, useStore } from '../state';
import { repo } from '../db/repo';
import { compressImage, dayTotals, estimateTargets, guessMealLabel, MEAL_LABEL, totals } from '../domain/nutrition';
import type { Meal, MealItem } from '../domain/types';
import { addDays, dayKey, fmtDate, fmtTime, uid } from '../domain/util';
import { Card, Chips, Empty, NumInput, SecTitle, Spinner, SubPage, Tag } from '../ui/kit';
import { age, latestWeight } from './common';

function useObjectURL(blob?: Blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function Thumb({ blob }: { blob?: Blob }) {
  const url = useObjectURL(blob);
  return url ? <img class="meal-thumb" src={url} alt="" /> : <div class="meal-thumb" />;
}

export function Meals({ date }: { date?: string }) {
  const d = useStore(data);
  const [day, setDay] = useState(date ?? dayKey());
  const [draft, setDraft] = useState<Meal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => { void repo.apiKey().then((k) => setHasKey(!!k)); }, []);

  const p = d.profile!;
  const t = estimateTargets(p, latestWeight(d) ?? 90, age(p.birthYear));
  const kcalT = p.nutrition.kcalTarget ?? t.kcal, protT = p.nutrition.proteinTarget ?? t.protein, carbT = p.nutrition.carbsMax;
  const meals = d.meals.filter((m) => dayKey(m.date) === day).sort((a, b) => a.date.localeCompare(b.date));
  const tot = dayTotals(meals);

  const onPhoto = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    setErr(null);
    const { blob, base64 } = await compressImage(f);
    const base: Meal = { id: uid(), date: day === dayKey() ? new Date().toISOString() : new Date(day + 'T12:00').toISOString(), label: guessMealLabel(), photo: blob, items: [], source: 'ki' };
    setDraft(base);
    const key = await repo.apiKey();
    if (!key) { setErr('Kein API-Schlüssel hinterlegt (Profil › Ernährung). Du kannst die Werte manuell eintragen.'); setDraft({ ...base, source: 'manuell' }); return; }
    setBusy(true);
    try {
      const { analyzeMealPhoto } = await import('../domain/foodAI');
      const r = await analyzeMealPhoto(key, base64, hint || undefined);
      setDraft({ ...base, items: r.items, confidence: r.confidence, aiNote: r.note });
    } catch (ex) {
      const { describeError } = await import('../domain/foodAI');
      setErr(describeError(ex));
      setDraft({ ...base, source: 'manuell' });
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.items.length) { toast('Bitte mindestens ein Lebensmittel eintragen'); return; }
    await repo.saveMeal(draft);
    setDraft(null); setHint('');
    toast('Mahlzeit gespeichert');
  };
  const setItem = (i: number, patch: Partial<MealItem>) => draft && setDraft({ ...draft, edited: true, items: draft.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <SubPage title="Ernährung">
      <div class="row between">
        <button class="icon-btn" aria-label="Vortag" onClick={() => setDay(dayKey(addDays(new Date(day + 'T12:00'), -1)))}>‹</button>
        <div class="title-m">{day === dayKey() ? 'Heute' : fmtDate(day + 'T12:00', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <button class="icon-btn" aria-label="Folgetag" disabled={day >= dayKey()} onClick={() => setDay(dayKey(addDays(new Date(day + 'T12:00'), 1)))}>›</button>
      </div>
      <Card class="mt">
        <div class="row between"><span class="label">Tagessumme</span><Tag kind="geschätzt" /></div>
        <div class="grid2 mt" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['kcal', tot.kcal, kcalT, ''], ['Eiweiß', tot.protein, protT, 'g'], ['KH', tot.carbs, carbT, 'g'], ['Fett', tot.fat, undefined, 'g']].map(([l, v, target, u]) => (
            <div key={String(l)} class="metric">
              <div class="l">{l}</div>
              <div class="num" style={{ fontSize: 20, fontWeight: 700 }}>{v}<span class="u">{u}</span></div>
              {target ? <div class="xs muted num">von {target}</div> : <div class="xs muted">&nbsp;</div>}
            </div>
          ))}
        </div>
        <div class="bar-h mt"><div style={{ width: `${Math.min(100, (tot.protein / protT) * 100)}%` }} /></div>
        <div class="xs muted mt">Eiweiß: {Math.max(0, protT - tot.protein)} g fehlen noch</div>
      </Card>

      {!draft && (
        <div class="stack mt">
          <input class="input" placeholder="Optional: Hinweis zur Mahlzeit (z. B. „mit 1 EL Olivenöl“)" value={hint} onInput={(e) => setHint((e.target as HTMLInputElement).value)} />
          <label class="btn primary xl block" style={{ position: 'relative' }}>
            Mahlzeit fotografieren
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
          </label>
          <button class="btn secondary block" onClick={() => setDraft({ id: uid(), date: new Date(day === dayKey() ? Date.now() : new Date(day + 'T12:00').getTime()).toISOString(), label: guessMealLabel(), items: [{ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0 }], source: 'manuell' })}>Manuell eintragen</button>
          {hasKey === false && <p class="xs faint" style={{ margin: 0 }}>Für die automatische Schätzung im Profil › Ernährung einen API-Schlüssel hinterlegen.</p>}
        </div>
      )}

      {draft && (
        <Card class="mt">
          <div class="row" style={{ gap: 12 }}>
            {draft.photo && <Thumb blob={draft.photo} />}
            <div class="grow">
              <Chips value={draft.label} options={Object.entries(MEAL_LABEL) as [Meal['label'], string][]} onChange={(v) => setDraft({ ...draft, label: v })} />
            </div>
          </div>
          {busy && <div class="row mt"><Spinner /><span class="muted small">Analysiere Foto … (ca. 10–30 s)</span></div>}
          {err && <p class="small" style={{ color: 'var(--warn)' }}>{err}</p>}
          {draft.aiNote && <p class="small muted">{draft.aiNote} {draft.confidence && <span class="pill">Sicherheit: {draft.confidence}</span>}</p>}
          {!busy && draft.items.map((it, i) => (
            <div key={i} class="card tight mt" style={{ background: 'var(--bg-elev-2)', boxShadow: 'none' }}>
              <div class="row">
                <input class="input" style={{ height: 40 }} placeholder="Lebensmittel" value={it.name} onInput={(e) => setItem(i, { name: (e.target as HTMLInputElement).value })} />
                <button class="btn plain small" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })}>✕</button>
              </div>
              <div class="grid2 mt" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {(['grams', 'kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                  <div key={k}><div class="xs muted">{{ grams: 'g', kcal: 'kcal', protein: 'Eiweiß', carbs: 'KH', fat: 'Fett' }[k]}</div><NumInput value={it[k]} onChange={(v) => setItem(i, { [k]: v ?? 0 })} /></div>
                ))}
              </div>
            </div>
          ))}
          {!busy && (
            <>
              <button class="btn plain small mt" onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', kcal: 0, protein: 0, carbs: 0, fat: 0 }] })}>+ Lebensmittel</button>
              <div class="small muted mt num">Summe: {totals(draft.items).kcal} kcal · {totals(draft.items).protein} g Eiweiß · {totals(draft.items).carbs} g KH</div>
              <div class="grid2 mt">
                <button class="btn secondary" onClick={() => { setDraft(null); setErr(null); }}>Verwerfen</button>
                <button class="btn primary" onClick={saveDraft}>Speichern</button>
              </div>
            </>
          )}
        </Card>
      )}

      <SecTitle>Mahlzeiten</SecTitle>
      {!meals.length ? <Empty title="Noch nichts erfasst" /> : (
        <div class="list">
          {meals.map((m) => {
            const tt = totals(m.items);
            return (
              <div key={m.id} class="list-row">
                <Thumb blob={m.photo} />
                <div class="grow">
                  <div>{MEAL_LABEL[m.label]} <span class="small muted">· {fmtTime(m.date)}</span></div>
                  <div class="small muted">{m.items.map((i) => i.name).join(', ')}</div>
                  <div class="small num">{tt.kcal} kcal · {tt.protein} g Eiweiß · {tt.carbs} g KH {m.source === 'ki' && !m.edited && <span class="tag geschaetzt">KI</span>}</div>
                </div>
                <button class="btn plain small" onClick={() => setDraft(m)}>Ändern</button>
              </div>
            );
          })}
        </div>
      )}
      {meals.length > 0 && <button class="btn plain small mt" onClick={() => { const m = meals[meals.length - 1]; void repo.deleteMeal(m.id).then(() => toast('Letzte Mahlzeit gelöscht')); }}>Letzte Mahlzeit löschen</button>}
      <p class="xs faint mt">Foto-Schätzungen können deutlich danebenliegen – besonders bei Öl, Soßen und Portionsgrößen. Für Trends reicht das; Einzelwerte bitte nicht überbewerten.</p>
      <button class="btn plain small" onClick={() => nav.push({ name: 'settings', section: 'ernaehrung' })}>Ziele & API-Schlüssel</button>
    </SubPage>
  );
}
