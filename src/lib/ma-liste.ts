// ─── Ma liste (favoris) : les produits gardés d'un cœur, sur ce téléphone ────
// Seulement des identifiants de produits, dans le navigateur (localStorage, sous try/catch) :
// rien n'est envoyé au serveur, rien n'est demandé au client. Une liste illisible repart vide ;
// si le navigateur refuse le stockage (navigation privée), la liste vit le temps de la visite.
// Le cœur des cartes, celui de la fiche (useDansMaListe) et la page /shop/ma-liste (useMaListe)
// lisent la même liste : toucher un cœur met à jour tous les autres, et les autres onglets.
// Les fonctions sur les listes sont pures (testées par le script tsx du chantier).

import { useSyncExternalStore } from 'react';

export const CLE_MA_LISTE = 'lebtex_ma_liste_v1';
export const MAX_MA_LISTE = 200;
// Identifiant de produit : « custom_1780496515405_uryjt », « ac-aiguilles-asst »…
const ID_PRODUIT = /^[A-Za-z0-9_-]{1,100}$/;

// ─── Listes (pur) ────────────────────────────────────────────────────────────

/** La liste relue d'un texte JSON : identifiants valables, sans doublon, 200 au plus. */
export function lireListe(brut: string | null | undefined): string[] {
  let donnees: unknown;
  try {
    donnees = JSON.parse(brut || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(donnees)) return [];
  const ids = donnees.filter((x): x is string => typeof x === 'string' && ID_PRODUIT.test(x));
  return Array.from(new Set(ids)).slice(0, MAX_MA_LISTE);
}

/** Ajouté en tête s'il n'y est pas, retiré s'il y est. */
export function basculer(liste: readonly string[], id: string): string[] {
  if (!ID_PRODUIT.test(id)) return [...liste];
  return liste.includes(id) ? liste.filter(x => x !== id) : [id, ...liste].slice(0, MAX_MA_LISTE);
}

/** Annuler un retrait : `id` revient à sa place d'avant (rien s'il y est déjà). */
export function remettre(liste: readonly string[], id: string, position: number): string[] {
  if (!ID_PRODUIT.test(id) || liste.includes(id)) return [...liste];
  const i = Math.max(0, Math.min(Math.trunc(position) || 0, liste.length));
  return [...liste.slice(0, i), id, ...liste.slice(i)].slice(0, MAX_MA_LISTE);
}

// ─── Dans le navigateur ──────────────────────────────────────────────────────

const VIDE: string[] = [];
let memoire: string[] = VIDE;              // la liste du moment (aussi si le stockage est refusé)
let brutLu: string | null | undefined;     // dernier texte lu dans le stockage
const abonnes = new Set<() => void>();

function instantane(): string[] {
  let brut: string | null;
  try {
    brut = window.localStorage.getItem(CLE_MA_LISTE);
  } catch {
    return memoire;
  }
  if (brut !== brutLu) {
    brutLu = brut;
    memoire = lireListe(brut);
  }
  return memoire;
}

function prevenir() {
  abonnes.forEach(f => f());
}

function enregistrer(liste: string[]) {
  memoire = liste;
  try {
    const brut = JSON.stringify(liste);
    window.localStorage.setItem(CLE_MA_LISTE, brut);
    brutLu = brut;
  } catch { /* stockage plein ou refusé : la liste reste en mémoire pour cette visite */ }
  prevenir();
}

// Un autre onglet a changé la liste
function surStockage(e: StorageEvent) {
  if (e.key === null || e.key === CLE_MA_LISTE) prevenir();
}

function abonner(f: () => void) {
  abonnes.add(f);
  if (abonnes.size === 1) window.addEventListener('storage', surStockage);
  return () => {
    abonnes.delete(f);
    if (abonnes.size === 0) window.removeEventListener('storage', surStockage);
  };
}

const auServeur = () => VIDE;

/** Les identifiants de Ma liste ; vide au rendu serveur (et pendant l'hydratation). */
export function useMaListe(): string[] {
  return useSyncExternalStore(abonner, instantane, auServeur);
}

/**
 * Ce produit est-il dans Ma liste ? Un cœur ne se redessine que si SA réponse change :
 * pas toutes les cartes de la page à chaque cœur touché (téléphones modestes).
 */
export function useDansMaListe(id: string): boolean {
  return useSyncExternalStore(abonner, () => instantane().includes(id), () => false);
}

/** Toucher le cœur : `ajoute` vrai si le produit est maintenant dans la liste ; `position` : sa place d'avant (-1 s'il n'y était pas). */
export function basculerMaListe(id: string): { ajoute: boolean; position: number } {
  const avant = instantane();
  const liste = basculer(avant, id);
  enregistrer(liste);
  return { ajoute: liste.includes(id), position: avant.indexOf(id) };
}

/** « Annuler » après un retrait : le produit revient à sa place. */
export function remettreDansMaListe(id: string, position: number): void {
  enregistrer(remettre(instantane(), id, position));
}
