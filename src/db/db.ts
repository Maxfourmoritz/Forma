/**
 * FORMA – IndexedDB-Schicht.
 *
 * Grundregeln für Updates (Datenerhalt):
 *  1. Stores werden NIE gelöscht oder umbenannt, nur hinzugefügt.
 *  2. Jede Schemaänderung bekommt eine neue Versionsnummer + Migration in MIGRATIONS.
 *  3. Vor jeder Migration eines bestehenden Bestands wird ein Snapshot (ohne Fotos)
 *     in den Store "snapshots" geschrieben (siehe snapshotBeforeUpgrade).
 */

export const DB_NAME = 'forma';
export const DB_VERSION = 1;

export const STORES = [
  'kv', // Profil, Einstellungen, Progressionsstatus (key/value)
  'secrets', // API-Schlüssel – wird NIE exportiert
  'sessions',
  'activities',
  'checkins',
  'measurements',
  'assessments',
  'photos',
  'meals',
  'snapshots',
] as const;
export type StoreName = (typeof STORES)[number];

/** Stores, die in Backups enthalten sind (secrets & snapshots bewusst nicht). */
export const BACKUP_STORES: StoreName[] = [
  'kv',
  'sessions',
  'activities',
  'checkins',
  'measurements',
  'assessments',
  'photos',
  'meals',
];

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    db.createObjectStore('kv');
    db.createObjectStore('secrets');
    for (const s of ['sessions', 'activities', 'measurements', 'assessments', 'photos', 'meals']) {
      const st = db.createObjectStore(s, { keyPath: 'id' });
      st.createIndex('date', 'date');
    }
    db.createObjectStore('checkins', { keyPath: 'date' });
    db.createObjectStore('snapshots', { keyPath: 'id' });
  },
};

let dbPromise: Promise<IDBDatabase> | null = null;
let pendingUpgradeSnapshot: { from: number; data: Record<string, unknown[]> } | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction!;
      const from = ev.oldVersion;
      if (from > 0) {
        // Sicherheitskopie bestehender Daten vor der Migration (synchron im Upgrade-TX lesen).
        snapshotBeforeUpgrade(db, tx, from);
      }
      for (let v = from + 1; v <= DB_VERSION; v++) {
        const m = MIGRATIONS[v];
        if (!m) throw new Error(`Migration ${v} fehlt`);
        m(db, tx);
      }
    };
    req.onsuccess = async () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        location.reload();
      };
      if (pendingUpgradeSnapshot) {
        const snap = pendingUpgradeSnapshot;
        pendingUpgradeSnapshot = null;
        try {
          await rawPut(db, 'snapshots', {
            id: `upgrade-${snap.from}-${Date.now()}`,
            date: new Date().toISOString(),
            reason: `Automatische Sicherung vor Datenbank-Update v${snap.from}→v${DB_VERSION}`,
            data: snap.data,
          });
        } catch (e) {
          console.warn('Snapshot konnte nicht gespeichert werden', e);
        }
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank blockiert – bitte andere FORMA-Tabs schließen.'));
  });
  return dbPromise;
}

function snapshotBeforeUpgrade(db: IDBDatabase, tx: IDBTransaction, from: number) {
  const data: Record<string, unknown[]> = {};
  pendingUpgradeSnapshot = { from, data };
  for (const name of Array.from(db.objectStoreNames)) {
    if (name === 'photos' || name === 'snapshots' || name === 'secrets') continue;
    const store = tx.objectStore(name);
    if (name === 'kv') {
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      valsReq.onsuccess = () => {
        data[name] = (keysReq.result as IDBValidKey[]).map((k, i) => ({ key: k, value: valsReq.result[i] }));
      };
    } else {
      const r = store.getAll();
      r.onsuccess = () => {
        // Blobs (Essensfotos) nicht in den Snapshot übernehmen
        data[name] = r.result.map((x: Record<string, unknown>) => stripBlobs(x));
      };
    }
  }
}

function stripBlobs<T extends Record<string, unknown>>(x: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) if (!(v instanceof Blob)) out[k] = v;
  return out as T;
}

function rawPut(db: IDBDatabase, store: StoreName, value: unknown, key?: IDBValidKey) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Change-Events für Live-UI ----------
type Listener = (store: StoreName) => void;
const listeners = new Set<Listener>();
export function onChange(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function emit(store: StoreName) {
  for (const l of listeners) l(store);
}

// ---------- Generische CRUD ----------
function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'));
  });
  emit(store);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emit(store);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return get<T>('kv', key);
}
export async function kvSet<T>(key: string, value: T): Promise<void> {
  return put('kv', value, key);
}

export async function kvEntries(): Promise<{ key: string; value: unknown }[]> {
  const db = await openDB();
  const tx = db.transaction('kv');
  const st = tx.objectStore('kv');
  const [keys, vals] = await Promise.all([wrap(st.getAllKeys()), wrap(st.getAll())]);
  return (keys as string[]).map((k, i) => ({ key: k, value: vals[i] }));
}

/** Ersetzt den kompletten Inhalt der angegebenen Stores atomar (eine Transaktion). */
export async function replaceAll(data: Partial<Record<StoreName, unknown[]>>): Promise<void> {
  const db = await openDB();
  const names = Object.keys(data) as StoreName[];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const name of names) {
      const st = tx.objectStore(name);
      st.clear();
      for (const item of data[name] ?? []) {
        if (name === 'kv') {
          const { key, value } = item as { key: string; value: unknown };
          st.put(value, key);
        } else st.put(item);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Wiederherstellung abgebrochen – keine Daten verändert.'));
  });
  for (const n of names) emit(n);
}

/** Bittet den Browser, den Speicher als "persistent" zu markieren (nicht automatisch räumen). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Nur für Tests. */
export function _resetForTests() {
  dbPromise = null;
}
