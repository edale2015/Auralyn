import * as admin from "firebase-admin";

let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is required");
  }

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID environment variable is required");
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId,
    });

    console.log(`Firebase initialized for project: ${projectId}`);
    return firebaseApp;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
}

export function getFirestore(): admin.firestore.Firestore {
  const app = getFirebaseApp();
  return app.firestore();
}
