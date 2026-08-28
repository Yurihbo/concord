import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseConfigReady = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.storageBucket);
const safeFirebaseConfig = firebaseConfigReady ? firebaseConfig : {
  apiKey: "missing-public-config",
  authDomain: "missing-public-config.invalid",
  projectId: "missing-public-config",
  storageBucket: "missing-public-config",
  appId: "missing-public-config",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(safeFirebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = (() => {
  try {
    return initializeFirestore(firebaseApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(firebaseApp);
  }
})();
export const firebaseStorage = getStorage(firebaseApp);

export function hasFirebaseConfig(): boolean {
  return firebaseConfigReady;
}

export const missingFirebaseConfigKeys = [
  ["VITE_FIREBASE_API_KEY", firebaseConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
  ["VITE_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket],
  ["VITE_FIREBASE_APP_ID", firebaseConfig.appId],
].filter(([, value]) => !value).map(([key]) => key);
