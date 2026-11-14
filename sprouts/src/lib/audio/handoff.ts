/** Short-lived, same-origin session handoff from Sprouts to Pastry. */
const DB_NAME = 'produce-suite-handoffs';
const STORE = 'pastry';
const VERSION = 1;

interface HandoffRecord {
  id: string;
  createdAt: number;
  filename: string;
  blob: Blob;
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

/** Keep the ZIP in this browser just long enough for Pastry to consume it. */
export async function stagePastryHandoff(blob: Blob, filename: string): Promise<string> {
  const record: HandoffRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    filename,
    blob,
  };
  const db = await openHandoffDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Session handoff could not be saved.'));
  });
  db.close();
  return record.id;
}
