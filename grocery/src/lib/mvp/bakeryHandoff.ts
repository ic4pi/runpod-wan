export interface GroceryBeatHandoff {
  id: string;
  kind: 'beat';
  blob: Blob;
  filename: string;
  title: string;
  producer: string;
  bpm: number;
  licensed: boolean;
  createdAt: number;
}

export interface GroceryUploadHandoff {
  id: string;
  kind: 'upload';
  files: { blob: Blob; filename: string }[];
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

async function stageRecord(record: GroceryBeatHandoff | GroceryUploadHandoff): Promise<string> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('The audio could not be staged for Bakery.'));
      tx.onabort = () => reject(tx.error ?? new Error('The audio handoff was interrupted.'));
    });
    return record.id;
  } finally {
    db.close();
  }
}

/** Stage a one-time, same-origin beat for Bakery. No account data is stored here. */
export function stageBakeryBeat(input: Omit<GroceryBeatHandoff, 'id' | 'createdAt' | 'kind'>): Promise<string> {
  return stageRecord({ ...input, id: crypto.randomUUID(), kind: 'beat', createdAt: Date.now() });
}

/** Stage the user's own track or up to eight stems without a store purchase. */
export function stageBakeryUpload(files: File[]): Promise<string> {
  if (files.length < 1 || files.length > 8) throw new Error('Choose one track or up to eight stems.');
  return stageRecord({
    id: crypto.randomUUID(),
    kind: 'upload',
    files: files.map((file) => ({ blob: file, filename: file.name })),
    createdAt: Date.now(),
  });
}
