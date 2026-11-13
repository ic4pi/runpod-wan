/** Free hub storage: exactly ONE session, kept on this device. A new project replaces it. */

export type Kind = 'vocal' | 'backing';

export interface Track {
  id: string;
  name: string;
  kind: Kind;
  blob: Blob;
  duration: number;
  volume: number; // 0..1.5
  pan: number; // -1..1
  /** Seconds the track is moved against the others: + plays later, - plays earlier. */
  offset: number;
  /** Seconds of silence before the first sound (informational, helps line tracks up). */
  lead: number;
  origin: 'rec' | 'upload';
  /** Vocal only: the one template, "Vocal boost". On unless set to false. */
  boost?: boolean;
}

export const MAX_NUDGE = 5; // seconds either way

/** Slot 0 = the single plain vocal track, slots 1-5 = backing tracks. */
export const SLOT_COUNT = 6;
export type Slots = (Track | null)[];

// The database name predates the rename to Grocery. Keep it so people's saved project still loads.
const DB = 'produce-free';
const STORE = 'session';
const KEY = 'current';

export const emptySlots = (): Slots => Array.from({ length: SLOT_COUNT }, () => null);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function loadSession(): Promise<Slots> {
  try {
    const saved = await run<Slots | undefined>('readonly', (s) => s.get(KEY));
    if (Array.isArray(saved) && saved.length === SLOT_COUNT) {
      // sessions saved before nudging existed have no offset: treat them as 0
      return saved.map((t) => (t ? { ...t, offset: t.offset ?? 0, lead: t.lead ?? 0, origin: t.origin ?? (t.kind === 'vocal' ? 'rec' : 'upload') } : null));
    }
  } catch { /* storage blocked — start empty */ }
  return emptySlots();
}

export async function saveSession(slots: Slots): Promise<void> {
  try { await run('readwrite', (s) => s.put(slots, KEY)); } catch { /* storage blocked — session lives in memory only */ }
}

export async function clearSession(): Promise<void> {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch { /* ignore */ }
}
