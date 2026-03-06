import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function initFirebase(): admin.app.App {
  if (app) return app;
  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  const credential = serviceAccountJson
    ? admin.credential.cert(JSON.parse(serviceAccountJson))
    : admin.credential.applicationDefault();

  app = admin.initializeApp({ credential, projectId, storageBucket });
  console.log(`[Firebase] Admin SDK initialized for project: ${projectId}`);
  if (storageBucket) console.log(`[Firebase] Storage bucket: ${storageBucket}`);
  return app;
}

let firestoreInstance: admin.firestore.Firestore | null = null;

export function getFirestore(): admin.firestore.Firestore {
  if (firestoreInstance) return firestoreInstance;
  initFirebase();
  firestoreInstance = admin.firestore();
  firestoreInstance.settings({ ignoreUndefinedProperties: true });
  return firestoreInstance;
}

export function getStorageBucket() {
  initFirebase();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is required for cloud storage");
  }
  return admin.storage().bucket(bucketName);
}

export { admin };
