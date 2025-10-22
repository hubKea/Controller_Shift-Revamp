import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

function readFirebaseConfig() {
  const globalConfig =
    typeof window !== 'undefined' && window.__FIREBASE_CONFIG__
      ? window.__FIREBASE_CONFIG__
      : undefined;

  if (!globalConfig || typeof globalConfig !== 'object') {
    throw new Error(
      'Firebase configuration is missing. Define window.__FIREBASE_CONFIG__ before loading firebase-config.js.'
    );
  }

  const normalized = Object.freeze({
    apiKey:
      globalConfig.apiKey ??
      globalConfig.FIREBASE_API_KEY ??
      globalConfig.VITE_FIREBASE_API_KEY ??
      null,
    authDomain:
      globalConfig.authDomain ??
      globalConfig.FIREBASE_AUTH_DOMAIN ??
      globalConfig.VITE_FIREBASE_AUTH_DOMAIN ??
      null,
    projectId:
      globalConfig.projectId ??
      globalConfig.FIREBASE_PROJECT_ID ??
      globalConfig.VITE_FIREBASE_PROJECT_ID ??
      null,
    storageBucket:
      globalConfig.storageBucket ??
      globalConfig.FIREBASE_STORAGE_BUCKET ??
      globalConfig.VITE_FIREBASE_STORAGE_BUCKET ??
      null,
    messagingSenderId:
      globalConfig.messagingSenderId ??
      globalConfig.FIREBASE_MESSAGING_SENDER_ID ??
      globalConfig.VITE_FIREBASE_MESSAGING_SENDER_ID ??
      null,
    appId:
      globalConfig.appId ??
      globalConfig.FIREBASE_APP_ID ??
      globalConfig.VITE_FIREBASE_APP_ID ??
      null,
    measurementId:
      globalConfig.measurementId ??
      globalConfig.FIREBASE_MEASUREMENT_ID ??
      globalConfig.VITE_FIREBASE_MEASUREMENT_ID ??
      null,
  });

  const missingKeys = REQUIRED_KEYS.filter((key) => !normalized[key]);
  if (missingKeys.length) {
    throw new Error(
      `Missing Firebase configuration values: ${missingKeys.join(
        ', '
      )}. Ensure window.__FIREBASE_CONFIG__ defines the required keys before firebase-config.js is loaded.`
    );
  }

  return normalized;
}

export const firebaseConfig = readFirebaseConfig();

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
