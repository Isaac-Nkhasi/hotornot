import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ── Your Firebase Project Config ───────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyAKp4ZJkD8BO6W2gzvOdm_5RhQII1Ww-_s',
  authDomain:        'hotornot-18297.firebaseapp.com',
  projectId:         'hotornot-18297',
  storageBucket:     'hotornot-18297.firebasestorage.app',
  messagingSenderId: '614685051233',
  appId:             '1:614685051233:web:e9758f88737acb8f631d20',
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);

export default app;
