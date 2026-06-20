import type { Settings } from "./types";

/**
 * Persistent download history, stored in IndexedDB so the actual files (Blobs)
 * survive across sessions and can be re-downloaded or re-opened at any time.
 */
export interface HistoryRecord {
  id: string;
  name: string;
  kind: "pdf" | "docx";
  size: number;
  createdAt: number;
  title: string;
  /** source markdown, so the document can be restored into the editor */
  markdown: string;
  /** settings used, so the document can be restored exactly */
  settings: Settings;
  /** the generated file itself */
  blob: Blob;
}

const DB_NAME = "wordmaker";
const STORE = "downloads";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addRecord(rec: HistoryRecord): Promise<unknown> {
  return tx("readwrite", (s) => s.put(rec));
}

export function getRecord(id: string): Promise<HistoryRecord | undefined> {
  return tx<HistoryRecord | undefined>("readonly", (s) => s.get(id) as IDBRequest<HistoryRecord | undefined>);
}

export async function listRecords(): Promise<HistoryRecord[]> {
  const all = await tx<HistoryRecord[]>("readonly", (s) => s.getAll() as IDBRequest<HistoryRecord[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteRecord(id: string): Promise<unknown> {
  return tx("readwrite", (s) => s.delete(id));
}

export function clearAll(): Promise<unknown> {
  return tx("readwrite", (s) => s.clear());
}
