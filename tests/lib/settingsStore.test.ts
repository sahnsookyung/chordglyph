import "fake-indexeddb/auto";
import { DEFAULT_SETTINGS } from "../../src/lib/constants";
import { loadInstrumentSettings, saveInstrumentSettings } from "../../src/lib/settingsStore";

describe("settingsStore", () => {
  it("returns null when IndexedDB is unavailable", async () => {
    const originalIndexedDb = window.indexedDB;
    // @ts-expect-error intentional capability removal
    delete window.indexedDB;

    await expect(loadInstrumentSettings()).resolves.toBeNull();

    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: originalIndexedDb
    });
  });

  it("no-ops saves when IndexedDB is unavailable", async () => {
    const originalIndexedDb = window.indexedDB;
    // @ts-expect-error intentional capability removal
    delete window.indexedDB;

    await expect(saveInstrumentSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined();

    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: originalIndexedDb
    });
  });

  it("persists and normalizes settings", async () => {
    await saveInstrumentSettings({
      ...DEFAULT_SETTINGS,
      playMode: "circle",
      volume: -4,
      fingerDepthSensitivity: {
        ...DEFAULT_SETTINGS.fingerDepthSensitivity,
        Left: {
          ...DEFAULT_SETTINGS.fingerDepthSensitivity.Left,
          thumb: 99
        }
      }
    });

    const loaded = await loadInstrumentSettings();
    expect(loaded?.playMode).toBe("circle");
    expect(loaded?.volume).toBe(-4);
    expect(loaded?.fingerDepthSensitivity.Left.thumb).toBe(10);
  });

  it("returns null for malformed persisted payloads", async () => {
    const request = window.indexedDB.open("chordglyph-settings", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("open failed"));
      request.onupgradeneeded = () => {
        request.result.createObjectStore("settings");
      };
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put("bad", "instrument");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
    });
    database.close();

    await expect(loadInstrumentSettings()).resolves.toBeNull();
  });
});
