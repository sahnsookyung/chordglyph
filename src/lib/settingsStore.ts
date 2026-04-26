import { normalizeInstrumentSettings } from "./settingsNormalization";
import type { InstrumentSettings } from "./types";

const DATABASE_NAME = "chordglyph-settings";
const DATABASE_VERSION = 1;
const STORE_NAME = "settings";
const SETTINGS_KEY = "instrument";

function openSettingsDatabase(): Promise<IDBDatabase | null> {
  if (typeof globalThis.window === "undefined" || !("indexedDB" in globalThis.window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Unable to open settings database"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadInstrumentSettings(): Promise<InstrumentSettings | null> {
  const database = await openSettingsDatabase();
  if (!database) {
    return null;
  }

  return await new Promise<InstrumentSettings | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(SETTINGS_KEY);

    request.onerror = () => reject(request.error ?? new Error("Unable to read saved settings"));
    request.onsuccess = () => {
      const persisted: unknown = request.result;
      if (!persisted || typeof persisted !== "object") {
        resolve(null);
        return;
      }

      resolve(normalizeInstrumentSettings(persisted));
    };
  }).finally(() => {
    database.close();
  });
}

export async function saveInstrumentSettings(settings: InstrumentSettings): Promise<void> {
  const database = await openSettingsDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to persist instrument settings"));

    store.put(normalizeInstrumentSettings(settings), SETTINGS_KEY);
  }).finally(() => {
    database.close();
  });
}
