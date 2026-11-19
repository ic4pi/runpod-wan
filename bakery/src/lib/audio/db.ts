/** Tiny IndexedDB store — takes + vocal stacks persist on-device. */

export interface StoredTake {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  templateId: string;
  blob: Blob;          // dry take
  mixBlob?: Blob;      // last rendered master (cached)
  mixTemplateId?: string;
}

export type LayerRole = 'lead' | 'double' | 'backup' | 'adlib';

export interface StackLayer {
  id: string;
  role: LayerRole;
  blob: Blob;          // dry take
  duration: number;
  /** -1 (left) .. 0 (center) .. +1 (right); null = smart default by role+index */
  pan: number | null;
  /** gain multiplier 0..2; null = smart default */
  gain: number | null;
  muted: boolean;
  /** per-layer FX insert id; absent/'none' = clean */
  fx?: string;
}

export interface StoredStack {
  id: string;
  name: string;
  createdAt: number;
  templateId: string;
  layers: StackLayer[];
  /** optional beat (WAV) the stack was recorded over */
  beatBlob?: Blob;
  beatName?: string;
}

const DB_NAME = 'sprouts-studio';
const DB_VERSION = 2;
const TAKES = 'takes';
const STACKS = 'stacks';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TAKES)) {
        db.createObjectStore(TAKES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STACKS)) {
        db.createObjectStore(STACKS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export async function saveTake(take: StoredTake): Promise<void> {
  await tx(TAKES, 'readwrite', (s) => s.put(take));
}

export async function listTakes(): Promise<StoredTake[]> {
  const all = await tx(TAKES, 'readonly', (s) => s.getAll() as IDBRequest<StoredTake[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTake(id: string): Promise<void> {
  await tx(TAKES, 'readwrite', (s) => s.delete(id));
}

export async function saveStack(stack: StoredStack): Promise<void> {
  await tx(STACKS, 'readwrite', (s) => s.put(stack));
}

export async function listStacks(): Promise<StoredStack[]> {
  const all = await tx(STACKS, 'readonly', (s) => s.getAll() as IDBRequest<StoredStack[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteStack(id: string): Promise<void> {
  await tx(STACKS, 'readwrite', (s) => s.delete(id));
}
