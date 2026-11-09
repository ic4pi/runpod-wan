/** Tiny IndexedDB store — takes persist on-device across sessions. */

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

const DB_NAME = 'levels-studio';
const STORE = 'takes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTake(take: StoredTake): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(take);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listTakes(): Promise<StoredTake[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredTake[]).sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteTake(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
