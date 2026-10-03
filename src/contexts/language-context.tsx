"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
// Le routeur de la barre de progression : le passage à l'autre langue la fait avancer
// (le bouton de la carte d'accueil n'est pas un lien, la barre ne partirait pas seule)
import { useRouter } from "next-nprogress-bar";
import { Language, translations } from "@/lib/translations";
import { cheminDansLaLangue, langueDuChemin } from "@/lib/liens-boutique";

// Langue de la boutique.
// - Sous /ar : l'arabe imposé par le layout (prop `langue`), dès le rendu serveur : Google
//   lit la page en arabe.
// - Sous /shop : la langue de la visite (cet onglet), sinon la préférence enregistrée
//   (localStorage 'shop_language'), sinon le français au premier affichage, comme avant.
//   La langue de la visite est celle de la dernière page /ar ouverte ou du dernier choix :
//   un lien /shop/… pris depuis une page arabe reste en arabe. Elle s'oublie avec l'onglet :
//   seul un vrai choix (bouton de l'en-tête, carte d'accueil) devient la préférence.
// Choisir une langue l'enregistre et ouvre la même page dans cette langue :
// /shop/… ↔ /ar/shop/… (lib/liens-boutique).

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const CLE_LANGUE = 'shop_language';
// Carte « Choisissez votre langue » (ChoixLangueAccueil) : déjà proposée, ou langue déjà choisie
const CLE_LANGUE_PROPOSEE = 'lebtex_langue_proposee';
// Si le navigateur refuse le stockage : vrai jusqu'au prochain chargement complet
let proposeeCetteSession = false;

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // stockage bloqué : rien à faire
  }
}

export function marquerLangueProposee() {
  proposeeCetteSession = true;
  ecrire(CLE_LANGUE_PROPOSEE, '1');
}

export function langueDejaProposee(): boolean {
  return proposeeCetteSession || lire(CLE_LANGUE_PROPOSEE) !== null;
}

// Le visiteur a-t-il déjà une langue enregistrée ?
export function langueEnregistree(): Language | null {
  const l = lire(CLE_LANGUE);
  return l === 'fr' || l === 'ar' ? l : null;
}

// Langue de la visite (sessionStorage : oubliée à la fermeture de l'onglet)
const CLE_LANGUE_VISITE = 'lebtex_langue_visite';

function langueDeLaVisite(): Language | null {
  try {
    const l = window.sessionStorage.getItem(CLE_LANGUE_VISITE);
    return l === 'fr' || l === 'ar' ? l : null;
  } catch {
    return null;
  }
}

function noterLangueDeLaVisite(lang: Language) {
  try {
    window.sessionStorage.setItem(CLE_LANGUE_VISITE, lang);
  } catch {
    // stockage bloqué : rien à faire
  }
}

export function LanguageProvider({ children, langue }: { children: ReactNode; langue?: Language }) {
  const router = useRouter();
  const [choisie, setChoisie] = useState<Language>(langue ?? 'fr');
  const language: Language = langue ?? choisie;

  useEffect(() => {
    if (langue) {
      noterLangueDeLaVisite(langue);
      return;
    }
    const l = langueDeLaVisite() ?? langueEnregistree();
    if (l) setChoisie(l);
  }, [langue]);

  const setLanguage = (lang: Language) => {
    ecrire(CLE_LANGUE, lang);
    noterLangueDeLaVisite(lang);
    marquerLangueProposee();
    // Pas l'adresse de cette langue : la même page dans la bonne langue (recherche gardée).
    // La page actuelle ne se retourne pas en attendant : la suivante arrive dans la bonne langue.
    const { pathname, search, hash } = window.location;
    if (langueDuChemin(pathname) !== lang) {
      router.push(cheminDansLaLangue(pathname, lang) + search + hash);
      return;
    }
    if (!langue) setChoisie(lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    let text = translations[key]?.[language] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
