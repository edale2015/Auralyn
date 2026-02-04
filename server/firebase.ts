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
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  
  let credential: admin.credential.Credential;
  let clientEmail: string | undefined;
  
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      credential = admin.credential.cert(serviceAccount);
      clientEmail = serviceAccount.client_email;
      console.log("Using service account credentials from secret");
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e);
      throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
    }
  } else {
    credential = admin.credential.applicationDefault();
    console.log("Using Application Default Credentials");
  }

  try {
    admin.initializeApp({
      credential,
      projectId: projectId,
      storageBucket: storageBucket,
    });
    
    initialized = true;
    console.log(`Firebase Admin SDK initialized for project: ${projectId}`);
    console.log(`Firebase Admin clientEmail: ${clientEmail || 'ADC'}`);
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
