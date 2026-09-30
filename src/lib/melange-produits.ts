// Ordre des produits en vitrine (accueil, boutique, rayons) : mélangé à chaque visite,
// les rayons alternés, et stable pendant la navigation (même graine pour toute la visite,
// gardée dans sessionStorage). Les ruptures et les produits « sur demande » restent en fin
// de liste. Avant la lecture de la graine (rendu serveur, premier rendu), seul ce classement
// s'applique : le mélange arrive juste après l'hydratation, sans écart serveur / navigateur.

import { useEffect, useState } from 'react';
import type { ShopProduct } from './shop-types';
import { getProductDisplayPrice } from './shop-utils';

const CLE_GRAINE = 'lebtex_melange';

// Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même ordre
function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function battre<T>(liste: T[], hasard: () => number): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Alterne les rayons : on tire le rayon suivant au hasard, en proportion des produits qu'il
// lui reste, sans reprendre le rayon du produit précédent quand c'est possible
function alternerRayons<T extends Pick<ShopProduct, 'categorySlug'>>(liste: T[], hasard: () => number): T[] {
  const paquets = new Map<string, T[]>();
  for (const p of liste) {
    const cle = p.categorySlug || '';
    const paquet = paquets.get(cle);
    if (paquet) paquet.push(p);
    else paquets.set(cle, [p]);
  }
  const resultat: T[] = [];
  let precedent: string | null = null;
  while (resultat.length < liste.length) {
    const restants = Array.from(paquets.entries()).filter(([, paquet]) => paquet.length > 0);
    const autres = restants.filter(([cle]) => cle !== precedent);
    const candidats = autres.length > 0 ? autres : restants;
    let tirage = hasard() * candidats.reduce((n, [, paquet]) => n + paquet.length, 0);
    let choix = candidats[candidats.length - 1];
    for (const candidat of candidats) {
      tirage -= candidat[1].length;
      if (tirage < 0) {
        choix = candidat;
        break;
      }
    }
    resultat.push(choix[1].shift()!);
    precedent = choix[0];
  }
  return resultat;
}

// 0 : disponible et chiffré ; 1 : « sur demande » ; 2-3 : en rupture
export function rangVitrine(p: Pick<ShopProduct, 'inStock' | 'price' | 'variants'>): number {
  return (p.inStock === false ? 2 : 0) + (getProductDisplayPrice(p).amount > 0 ? 0 : 1);
}

export function melangerProduits<T extends ShopProduct>(liste: T[], graine: number | null): T[] {
  const parRang = new Map<number, T[]>();
  for (const p of liste) {
    const rang = rangVitrine(p);
    parRang.set(rang, [...(parRang.get(rang) || []), p]);
  }
  const rangs = Array.from(parRang.keys()).sort((a, b) => a - b);
  if (graine === null) return rangs.flatMap(rang => parRang.get(rang)!);
  const hasard = aleatoire(graine);
  return rangs.flatMap(rang => alternerRayons(battre(parRang.get(rang)!, hasard), hasard));
}

// Graine de la visite : créée à la première page, gardée jusqu'à la fermeture de l'onglet
export function useGraineMelange(): number | null {
  const [graine, setGraine] = useState<number | null>(null);
  useEffect(() => {
    let valeur: number | null = null;
    try {
      const lue = Number(sessionStorage.getItem(CLE_GRAINE));
      if (Number.isFinite(lue) && lue > 0) valeur = lue;
    } catch {}
    if (valeur === null) {
      valeur = Math.floor(Math.random() * 2147483646) + 1;
      try {
        sessionStorage.setItem(CLE_GRAINE, String(valeur));
      } catch {}
    }
    setGraine(valeur);
  }, []);
  return graine;
}

// Date d'ajout d'un produit (createdAt, sinon l'horodatage de son identifiant custom_<ms>_…)
export function dateAjout(p: Pick<ShopProduct, 'id' | 'createdAt'>): number {
  const c = p.createdAt as { seconds?: number; toMillis?: () => number } | number | string | undefined;
  if (typeof c === 'number') return c;
  if (typeof c === 'string') {
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  if (c && typeof c === 'object') {
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c.seconds === 'number') return c.seconds * 1000;
  }
  const m = /^custom_(\d{10,})/.exec(p.id);
  return m ? Number(m[1]) : 0;
}

// Tri « Nouveautés » : produits marqués nouveaux d'abord, puis les plus récents
export function comparerNouveautes(a: ShopProduct, b: ShopProduct): number {
  return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || dateAjout(b) - dateAjout(a);
}
