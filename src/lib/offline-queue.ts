"use client";

/** Time records made with no signal: kept on the phone (IndexedDB) and sent when back online (spec 5.2). */
export type Queued = { id: string; kind: "in" | "out"; payload: Record<string, unknown>; selfie?: Blob; created: number };

const DB = "oh-offline", STORE = "clock";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export const enqueue = (q: Queued) => tx("readwrite", (s) => s.put(q));
export const queued = () => tx<Queued[]>("readonly", (s) => s.getAll() as IDBRequest<Queued[]>);
export const dequeue = (id: string) => tx("readwrite", (s) => s.delete(id));
