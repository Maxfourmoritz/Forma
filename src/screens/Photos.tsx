import { useEffect, useMemo, useState } from 'preact/hooks';
import { onChange } from '../db/db';
import { repo } from '../db/repo';
import { compressImage, } from '../domain/nutrition';
import type { ProgressPhoto } from '../domain/types';
import { fmtDate, uid } from '../domain/util';
import { Chips, Empty, Seg, SubPage } from '../ui/kit';
import { toast } from '../state';

function Img({ blob, alt }: { blob: Blob; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={alt} />;
}

export function Photos() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [view, setView] = useState<ProgressPhoto['view']>('vorne');
  const [hidden, setHidden] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const load = () => repo.photos().then((p) => setPhotos(p.sort((a, b) => b.date.localeCompare(a.date))));
  useEffect(() => { void load(); return onChange((s) => s === 'photos' && void load()); }, []);
  const list = photos.filter((p) => p.view === view);
  const cmp = sel.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as ProgressPhoto[];

  const add = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    const { blob } = await compressImage(f, 1600, 0.85);
    await repo.savePhoto({ id: uid(), date: new Date().toISOString(), view, blob });
    toast('Foto gespeichert');
  };

  return (
    <SubPage title="Fortschrittsfotos" right={<button class="btn plain small" onClick={() => setHidden(!hidden)}>{hidden ? 'Zeigen' : 'Verbergen'}</button>}>
      <p class="small muted" style={{ marginTop: 0 }}>Privat: Fotos bleiben ausschließlich auf diesem Gerät und sind nur in Backups „inkl. Fotos“ enthalten. Tipp: gleiches Licht, gleiche Uhrzeit, gleicher Abstand – alle 4 Wochen.</p>
      <Seg value={view} options={[['vorne', 'Vorne'], ['seite', 'Seite'], ['hinten', 'Hinten']]} onChange={(v) => { setView(v); setSel([]); }} />
      <label class="btn primary block mt" style={{ position: 'relative' }}>
        Foto aufnehmen ({view})
        <input type="file" accept="image/*" capture="user" onChange={add} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
      </label>
      {cmp.length === 2 && (
        <div class="grid2 mt">
          {cmp.sort((a, b) => a.date.localeCompare(b.date)).map((p) => <div key={p.id} class={`photo-full ${hidden ? 'blurred' : ''}`} style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '3 / 4' }}><Img blob={p.blob} alt={`Foto ${fmtDate(p.date)}`} /><div class="xs center muted">{fmtDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>)}
        </div>
      )}
      <p class="xs faint mt">{list.length >= 2 ? 'Zwei Fotos antippen, um sie zu vergleichen.' : ''}</p>
      {!list.length ? <Empty title="Noch keine Fotos" /> : (
        <div class={`photo-grid ${hidden ? 'blurred' : ''}`}>
          {list.map((p) => (
            <button key={p.id} onClick={() => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s.slice(-1), p.id]))} style={sel.includes(p.id) ? { outline: '3px solid var(--accent)' } : undefined}>
              <Img blob={p.blob} alt={`Foto ${fmtDate(p.date)}`} />
              <span class="xs" style={{ position: 'absolute', left: 6, bottom: 6, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{fmtDate(p.date)}</span>
            </button>
          ))}
        </div>
      )}
      {sel.length === 1 && (
        <div class="mt"><Chips value="" options={[['del', 'Ausgewähltes Foto löschen']]} onChange={() => { void repo.deletePhoto(sel[0]).then(() => { setSel([]); toast('Foto gelöscht'); }); }} /></div>
      )}
    </SubPage>
  );
}
