import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const importMetaEnv =
  typeof import.meta !== 'undefined' && import.meta ? (import.meta.env ?? {}) : {};
const processEnv = typeof process !== 'undefined' && process?.env ? process.env : {};
const globalEnv =
  typeof globalThis !== 'undefined' && globalThis.__FIREBASE_CONFIG__
    ? globalThis.__FIREBASE_CONFIG__
    : {};

const FALLBACK_KEYS = {
  FIREBASE_API_KEY: ['FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY'],
  FIREBASE_AUTH_DOMAIN: ['FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN'],
  FIREBASE_PROJECT_ID: ['FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID'],
  FIREBASE_STORAGE_BUCKET: ['FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET'],
  FIREBASE_MESSAGING_SENDER_ID: [
    'FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
  ],
  FIREBASE_APP_ID: ['FIREBASE_APP_ID', 'VITE_FIREBASE_APP_ID'],
  FIREBASE_MEASUREMENT_ID: ['FIREBASE_MEASUREMENT_ID', 'VITE_FIREBASE_MEASUREMENT_ID'],
};

function resolveEnvValue(key) {
  const variants = FALLBACK_KEYS[key] || [key];
  for (const variant of variants) {
    if (importMetaEnv && typeof importMetaEnv[variant] === 'string' && importMetaEnv[variant]) {
      return importMetaEnv[variant];
    }
    if (processEnv && typeof processEnv[variant] === 'string' && processEnv[variant]) {
      return processEnv[variant];
    }
  }

  const globalKey = key
    .toLowerCase()
    .replace(/^firebase_/, '')
    .replace(/_([a-z])/g, (_, char) => char.toUpperCase());

  if (globalEnv && typeof globalEnv[key] === 'string' && globalEnv[key]) {
    return globalEnv[key];
  }
  if (globalEnv && typeof globalEnv[globalKey] === 'string' && globalEnv[globalKey]) {
    return globalEnv[globalKey];
  }

  return undefined;
}

const firebaseConfig = {
  apiKey: resolveEnvValue('FIREBASE_API_KEY'),
  authDomain: resolveEnvValue('FIREBASE_AUTH_DOMAIN'),
  projectId: resolveEnvValue('FIREBASE_PROJECT_ID'),
  storageBucket: resolveEnvValue('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: resolveEnvValue('FIREBASE_MESSAGING_SENDER_ID'),
  appId: resolveEnvValue('FIREBASE_APP_ID'),
  measurementId: resolveEnvValue('FIREBASE_MEASUREMENT_ID'),
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingRequired = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingRequired.length) {
  const message = `Missing Firebase configuration values: ${missingRequired.join(
    ', '
  )}. Provide them through environment variables or by defining window.__FIREBASE_CONFIG__.`;
  throw new Error(message);
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
