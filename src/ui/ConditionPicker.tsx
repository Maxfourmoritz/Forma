import { useState } from 'preact/hooks';
import { CONDITION_MAP, groupsFor } from '../domain/conditions';
import type { Sex } from '../domain/types';
import { Check } from './kit';

/** Mehrfachauswahl zu Erkrankungen, Beschwerden und Medikamenten – in Gruppen einklappbar und durchsuchbar. */
export function ConditionPicker({ ids, sex, onChange }: { ids: string[]; sex?: Sex; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupsFor(sex);
  const query = q.trim().toLowerCase();
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const selected = ids.map((id) => CONDITION_MAP[id]).filter(Boolean);
  return (
    <div class="stack">
      <input class="input" type="search" placeholder="Suchen (z. B. Knie, Diabetes, Asthma)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Angaben durchsuchen" />
      {selected.length > 0 && (
        <div>
          <div class="label" style={{ marginBottom: 6 }}>Ausgewählt ({selected.length}) – zum Entfernen antippen</div>
          <div class="chips wrap">{selected.map((c) => <button key={c.id} class="chip on" onClick={() => toggle(c.id)}>{c.label.replace(/ \(.*?\)/g, '')} ✕</button>)}</div>
        </div>
      )}
      {groups.map((g) => {
        const items = query ? g.items.filter((c) => c.label.toLowerCase().includes(query)) : g.items;
        if (!items.length) return null;
        const count = g.items.filter((c) => ids.includes(c.id)).length;
        const isOpen = !!query || open === g.id;
        return (
          <div key={g.id} class="list">
            <button class="list-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen && !query ? null : g.id)}>
              <div class="grow" style={{ fontWeight: 600 }}>{g.title}</div>
              {count > 0 && <span class="pill accent num">{count}</span>}
              <span class="chev" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>›</span>
            </button>
            {isOpen && items.map((c) => <Check key={c.id} on={ids.includes(c.id)} onChange={() => toggle(c.id)}>{c.label}</Check>)}
          </div>
        );
      })}
      {query && !groups.some((g) => g.items.some((c) => c.label.toLowerCase().includes(query))) && <p class="small muted" style={{ margin: 0 }}>Nichts gefunden. Du kannst es unten unter „Weitere Hinweise“ eintragen.</p>}
      <button class="btn secondary" onClick={() => onChange([])}>Keine davon trifft zu</button>
    </div>
  );
}
