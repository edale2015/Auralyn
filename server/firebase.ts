import admin from "firebase-admin";
import * as fs from "fs";

let initialized = false;

function initializeFirebase(): void {
  if (initialized || admin.apps.length > 0) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID environment variable is required");
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (serviceAccountJson) {
    const tempPath = "/tmp/service_account.json";
    fs.writeFileSync(tempPath, serviceAccountJson);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
    console.log("Service account credentials written to temp file");
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId,
      storageBucket: storageBucket,
    });
    
    initialized = true;
    console.log(`Firebase Admin SDK initialized for project: ${projectId}`);
    if (storageBucket) {
      console.log(`Firebase Storage bucket: ${storageBucket}`);
    }
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
}

initializeFirebase();

export const db = admin.firestore();

export function getStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is required for cloud storage");
  }
  return admin.storage().bucket(bucketName);
}

export { admin };
