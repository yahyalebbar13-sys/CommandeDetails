"use client";

import React, { useEffect } from 'react';
import { setPersistence, browserSessionPersistence, inMemoryPersistence } from 'firebase/auth';
import { useAuth } from '@/firebase';
import StockApp from '@/components/stock/stock-app';

export default function StockPage() {
  const auth = useAuth();

  // Le poste de caisse est partagé : la session ne doit pas survivre à la fermeture du
  // navigateur. On bascule la persistance dès l'ouverture de /stock, et pas seulement au moment
  // de la connexion — sinon tous les postes déjà connectés avant cette règle le resteraient
  // indéfiniment, tant que personne ne se déconnecte à la main.
  useEffect(() => {
    if (!auth) return;
    setPersistence(auth, browserSessionPersistence).catch(() => {
      setPersistence(auth, inMemoryPersistence).catch(() => {});
    });
  }, [auth]);

  return <StockApp />;
}
