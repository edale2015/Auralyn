import type { StorageDriver } from "./store";
import { makeSqliteStore } from "./sqliteStore";
import { makeFirestoreStore } from "./firestoreStore";

let cachedStore: StorageDriver | null = null;

export function getStore(): StorageDriver {
  if (cachedStore) return cachedStore;
  
  const driver = (process.env.STORAGE_DRIVER || "sqlite").toLowerCase();
  if (driver === "firestore") {
    cachedStore = makeFirestoreStore();
  } else {
    cachedStore = makeSqliteStore();
  }
  return cachedStore;
}

export type { StorageDriver } from "./store";
export type { DraftPayload, SubmitPayload, StatusResult, FileMeta, CaseStatus } from "./types";
export { newId } from "./crypto";
