import type { StorageDriver } from "./store";
import { makeSqliteStore } from "./sqliteStore";
import { makeFirestoreStore } from "./firestoreStore";

let cachedStore: StorageDriver | null = null;
let activeDriver: "sqlite" | "firestore" = "sqlite";

function validateFirestoreConfig(): void {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (!projectId) {
    throw new Error(
      "[IntakeStorage] STORAGE_DRIVER=firestore but FIREBASE_PROJECT_ID is not set. " +
      "Please set FIREBASE_PROJECT_ID or switch to STORAGE_DRIVER=sqlite."
    );
  }
  
  // Check for credentials (either file path or inline JSON, or running in GCP with default creds)
  const hasCredentials = credentials || process.env.GOOGLE_CLOUD_PROJECT;
  if (!hasCredentials) {
    console.warn(
      "[IntakeStorage] Warning: No explicit credentials found. " +
      "Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON. " +
      "Attempting to use default credentials (will work on GCP)."
    );
  }
  
  console.log(`[IntakeStorage] Firestore driver configured for project: ${projectId}`);
}

export function getIntakeStore(): StorageDriver {
  if (cachedStore) return cachedStore;
  
  const driver = (process.env.STORAGE_DRIVER || "sqlite").toLowerCase();
  if (driver === "firestore") {
    validateFirestoreConfig();
    activeDriver = "firestore";
    cachedStore = makeFirestoreStore();
  } else {
    activeDriver = "sqlite";
    cachedStore = makeSqliteStore();
    console.log("[IntakeStorage] SQLite driver initialized");
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
