"use client";

import { useEffect, useState } from 'react';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { app } from '@/lib/firebase-db'; // wait, firebase-db exports db, not app. I should import app.

// Let's manually init
import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

export default function CreateUsers() {
  const [status, setStatus] = useState<string>('Creating...');

  useEffect(() => {
    async function create() {
      const users = [
        { email: 'ahmed@lebtex.ma', password: 'Lebtex2026' },
        { email: 'hafid@lebtex.ma', password: 'Lebtex2026' }
      ];
      let res = '';
      for (const u of users) {
        try {
          await createUserWithEmailAndPassword(auth, u.email, u.password);
          res += `Créé avec succès: ${u.email}\n`;
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            res += `Existe déjà: ${u.email}\n`;
          } else {
            res += `Erreur pour ${u.email}: ${err.message}\n`;
          }
        }
      }
      setStatus(res);
    }
    create();
  }, []);

  return (
    <div style={{ padding: 40, whiteSpace: 'pre-wrap' }}>
      <h1>Création des comptes</h1>
      <p>{status}</p>
    </div>
  );
}
