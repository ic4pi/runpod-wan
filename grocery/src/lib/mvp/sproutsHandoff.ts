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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Beat handoff storage could not be opened.'));
    request.onblocked = () => reject(new Error('Beat handoff storage is blocked.'));
  });
}

/** Stage a one-time, same-origin beat for Sprouts. No account data is stored here. */
export async function stageSproutsBeat(input: Omit<GroceryBeatHandoff, 'id' | 'createdAt'>): Promise<string> {
  const db = await openDatabase();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...input, id, createdAt: Date.now() } satisfies GroceryBeatHandoff);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('The beat could not be staged for Sprouts.'));
      tx.onabort = () => reject(tx.error ?? new Error('The beat handoff was interrupted.'));
    });
    return id;
  } finally {
    db.close();
  }
}
