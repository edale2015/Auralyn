import type { StorageDriver } from "./store";
import { makeSqliteStore } from "./sqliteStore";
import { makeFirestoreStore } from "./firestoreStore";

let cachedStore: StorageDriver | null = null;
let activeDriver: "sqlite" | "firestore" = "sqlite";

export function getIntakeStore(): StorageDriver {
  if (cachedStore) return cachedStore;
  
  const driver = (process.env.STORAGE_DRIVER || "sqlite").toLowerCase();
  if (driver === "firestore") {
    activeDriver = "firestore";
    cachedStore = makeFirestoreStore();
  } else {
    activeDriver = "sqlite";
    cachedStore = makeSqliteStore();
  }
  return cachedStore;
}

export function getActiveDriver(): "sqlite" | "firestore" {
  return activeDriver;
}

// Backwards compatibility alias
export const getStore = getIntakeStore;

// Public API - only export what routes need
export type { StorageDriver } from "./store";
export type { DraftPayload, SubmitPayload, StatusResult, FileMeta, CaseStatus } from "./types";
export { newId } from "./crypto";
