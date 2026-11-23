import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export const DEFAULT_PROJECT_ID = 'gen-lang-client-0998631791';
export const DEFAULT_STORAGE_BUCKET = 'gen-lang-client-0998631791.firebasestorage.app';
export const FIRESTORE_DATABASE_ID =
  import.meta.env.VITE_FIREBASE_DATABASE_ID ||
  'ai-studio-android-shikkhak-d7cf47c5-f493-43a9-a72b-7dac0283910a';

export interface FirebaseEnvStatus {
  isConfigured: boolean;
  missingVars: string[];
  config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    databaseId: string;
  };
}

export function getFirebaseEnvStatus(): FirebaseEnvStatus {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = (
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${DEFAULT_PROJECT_ID}.firebaseapp.com`
  ).trim();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID).trim();
  const storageBucket = (
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET
  ).trim();
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

  const missingVars: string[] = [];
  if (!apiKey) missingVars.push('VITE_FIREBASE_API_KEY');
  if (!authDomain) missingVars.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!projectId) missingVars.push('VITE_FIREBASE_PROJECT_ID');
  if (!storageBucket) missingVars.push('VITE_FIREBASE_STORAGE_BUCKET');
  if (!messagingSenderId) missingVars.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (!appId) missingVars.push('VITE_FIREBASE_APP_ID');

  return {
    isConfigured: missingVars.length === 0,
    missingVars,
    config: {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      databaseId: FIRESTORE_DATABASE_ID,
    },
  };
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseInstances(): { app: FirebaseApp; db: Firestore } | null {
  const status = getFirebaseEnvStatus();
  if (!status.isConfigured) {
    return null;
  }

  if (cachedApp && cachedDb) {
    return { app: cachedApp, db: cachedDb };
  }

  const app = getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: status.config.apiKey,
        authDomain: status.config.authDomain,
        projectId: status.config.projectId,
        storageBucket: status.config.storageBucket,
        messagingSenderId: status.config.messagingSenderId,
        appId: status.config.appId,
      });

  let db: Firestore;
  try {
    db = initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      FIRESTORE_DATABASE_ID
    );
  } catch {
    db = getFirestore(app, FIRESTORE_DATABASE_ID);
  }

  cachedApp = app;
  cachedDb = db;
  return { app, db };
}
