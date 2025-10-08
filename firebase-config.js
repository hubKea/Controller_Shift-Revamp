// Firebase Configuration
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyCamrQprliW_K64RdhHCdL6SRsUItZ5jvw",
  authDomain: "thinkers-afrika-shift-reports.firebaseapp.com",
  projectId: "thinkers-afrika-shift-reports",
  storageBucket: "thinkers-afrika-shift-reports.firebasestorage.app",
  messagingSenderId: "641631656735",
  appId: "1:641631656735:web:8103a8eaeb6b98c9996e2a",
  measurementId: "G-PNWN79Y993"
};

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export the app instance
export default app;
