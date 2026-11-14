export interface GroceryBeatHandoff {
  id: string;
  blob: Blob;
  filename: string;
  title: string;
  producer: string;
  bpm: number;
  licensed: boolean;
  createdAt: number;
}

const DB_NAME = 'grocery-sprouts-handoffs';
const STORE = 'beats';
const VERSION = 1;
const MAX_AGE = 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Grocery handoff storage could not be opened.'));
    request.onblocked = () => reject(new Error('Grocery handoff storage is blocked.'));
  });
}

/** Read and remove the one-time beat so refreshes cannot duplicate it. */
export async function consumeGroceryBeat(id: string): Promise<GroceryBeatHandoff | null> {
  const db = await openDatabase();
  try {
    const record = await new Promise<GroceryBeatHandoff | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        store.delete(id);
        resolve(request.result as GroceryBeatHandoff | undefined);
      };
      request.onerror = () => reject(request.error ?? new Error('The Grocery beat could not be read.'));
      tx.onabort = () => reject(tx.error ?? new Error('The Grocery handoff was interrupted.'));
    });
    if (!record || Date.now() - record.createdAt > MAX_AGE) return null;
    if (!(record.blob instanceof Blob) || typeof record.filename !== 'string' || typeof record.licensed !== 'boolean') return null;
    return record;
  } finally {
    db.close();
  }
}
