/** Receives one short-lived Sprouts session ZIP from same-origin storage. */
const DB_NAME = 'produce-suite-handoffs';
const STORE = 'pastry';
const VERSION = 1;
const MAX_AGE_MS = 60 * 60 * 1000;

export interface PastryHandoff {
  filename: string;
  blob: Blob;
}

interface HandoffRecord extends PastryHandoff {
  id: string;
  createdAt: number;
}

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Session handoff storage is blocked.'));
  });
}

/** Read and remove a handoff so refreshes do not import duplicate stems. */
export async function consumePastryHandoff(id: string): Promise<PastryHandoff | null> {
  const db = await openHandoffDb();
  const record = await new Promise<HandoffRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => {
      if (request.result) tx.objectStore(STORE).delete(id);
      resolve(request.result as HandoffRecord | undefined);
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  if (!record || Date.now() - record.createdAt > MAX_AGE_MS) return null;
  return { filename: record.filename, blob: record.blob };
}
