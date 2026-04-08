/**
 * Thin async wrapper around IndexedDB for worksheet persistence.
 *
 * Database: "analyseries", object store: "worksheets" (keyPath "id").
 * Uses the `idb` library for promise-based IndexedDB access with proper
 * transaction-level error handling.
 *
 * IndexedDB structured clone handles Float64Array natively — no manual
 * serialisation is needed.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Worksheet } from './types';

let db: IDBPDatabase | null = null;

/** Open (or create) the database. Must be called once before any other function. */
export async function initDB(): Promise<void> {
  db = await openDB('analyseries', 1, {
    upgrade(idb) {
      if (!idb.objectStoreNames.contains('worksheets')) {
        idb.createObjectStore('worksheets', { keyPath: 'id' });
      }
    },
  });
}

/** Load every worksheet stored in IndexedDB. */
export async function loadAllWorksheets(): Promise<Worksheet[]> {
  return (await db!.getAll('worksheets')) as Worksheet[];
}

/** Insert or update a worksheet. */
export async function saveWorksheet(ws: Worksheet): Promise<void> {
  await db!.put('worksheets', ws);
}

/** Delete a worksheet by ID. */
export async function deleteWorksheet(id: string): Promise<void> {
  await db!.delete('worksheets', id);
}
