/**
 * Thin async wrapper around IndexedDB for worksheet persistence.
 *
 * Database: "analyseries", object store: "worksheets" (keyPath "id").
 * IndexedDB structured clone handles Float64Array natively — no manual
 * serialisation is needed.
 */

import type { Worksheet } from './types';

let db: IDBDatabase | null = null;

/** Open (or create) the database. Must be called once before any other function. */
export async function initDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('analyseries', 1);

    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains('worksheets')) {
        idb.createObjectStore('worksheets', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/** Load every worksheet stored in IndexedDB. */
export async function loadAllWorksheets(): Promise<Worksheet[]> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('worksheets', 'readonly');
    const store = tx.objectStore('worksheets');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as Worksheet[]);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/** Insert or update a worksheet. */
export async function saveWorksheet(ws: Worksheet): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('worksheets', 'readwrite');
    const store = tx.objectStore('worksheets');
    const request = store.put(ws);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/** Delete a worksheet by ID. */
export async function deleteWorksheet(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction('worksheets', 'readwrite');
    const store = tx.objectStore('worksheets');
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
