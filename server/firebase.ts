import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

let initialized = false;

function initializeFirebase(): void {
  if (initialized || admin.apps.length > 0) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID environment variable is required");
  }

  // Check for service account JSON in environment variable
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (serviceAccountJson) {
    // Write to temp file and set GOOGLE_APPLICATION_CREDENTIALS
    const tempPath = "/tmp/service_account.json";
    fs.writeFileSync(tempPath, serviceAccountJson);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
    console.log("Service account credentials written to temp file");
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId,
    });
    
    initialized = true;
    console.log(`Firebase Admin SDK initialized for project: ${projectId}`);
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
}

// Initialize immediately
initializeFirebase();

export const db = admin.firestore();

export { admin };
