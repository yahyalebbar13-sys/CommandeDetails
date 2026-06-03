// Shared Firestore db instance — importable from any client component
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
