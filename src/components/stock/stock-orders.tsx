"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { LOGO_B64 } from '@/lib/logo-b64';
import { useToast } from '@/hooks/use-toast';
import { imprimerHtml, messageImpression } from '@/lib/impression';
import { Search, Printer, X, Tag, Loader2, Clock, CheckCircle2, Banknote, PackageCheck, Undo2, Truck } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { attendUnPrix } from '@/lib/commande-sans-prix';
import {
  statutBon, natureBon, LIBELLE_NATURE, bonEnCours, bonComptoirEnAttente, estSortiAuBon,
  ancienneteMinutes, libelleAnciennete, SEUIL_URGENCE_MINUTES, trierBons, bonCorrespond,
  grouperLignesBon, appliquerSaisieBon, comparerTotalPapier, instantCreation,
  encoursClient, controleCreditAuBon, controleCreditAvantSortie, controleCreditFinalisation, emplacementsDesLignes, estNumeroProvisoire,
  varianteDeLigne, prixParUnitePrix, factureDuBon, factureNonReglee, bonSansClient, estLigneDeBonEtagere,
  type SaisieBon, type ResultatSaisie, type CodeStatutBon,
} from '@/lib/bon-sans-prix';
import { construireBonHtml, libellePrixParUnite, libelleContenance } from '@/lib/bon-imprime';
import { allocateOutbound } from '@/lib/warehouse-locations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { SaleOrder, Client, Invoice } from '@/lib/types';

/**
 * « Bons à chiffrer » : là où le gestionnaire saisit ce que le commercial a écrit sur le bon.
 *
 * Le bon est sorti sans prix ; il revient avec un prix unitaire par produit et qualité, une
 * remise, parfois une quantité corrigée, et le total écrit à la main. Le gestionnaire tape tout
 * ici, puis tape le total du papier : s'il ne tombe pas juste, l'écran le dit avant d'aller plus
 * loin. « Finaliser et encaisser » crée la facture et ouvre l'encaissement.
 *
 * Les bons comptoir passent en tête, en rouge, avec leur ancienneté : ce sont eux qu'on oublie.
 */

interface StockOrdersProps {
  /** Les bons du magasin affiché. */
  orders: SaleOrder[];
  /**
   * TOUS les bons, tous magasins : les anciens numéros « BC-N » se calculent sur la liste
   * complète, comme avant — sinon le même papier « BC-0042 » s'appelait autrement selon le
   * magasin affiché.
   */
  tousLesBons?: SaleOrder[];
  clients: Client[];
  invoices: Invoice[];
  /** Les mouvements de stock : ils disent d'où la marchandise de chaque ligne est sortie. */
  movements: any[];
  /** Les articles : leur ventilation dit dans quels racks puiser (couleur, qualité ou taille). */
  articles?: any[];
  stores: any[];
  /** L'heure courante, rafraîchie par l'application : l'ancienneté des bons comptoir en dépend. */
  maintenant: number;
  /** Compte en lecture seule : il consulte, il ne saisit rien. */
  lectureSeule?: boolean;
  /** Ce qui reste en stock d'une ligne (sa variante) dans un lieu ; null si inconnu. */
  disponibleLigne?: (ligne: any, lieu: string) => number | null;
  /** Un bon à ouvrir dès l'arrivée sur l'écran (bandeau rouge, caisse). */
  bonAOuvrir?: string | null;
  onBonOuvert?: () => void;
  onAnnulerBon: (bon: SaleOrder, numeroAffiche?: string) => Promise<void>;
  onEnregistrerBon: (bonId: string, saisie: ResultatSaisie & { totalPapier?: number | null }) => Promise<void>;
  onFinaliserBon: (bon: SaleOrder) => Promise<void>;
  /** Commande à préparer : le client enlève la marchandise, elle sort du stock maintenant. */
  onEnleverBon?: (bon: SaleOrder) => Promise<void>;
  /** Bon facturé pas encore réglé : rouvrir son encaissement. */
  onEncaisserBon?: (bon: SaleOrder) => void;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => (Number(n) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Prix unitaire : jusqu'à trois décimales (mercerie). */
const fmtPU = (n: number) => (Number(n) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmtQte = (n: number) => (Number(n) || 0).toLocaleString('fr-MA', { maximumFractionDigits: 3 });

const BADGE_STATUT: Record<CodeStatutBon, string> = {
  A_CHIFFRER: 'bg-amber-100 text-amber-800 border-amber-300',
  A_ENCAISSER: 'bg-blue-100 text-blue-700 border-blue-200',
  TERMINE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ANNULE: 'bg-stone-100 text-stone-500 border-stone-200',
};

const BADGE_NATURE = {
  COMPTOIR: 'bg-red-100 text-red-700 border-red-200',
  CLIENT: 'bg-violet-100 text-violet-700 border-violet-200',
  A_PREPARER: 'bg-stone-100 text-stone-600 border-stone-200',
} as const;

const SAISIE_VIDE: SaisieBon = { prixGroupe: {}, prixLigne: {}, qteLigne: {} };

export default function StockOrders({
  orders, tousLesBons, clients, invoices, movements, articles = [], stores, maintenant, lectureSeule = false,
  disponibleLigne, bonAOuvrir, onBonOuvert,
  onAnnulerBon, onEnregistrerBon, onFinaliserBon, onEnleverBon, onEncaisserBon, onNavigate,
}: StockOrdersProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [filtreStatut, setFiltreStatut] = useState<string>('all');
  const [filtreMois, setFiltreMois] = useState<string>('all');
  const [recherche, setRecherche] = useState('');
  // On garde l'IDENTIFIANT, pas le bon : une photo prise à l'ouverture continuerait d'afficher
  // l'ancien état après enregistrement, et le réécrirait si une autre caisse y avait touché.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<SaisieBon>(SAISIE_VIDE);
  const [totalPapier, setTotalPapier] = useState('');
  const [enCours, setEnCours] = useState<null | 'enregistrement' | 'finalisation' | 'annulation' | 'enlevement'>(null);

  const nomLieu = (id?: string) => (id ? (stores.find((s: any) => s.id === id)?.name || id) : '');

  // ── Numéro affiché ──
  // Le numéro du bon (CH-0001) quand il existe ; pour les anciennes commandes, le « BC-N »
  // calculé à l'écran comme avant, sur la liste COMPLÈTE des bons (tous magasins) : c'est ce
  // numéro-là qui a été imprimé. Ils ne se confondent pas, les nouveaux ne commencent jamais par BC.
  const listeComplete = tousLesBons && tousLesBons.length > 0 ? tousLesBons : orders;
  const numeroDe = useMemo(() => {
    const anciens = [...listeComplete].filter(o => !o.orderNumber)
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    const rang = new Map(anciens.map((o, i) => [o.id, i + 1]));
    return (o: SaleOrder) => o.orderNumber || `BC-${String(rang.get(o.id) || 0).padStart(4, '0')}`;
  }, [listeComplete]);

  /** La facture d'un bon facturé qui attend encore de l'argent, s'il y en a une. */
  const factureAEncaisser = (bon: SaleOrder) => {
    if (bon.status !== 'INVOICED') return null;
    const f = factureDuBon(bon, invoices);
    return factureNonReglee(f) ? f : null;
  };

  const mois = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => o.date && s.add(o.date.substring(0, 7)));
    return Array.from(s).sort().reverse();
  }, [orders]);

  const filtres = useMemo(() => {
    let r = trierBons(orders, maintenant, invoices);
    if (filtreStatut === 'EN_COURS') r = r.filter(o => bonEnCours(o) || bonComptoirEnAttente(o, invoices));
    else if (filtreStatut !== 'all') r = r.filter(o => statutBon(o, invoices).code === filtreStatut);
    if (filtreMois !== 'all') r = r.filter(o => (o.date || '').startsWith(filtreMois));
    if (recherche.trim()) r = r.filter(o => bonCorrespond(o, recherche, numeroDe(o)));
    return r;
  }, [orders, invoices, maintenant, filtreStatut, filtreMois, recherche, numeroDe]);

  const nbEnCours = orders.filter(o => bonEnCours(o)).length;
  const nbComptoir = orders.filter(o => bonComptoirEnAttente(o, invoices)).length;

  // ── Le bon ouvert ──
  const selected = useMemo(() => orders.find(o => o.id === selectedId) || null, [orders, selectedId]);
  const modifiable = !!selected && bonEnCours(selected) && !lectureSeule;
  const apercu = useMemo(
    () => appliquerSaisieBon(selected?.items || [], saisie, selected?.discount),
    [selected, saisie],
  );
  const groupes = useMemo(() => grouperLignesBon(selected?.items || []), [selected]);
  const comparaison = comparerTotalPapier(apercu.totalAfterDiscount, totalPapier);
  const saisieModifiee = Object.keys(saisie.prixGroupe || {}).length > 0
    || Object.keys(saisie.prixLigne || {}).length > 0
    || Object.keys(saisie.qteLigne || {}).length > 0
    || saisie.remise !== undefined
    || (totalPapier.trim() !== '' && comparaison.saisi !== (selected?.totalPapier ?? null));

  /** D'où prendre la marchandise de chaque ligne : ses mouvements si elle est sortie, sinon un aperçu FIFO. */
  const emplacementsDe = (bon: SaleOrder): Record<number, string[]> => {
    if (estSortiAuBon(bon)) return emplacementsDesLignes(bon.items || [], movements, bon.id);
    const res: Record<number, string[]> = {};
    (bon.items || []).forEach((l: any, i: number) => {
      // Une ligne vendue aux ÉTAGÈRES ne se prend dans aucun rack : elle est sur les étagères du
      // magasin (src/lib/etageres.ts). Sans variante, la FIFO prendrait les racks de réserve de
      // l'article, toutes couleurs, et y lirait des pièces comme des sacs.
      if (estLigneDeBonEtagere(l)) return;
      // Les racks de LA variante de la ligne (couleur, qualité ou taille, selon la ventilation de
      // l'article) — jamais « la qualité d'abord », qui enverrait chercher le Bleu dans le rack du Rouge.
      const variante = varianteDeLigne(l, articles);
      try {
        const { allocations } = allocateOutbound({
          movements, storeId: l.storeId || bon.storeId || 'CHRIFA', articleId: l.articleId,
          quantity: Number(l.qty) || 0, variant: variante, lieux: stores,
        });
        if (allocations.length > 0) res[i] = allocations.map(a => a.locationCode);
      } catch (_) { /* un aperçu, pas une écriture : s'il échoue, la case reste vide */ }
    });
    return res;
  };
  const emplacementsOuverts = useMemo(() => (selected ? emplacementsDe(selected) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, movements, stores, articles]);

  /** Le lieu d'où sort une ligne. */
  const lieuDeLigne = (bon: SaleOrder, ligne: any) => ligne?.storeId || bon.storeId || 'CHRIFA';

  /**
   * Les lignes qui sortiraient plus que le stock restant, en phrases. `quantites[i]` est ce qui
   * doit sortir MAINTENANT pour la ligne i (le supplément d'une correction, ou toute la ligne à
   * l'enlèvement). La caisse s'arrête au stock ; ici on prévient, et le gestionnaire confirme.
   */
  const depassements = (bon: SaleOrder, quantites: Record<number, number>): string[] => {
    if (!disponibleLigne) return [];
    const phrases: string[] = [];
    for (const [k, q] of Object.entries(quantites)) {
      const i = Number(k);
      const ligne: any = (bon.items || [])[i];
      if (!ligne || !(q > 0)) continue;
      const dispo = disponibleLigne(ligne, lieuDeLigne(bon, ligne));
      if (dispo != null && q > dispo + 0.0005) {
        const quoi = `${ligne.productName || ''}${ligne.color ? ` ${ligne.color}` : ''}${ligne.size ? ` ${ligne.size}` : ''}`;
        // disponibleLigne compte les étagères pour une ligne vendue aux étagères : on le dit.
        const ou = estLigneDeBonEtagere(ligne) ? 'sur les étagères' : 'en stock';
        phrases.push(`${quoi} : ${fmtQte(q)} ${ligne.unitOfMeasure || ''} à sortir, il n'en reste que ${fmtQte(Math.max(0, dispo))} ${ou}`);
      }
    }
    return phrases;
  };

  const ouvrir = (id: string) => {
    const bon = orders.find(o => o.id === id);
    setSaisie(SAISIE_VIDE);
    setTotalPapier(bon?.totalPapier != null ? String(bon.totalPapier).replace('.', ',') : '');
    setSelectedId(id);
  };

  // Arrivée depuis le bandeau rouge ou la caisse : le bon s'ouvre tout seul.
  useEffect(() => {
    if (!bonAOuvrir) return;
    if (orders.some(o => o.id === bonAOuvrir)) {
      ouvrir(bonAOuvrir);
      onBonOuvert?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonAOuvrir, orders]);

  const fermer = async () => {
    if (saisieModifiee && modifiable) {
      const ok = await confirm({
        title: 'Saisie non enregistrée',
        description: 'Des prix ou des quantités ont été saisis sans être enregistrés.\n\nFermer maintenant les efface.',
        confirmLabel: 'Fermer sans enregistrer',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    setSelectedId(null);
    setSaisie(SAISIE_VIDE);
    setTotalPapier('');
  };

  // ── Saisie ──
  const prixDuGroupe = (cle: string, prixUnique: number | null) =>
    saisie.prixGroupe?.[cle] !== undefined ? saisie.prixGroupe[cle] : (prixUnique ? String(prixUnique).replace('.', ',') : '');

  const changerPrixGroupe = (cle: string, valeur: string, indexes: number[]) => {
    // Le prix du groupe se recopie sur toutes ses couleurs : les prix tapés ligne par ligne
    // dans ce groupe s'effacent, sinon ils masqueraient le nouveau prix sans qu'on le voie.
    setSaisie(s => {
      const prixLigne = { ...(s.prixLigne || {}) };
      for (const i of indexes) delete prixLigne[i];
      return { ...s, prixGroupe: { ...(s.prixGroupe || {}), [cle]: valeur }, prixLigne };
    });
  };

  // Le prix se lit et se tape dans l'unité du prix (au mètre, à la pièce) — pas au rouleau.
  const prixAfficheLigne = (i: number) => {
    if (saisie.prixLigne?.[i] !== undefined) return saisie.prixLigne[i];
    const p = prixParUnitePrix(apercu.toutes[i]);
    return p > 0 ? String(p).replace('.', ',') : '';
  };

  const qteAfficheeLigne = (i: number) =>
    saisie.qteLigne?.[i] !== undefined ? saisie.qteLigne[i] : String(Number(selected?.items?.[i]?.qty) || 0).replace('.', ',');

  /** Ce que les quantités corrigées feront au stock, en une phrase. */
  const effetSurLeStock = (r: ResultatSaisie): string => {
    if (!selected || r.changements.length === 0) return '';
    if (!estSortiAuBon(selected)) return 'Rien n\'est encore sorti du stock : la marchandise sortira à l\'enlèvement, aux nouvelles quantités.';
    return r.changements.map(c => {
      const l = selected.items[c.index] as any;
      const diff = Math.round((c.apres - c.avant) * 1000) / 1000;
      const quoi = `${l?.productName || ''}${l?.color ? ` ${l.color}` : ''}`;
      return diff < 0
        ? `${quoi} : ${fmtQte(-diff)} ${l?.unitOfMeasure || ''} rentre${c.apres === 0 ? ' (ligne retirée)' : ''} en stock`
        : `${quoi} : ${fmtQte(diff)} ${l?.unitOfMeasure || ''} sort en plus du stock`;
    }).join('\n');
  };

  const enregistrer = async (): Promise<boolean> => {
    if (!selected) return false;
    if (apercu.items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Toutes les lignes sont à zéro',
        description: 'Pour rendre toute la marchandise, annulez le bon : elle reviendra en stock.',
      });
      return false;
    }
    if (apercu.changements.length > 0) {
      // Une hausse sur un bon déjà sorti sort du stock en plus : au-delà de ce qui reste, on le dit.
      const trop = estSortiAuBon(selected)
        ? depassements(selected, Object.fromEntries(apercu.changements.filter(c => c.apres > c.avant).map(c => [c.index, Math.round((c.apres - c.avant) * 1000) / 1000])))
        : [];
      const ok = await confirm({
        title: trop.length > 0 ? 'Quantités corrigées — stock insuffisant' : 'Quantités corrigées',
        description: `${effetSurLeStock(apercu)}\n\n`
          + (trop.length > 0
            ? `ATTENTION, le stock ne suffit pas :\n${trop.join('\n')}\n\nVérifiez la quantité tapée. Si le client a vraiment pris plus, la sortie sera marquée « Dépassement stock » au journal.\n\n`
            : '')
          + 'Confirmer ces corrections ?',
        confirmLabel: trop.length > 0 ? 'Sortir quand même' : 'Corriger les quantités',
        variant: trop.length > 0 ? 'destructive' : 'default',
      });
      if (!ok) return false;
    }
    setEnCours('enregistrement');
    try {
      await onEnregistrerBon(selected.id, { ...apercu, totalPapier: comparaison.saisi });
      setSaisie(SAISIE_VIDE);
      return true;
    } catch (err: any) {
      console.error('[bon] enregistrement :', err);
      toast({ variant: 'destructive', title: 'Enregistrement impossible', description: err?.message || String(err) });
      return false;
    } finally {
      setEnCours(null);
    }
  };

  const enregistrerSeulement = async () => {
    if (await enregistrer()) {
      toast({
        title: 'Bon enregistré',
        description: apercu.restantSansPrix > 0
          ? `${apercu.restantSansPrix} ligne(s) attendent encore leur prix.`
          : 'Le bon est chiffré : il reste à le finaliser et l\'encaisser.',
      });
    }
  };

  const finaliser = async () => {
    if (!selected) return;
    const bon = selected;
    if (apercu.items.length === 0) {
      toast({ variant: 'destructive', title: 'Toutes les lignes sont à zéro', description: 'Annulez plutôt le bon.' });
      return;
    }
    if (apercu.restantSansPrix > 0) {
      const ok = await confirm({
        title: 'Prix manquant',
        description: `${apercu.restantSansPrix === 1 ? "Une ligne n'a pas de prix" : `${apercu.restantSansPrix} lignes n'ont pas de prix`} : `
          + 'elles seront facturées à zéro.\n\nUne fois facturé, le bon ne peut plus recevoir de prix.',
        confirmLabel: 'Facturer quand même',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    // Le total écrit à la main est la preuve que la saisie recopie bien le papier.
    if (bon.orderNumber && comparaison.saisi == null) {
      toast({
        variant: 'destructive',
        title: 'Total du bon à taper',
        description: 'Tapez le total écrit sur le bon par le commercial : il est comparé au total calculé.',
      });
      return;
    }
    if (comparaison.saisi != null && !comparaison.concorde) {
      const ok = await confirm({
        title: 'Le total ne correspond pas',
        description: `Total écrit sur le bon : ${fmt$(comparaison.saisi)} MAD\nTotal calculé : ${fmt$(apercu.totalAfterDiscount)} MAD\n`
          + `Écart : ${comparaison.ecart > 0 ? '+' : ''}${fmt$(comparaison.ecart)} MAD\n\n`
          + 'Vérifiez les prix, les quantités et la remise. C\'est le total calculé qui sera facturé.',
        confirmLabel: 'Finaliser quand même',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    const client = clients.find(c => c.id === bon.clientId);
    if (!estSortiAuBon(bon)) {
      // Commande à préparer : c'est CETTE finalisation qui fait sortir la marchandise. Un client
      // bloqué, au plafond, ou que ce bon ferait passer au-delà, ne part pas avec.
      if (client) {
        const refus = controleCreditAvantSortie(
          client, encoursClient(client.id, invoices, orders.filter(o => o.id !== bon.id)), apercu.totalAfterDiscount);
        if (refus.refuse) {
          toast({ variant: 'destructive', title: 'Finalisation refusée : crédit', description: refus.raison });
          return;
        }
      }
      // `toutes` garde l'ordre des lignes du bon : le rang i est celui de bon.items[i].
      const trop = depassements(bon, Object.fromEntries(apercu.toutes.map((l: any, i: number) => [i, Number(l?.qty) || 0])));
      const ok = await confirm({
        title: 'La marchandise sort du stock maintenant',
        description: 'Cette commande n\'était pas encore sortie : la finaliser fait sortir la marchandise du stock aujourd\'hui.'
          + (trop.length > 0 ? `\n\nATTENTION, le stock ne suffit pas :\n${trop.join('\n')}` : ''),
        confirmLabel: 'Finaliser et sortir la marchandise',
        variant: trop.length > 0 ? 'destructive' : 'default',
      });
      if (!ok) return;
    } else if (client) {
      // Bon déjà sorti : la marchandise est partie, on ne bloque plus — on prévient.
      const encours = encoursClient(client.id, invoices, orders.filter(o => o.id !== bon.id));
      const controle = controleCreditFinalisation(client, encours, apercu.totalAfterDiscount);
      if (controle.avertir) {
        const ok = await confirm({
          title: 'Plafond de crédit',
          description: controle.message || '',
          confirmLabel: 'Finaliser quand même',
          variant: 'destructive',
        });
        if (!ok) return;
      }
    }

    if (!(await enregistrer())) return;
    setEnCours('finalisation');
    try {
      await onFinaliserBon({
        ...bon,
        items: apercu.items,
        discount: apercu.discount,
        totalAmount: apercu.totalAmount,
        totalAfterDiscount: apercu.totalAfterDiscount,
      } as SaleOrder);
      setSelectedId(null);
      setTotalPapier('');
    } catch (err: any) {
      console.error('[bon] finalisation :', err);
      toast({ variant: 'destructive', title: 'Facturation impossible', description: err?.message || String(err) });
    } finally {
      setEnCours(null);
    }
  };

  const annuler = async (bon: SaleOrder) => {
    const sorti = estSortiAuBon(bon);
    const ok = await confirm({
      title: `Annuler le bon ${numeroDe(bon)} ?`,
      description: sorti
        ? 'La marchandise revient en stock : chaque article rentre à l\'emplacement d\'où il était sorti. '
          + 'Le journal des mouvements gardera la sortie et le retour.\n\nÀ faire seulement si le client a rendu la marchandise, ou si elle n\'est jamais partie.'
        : 'Rien n\'était sorti du stock pour cette commande : elle est simplement annulée.',
      confirmLabel: sorti ? 'Oui, annuler — la marchandise revient en stock' : 'Oui, annuler la commande',
      // Deux boutons qui commencent par « Annuler » se confondent sur un écran tactile.
      cancelLabel: sorti ? 'Garder le bon' : 'Garder la commande',
      variant: 'destructive',
    });
    if (!ok) return;
    setEnCours('annulation');
    try {
      await onAnnulerBon(bon, numeroDe(bon));
      if (selectedId === bon.id) { setSelectedId(null); setSaisie(SAISIE_VIDE); setTotalPapier(''); }
    } catch (err: any) {
      console.error('[bon] annulation :', err);
      toast({ variant: 'destructive', title: 'Annulation impossible', description: err?.message || String(err) });
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Commande à préparer : le client vient la chercher. La marchandise sort du stock MAINTENANT,
   * même si le commercial n'a pas encore rendu les prix — le bon devient un bon sorti, à
   * chiffrer ensuite comme les autres (et rappelé en rouge s'il n'a pas de client).
   */
  const enlever = async (bon: SaleOrder) => {
    if (!onEnleverBon) return;
    const client = clients.find(c => c.id === bon.clientId);
    if (client) {
      const refus = controleCreditAuBon(client, encoursClient(client.id, invoices, orders.filter(o => o.id !== bon.id)));
      if (refus.refuse) {
        toast({ variant: 'destructive', title: 'Enlèvement refusé : crédit', description: refus.raison });
        return;
      }
    }
    if (selected?.id === bon.id && saisieModifiee) {
      toast({
        variant: 'destructive',
        title: 'Saisie non enregistrée',
        description: 'Enregistrez d\'abord les prix ou les quantités tapés, puis faites enlever la marchandise.',
      });
      return;
    }
    const trop = depassements(bon, Object.fromEntries((bon.items || []).map((l: any, i: number) => [i, Number(l?.qty) || 0])));
    const ok = await confirm({
      title: `Le client enlève la commande ${numeroDe(bon)} ?`,
      description: 'La marchandise sort du stock maintenant, aux quantités du bon. Les prix pourront être saisis ensuite, '
        + 'quand le commercial rendra le bon.'
        + (bonSansClient(bon) ? '\n\nSans client : le bon devient une vente comptoir, à chiffrer et encaisser tout de suite.' : '')
        + (trop.length > 0 ? `\n\nATTENTION, le stock ne suffit pas :\n${trop.join('\n')}` : ''),
      confirmLabel: 'Oui, la marchandise sort',
      cancelLabel: 'Pas encore',
      variant: trop.length > 0 ? 'destructive' : 'default',
    });
    if (!ok) return;
    setEnCours('enlevement');
    try {
      await onEnleverBon(bon);
    } catch (err: any) {
      console.error('[bon] enlèvement :', err);
      toast({ variant: 'destructive', title: 'Enlèvement impossible', description: err?.message || String(err) });
    } finally {
      setEnCours(null);
    }
  };

  // ── Impression : la même mise en page de bon partout (src/lib/bon-imprime.ts) ──
  const imprimer = (bon: SaleOrder) => {
    try {
      const t = instantCreation(bon);
      const heure = (bon as any).creeLe || bon.createdAt
        ? new Date(t || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : undefined;
      const html = construireBonHtml({
        numero: numeroDe(bon),
        nature: natureBon(bon),
        clientNom: bon.clientName,
        clientTelephone: clients.find(c => c.id === bon.clientId)?.phone,
        magasin: nomLieu(bon.storeId),
        date: bon.date,
        heure,
        items: bon.items || [],
        emplacements: emplacementsDe(bon),
        nomsLieux: Object.fromEntries(stores.map((s: any) => [s.id, s.name || s.id])),
        lieuDuBon: bon.storeId,
        discount: bon.discount,
        totalAmount: bon.totalAmount,
        totalAfterDiscount: bon.totalAfterDiscount,
        notes: bon.notes,
        logo: LOGO_B64,
      });
      imprimerHtml(html).catch(e => toast({ variant: 'destructive', title: 'Impression impossible', description: messageImpression(e) }));
    } catch (e: any) {
      console.error('[bon] impression impossible :', e);
      toast({ variant: 'destructive', title: 'Impression impossible', description: messageImpression(e) });
    }
  };

  const totalFiltre = filtres.reduce((s, o) => s + (Number(o.totalAfterDiscount) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-black text-stone-400 uppercase tracking-[0.3em] mb-1">Ventes</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Bons <span className="text-stone-400">à chiffrer</span></h1>
            <p className="text-stone-400 text-xs font-bold mt-2">
              {nbEnCours} bon{nbEnCours > 1 ? 's' : ''} à traiter
              {nbComptoir > 0 && <span className="text-red-300"> · dont {nbComptoir} comptoir</span>}
            </p>
          </div>
          <Button onClick={() => onNavigate('sale')}
            className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 border border-white/20 shrink-0">
            + Nouvelle vente
          </Button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-[12px] font-medium text-stone-600 leading-relaxed">
        <span className="font-black text-stone-800">Le parcours :</span> le commercial rend le bon avec les prix
        unitaires (au mètre ou à la pièce), la remise et le total. Ouvrez le bon avec « Chiffrer », tapez un prix
        par produit, la remise, corrigez une quantité si le client a pris moins, tapez le total écrit sur le papier,
        puis « Finaliser et encaisser ».
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Numéro du bon (CH-0012) ou nom du client…" value={recherche} onChange={e => setRecherche(e.target.value)}
            className="pl-9 h-11 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Select value={filtreStatut} onValueChange={setFiltreStatut}>
          <SelectTrigger className="h-11 w-48 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les bons</SelectItem>
            <SelectItem value="EN_COURS">À traiter</SelectItem>
            <SelectItem value="A_CHIFFRER">À chiffrer</SelectItem>
            <SelectItem value="A_ENCAISSER">Chiffré, à encaisser</SelectItem>
            <SelectItem value="TERMINE">Terminé</SelectItem>
            <SelectItem value="ANNULE">Annulé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtreMois} onValueChange={setFiltreMois}>
          <SelectTrigger className="h-11 w-36 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute période</SelectItem>
            {mois.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {filtres.length === 0 ? (
          <p className="text-center text-stone-400 font-black uppercase text-[11px] py-16">Aucun bon</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['N° bon', 'Date', 'Client', 'Type', 'Articles', 'Total', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {filtres.map(bon => {
                  const statut = statutBon(bon, invoices);
                  const nature = natureBon(bon);
                  const comptoirEnAttente = bonComptoirEnAttente(bon, invoices);
                  const aEncaisser = factureAEncaisser(bon);
                  const minutes = ancienneteMinutes(bon, maintenant);
                  const urgent = comptoirEnAttente && minutes >= SEUIL_URGENCE_MINUTES;
                  const heure = (bon as any).creeLe
                    ? new Date((bon as any).creeLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <tr key={bon.id} className={comptoirEnAttente ? (urgent ? 'bg-red-100/70 border-l-4 border-l-red-600' : 'bg-red-50/70 border-l-4 border-l-red-400') : 'hover:bg-stone-50/50'}>
                      <td className="px-4 py-3">
                        <span className={`text-[13px] font-black ${comptoirEnAttente ? 'text-red-700' : 'text-stone-800'}`}>{numeroDe(bon)}</span>
                        {estNumeroProvisoire(bon.orderNumber) && <span className="block text-[10px] font-bold text-red-600">provisoire</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-stone-500 whitespace-nowrap">
                        {bon.date}{heure ? ` · ${heure}` : ''}
                        {comptoirEnAttente && (
                          <span className={`flex items-center gap-1 mt-0.5 font-black ${urgent ? 'text-red-700' : 'text-red-600'}`}>
                            <Clock className="w-3 h-3" /> {libelleAnciennete(minutes)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-black text-stone-800">
                        {nature === 'COMPTOIR' ? 'Client comptoir' : (bon.clientName || 'Anonyme')}
                        {stores.length > 1 && bon.storeId && <span className="block text-[10px] font-bold text-stone-400">{nomLieu(bon.storeId)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${BADGE_NATURE[nature]}`}>{LIBELLE_NATURE[nature]}</span>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-stone-500">{(bon.items || []).length} ligne{(bon.items || []).length > 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 text-[12px] font-black text-stone-900 whitespace-nowrap">
                        {attendUnPrix(bon) ? <span className="text-amber-700">à chiffrer</span> : `${fmt$(bon.totalAfterDiscount)} MAD`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border whitespace-nowrap ${
                          comptoirEnAttente && statut.code === 'A_CHIFFRER' ? 'bg-red-600 text-white border-red-700' : BADGE_STATUT[statut.code]
                        }`}>{statut.libelle}</span>
                        {aEncaisser && !comptoirEnAttente && (
                          <span className="block text-[10px] font-bold text-stone-500 mt-0.5">à crédit : {fmt$(aEncaisser.remainingBalance)} MAD dus</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* Toujours visibles : l'écran du magasin est tactile, il n'y a pas de survol. */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button onClick={() => ouvrir(bon.id)}
                            className={`h-9 px-3 rounded-xl text-[11px] font-black uppercase gap-1.5 ${
                              bonEnCours(bon) && !lectureSeule
                                ? (comptoirEnAttente ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-stone-900 hover:bg-stone-800 text-white')
                                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                            }`}>
                            {bonEnCours(bon) && !lectureSeule ? <><Tag className="w-3.5 h-3.5" /> Chiffrer</> : 'Voir'}
                          </Button>
                          {aEncaisser && onEncaisserBon && !lectureSeule && (
                            <Button onClick={() => onEncaisserBon(bon)}
                              className={`h-9 px-3 rounded-xl text-[11px] font-black uppercase gap-1.5 ${
                                comptoirEnAttente ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}>
                              <Banknote className="w-3.5 h-3.5" /> Encaisser
                            </Button>
                          )}
                          {bonEnCours(bon) && !estSortiAuBon(bon) && onEnleverBon && !lectureSeule && (
                            <Button onClick={() => enlever(bon)} disabled={enCours !== null}
                              className="h-9 px-3 rounded-xl text-[11px] font-black uppercase gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                              <Truck className="w-3.5 h-3.5" /> Enlevée
                            </Button>
                          )}
                          <button onClick={() => imprimer(bon)} title="Imprimer le bon" aria-label="Imprimer le bon"
                            className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors">
                            <Printer className="w-4 h-4" />
                          </button>
                          {bonEnCours(bon) && !lectureSeule && (
                            <button onClick={() => annuler(bon)} disabled={enCours !== null} title="Annuler le bon" aria-label="Annuler le bon"
                              className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors disabled:opacity-40">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
              <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{filtres.length} bon{filtres.length > 1 ? 's' : ''}</span>
              <span className="text-[11px] font-black text-stone-700">Total chiffré : {fmt$(totalFiltre)} MAD</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Le bon ouvert : saisie des prix ── */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) fermer(); }}>
        <DialogContent className="sm:max-w-4xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden max-h-[94vh] flex flex-col">
          {selected && (() => {
            const statut = statutBon(selected, invoices);
            const nature = natureBon(selected);
            const comptoirEnAttente = bonComptoirEnAttente(selected, invoices);
            const aEncaisser = factureAEncaisser(selected);
            const minutes = ancienneteMinutes(selected, maintenant);
            const sorti = estSortiAuBon(selected);
            return (
              <>
                <div className={`p-6 text-white shrink-0 ${comptoirEnAttente ? 'bg-gradient-to-r from-red-800 to-red-700' : 'bg-gradient-to-r from-[#0f172a] to-[#1e293b]'}`}>
                  <div className="flex items-start justify-between gap-4 pr-8 flex-wrap">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/60">Bon N°</p>
                      <DialogTitle className="text-4xl font-black tracking-tight leading-none mt-1">{numeroDe(selected)}</DialogTitle>
                      <p className="text-[12px] font-bold text-white/70 mt-2">
                        {nature === 'COMPTOIR' ? 'Client comptoir' : (selected.clientName || 'Anonyme')}
                        {' · '}{selected.date}
                        {(selected as any).creeLe ? ` à ${new Date((selected as any).creeLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        {selected.storeId ? ` · ${nomLieu(selected.storeId)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">{statut.libelle}</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg bg-white/10">{LIBELLE_NATURE[nature]}</span>
                      {comptoirEnAttente && <span className="text-[11px] font-black text-red-100 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {libelleAnciennete(minutes)}</span>}
                    </div>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 bg-white p-5 space-y-4">
                  <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[12px] font-medium leading-snug ${
                    sorti ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-stone-50 border-stone-200 text-stone-700'
                  }`}>
                    {sorti ? <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Undo2 className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />}
                    <span>
                      {sorti
                        ? 'La marchandise est sortie du stock à l\'enregistrement du bon. Baisser une quantité la fait rentrer en stock, l\'augmenter la fait sortir ; annuler le bon remet tout en stock.'
                        : 'Commande à préparer : rien n\'est encore sorti du stock. Quand le client vient la chercher, touchez « Le client enlève la marchandise » : elle sort du stock à ce moment-là, même si les prix ne sont pas encore connus.'}
                    </span>
                  </div>

                  {groupes.map(g => {
                    const indexes = g.lignes.map(l => l.index);
                    const contenances = Array.from(new Set(g.lignes.filter(l => l.contenance).map(l => libelleContenance(l.unite, l.contenance))));
                    const lignesApercu = indexes.map(i => apercu.toutes[i]);
                    const totalGroupe = lignesApercu.reduce((s, l: any) => s + (Number(l?.totalPrice) || 0), 0);
                    return (
                      <div key={g.cle} className="rounded-2xl border border-stone-200 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 flex-wrap p-3 bg-stone-50 border-b border-stone-200">
                          <div className="min-w-0">
                            <p className="text-[14px] font-black text-stone-900 uppercase tracking-tight">{g.produit}</p>
                            <p className="text-[11px] font-bold text-stone-500">Qualité : <span className="text-violet-700">{g.qualite || '—'}</span></p>
                          </div>
                          <label className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-stone-600 text-right leading-tight">
                              Prix unitaire<br />
                              {g.prixAuColis ? (
                                <span className="font-black text-red-600">{libellePrixParUnite(g.unitePrix)} ENTIER</span>
                              ) : (
                                <span className="font-bold text-stone-400">{libellePrixParUnite(g.unitePrix)}</span>
                              )}
                              {contenances.length > 0 && <span className="block font-bold text-violet-700">{contenances.join(' · ')}</span>}
                              {g.prixAuColis && <span className="block font-bold text-red-600">contenance inconnue</span>}
                            </span>
                            <div className="relative w-36">
                              <Input
                                type="text" inputMode="decimal"
                                disabled={!modifiable}
                                value={prixDuGroupe(g.cle, g.prixUnique)}
                                onChange={e => changerPrixGroupe(g.cle, e.target.value, indexes)}
                                placeholder={g.prixDifferents ? 'variable' : 'à saisir'}
                                aria-label={`Prix unitaire — ${g.produit} ${g.qualite}`}
                                className={`h-11 pr-11 text-base font-black rounded-xl ${
                                  lignesApercu.every((l: any) => Number(l?.unitPrice) > 0) ? 'border-stone-300' : 'border-amber-400 bg-amber-50'
                                }`}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-400">MAD</span>
                            </div>
                          </label>
                        </div>
                        <table className="w-full">
                          <thead><tr className="border-b border-stone-100">
                            {['Couleur', ...(g.avecTailles ? ['Taille'] : []), 'Quantité', `Prix ${libellePrixParUnite(g.unitePrix)}`, 'Total', 'Où la prendre'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-stone-400">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody className="divide-y divide-stone-50">
                            {g.lignes.map(l => {
                              const ligne: any = apercu.toutes[l.index];
                              const retiree = !(Number(ligne?.qty) > 0);
                              const prix = Number(ligne?.unitPrice) || 0;
                              return (
                                <tr key={l.index} className={retiree ? 'bg-stone-50 text-stone-400 line-through' : undefined}>
                                  <td className="px-3 py-2 text-[12px] font-black text-stone-800">
                                    {l.etagere
                                      ? <span className="text-teal-700">Étagères · sans couleur</span>
                                      : (l.couleur || '—')}
                                  </td>
                                  {g.avecTailles && <td className="px-3 py-2 text-[12px] font-bold text-stone-600">{l.taille || '—'}</td>}
                                  <td className="px-3 py-2">
                                    {modifiable ? (
                                      <div className="flex items-center gap-1.5">
                                        <Input
                                          type="text" inputMode="decimal"
                                          value={qteAfficheeLigne(l.index)}
                                          onChange={e => setSaisie(s => ({ ...s, qteLigne: { ...(s.qteLigne || {}), [l.index]: e.target.value } }))}
                                          aria-label={`Quantité — ${g.produit} ${l.couleur}`}
                                          className="h-9 w-20 text-[12px] font-black rounded-lg no-underline"
                                        />
                                        <span className="text-[11px] font-bold text-stone-500">{l.unite}</span>
                                      </div>
                                    ) : (
                                      <span className="text-[12px] font-black">{fmtQte(l.quantite)} {l.unite}</span>
                                    )}
                                    {l.contenance && !retiree && (
                                      <span className="block text-[10px] font-bold text-violet-700 mt-0.5">
                                        = {fmtQte((Number(ligne?.qty) || 0) * l.contenance.facteur)} {l.contenance.uniteBase}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {modifiable ? (
                                      <Input
                                        type="text" inputMode="decimal"
                                        value={prixAfficheLigne(l.index)}
                                        onChange={e => setSaisie(s => ({ ...s, prixLigne: { ...(s.prixLigne || {}), [l.index]: e.target.value } }))}
                                        placeholder="à saisir"
                                        aria-label={`Prix unitaire — ${g.produit} ${l.couleur}`}
                                        className={`h-9 w-24 text-[12px] font-bold rounded-lg ${prix > 0 ? '' : 'border-amber-300 bg-amber-50/60'}`}
                                      />
                                    ) : (
                                      <span className="text-[12px] font-bold">{prix > 0 ? fmtPU(prixParUnitePrix(ligne)) : '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-[12px] font-black text-stone-900 whitespace-nowrap">
                                    {prix > 0 && !retiree ? fmt$(ligne.totalPrice) : <span className="text-amber-700">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-[11px] font-bold text-stone-500">
                                    {l.etagere
                                      ? <span className="text-teal-700">Étagères du magasin</span>
                                      : ([l.lieu && l.lieu !== selected.storeId ? nomLieu(l.lieu) : '', (emplacementsOuverts[l.index] || []).join(', ')].filter(Boolean).join(' · ') || '—')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot><tr className="bg-amber-50/60 border-t-2 border-amber-200">
                            <td colSpan={g.avecTailles ? 2 : 1} className="px-3 py-2 text-[11px] font-black uppercase text-stone-600">Total</td>
                            <td className="px-3 py-2 text-[12px] font-black text-stone-900">
                              {(() => {
                                const parUnite = new Map<string, number>();
                                lignesApercu.forEach((x: any) => parUnite.set(x?.unitOfMeasure || '', Math.round(((parUnite.get(x?.unitOfMeasure || '') || 0) + (Number(x?.qty) || 0)) * 1000) / 1000));
                                return Array.from(parUnite.entries()).map(([u, q]) => `${fmtQte(q)} ${u}`).join(' + ');
                              })()}
                            </td>
                            <td />
                            <td className="px-3 py-2 text-[12px] font-black text-stone-900 whitespace-nowrap">{fmt$(totalGroupe)}</td>
                            <td />
                          </tr></tfoot>
                        </table>
                      </div>
                    );
                  })}

                  {/* Remise, total calculé, total écrit sur le papier */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-[11px] font-black text-stone-600 uppercase tracking-wide">Remise sur le total (%)</span>
                        <div className="relative w-36 mt-1">
                          <Input
                            type="text" inputMode="decimal" disabled={!modifiable}
                            value={saisie.remise !== undefined ? String(saisie.remise) : String(selected.discount || 0)}
                            onChange={e => setSaisie(s => ({ ...s, remise: e.target.value }))}
                            className="h-11 pr-8 text-base font-black rounded-xl"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">%</span>
                        </div>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-black text-stone-600 uppercase tracking-wide">Total à payer écrit sur le bon (après remise)</span>
                        <div className="relative w-48 mt-1">
                          <Input
                            type="text" inputMode="decimal" disabled={!modifiable}
                            value={totalPapier}
                            onChange={e => setTotalPapier(e.target.value)}
                            placeholder="à taper"
                            className={`h-11 pr-12 text-base font-black rounded-xl ${
                              comparaison.saisi == null ? 'border-amber-300' : comparaison.concorde ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50'
                            }`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-stone-400">MAD</span>
                        </div>
                        {comparaison.saisi != null && (
                          <span className={`mt-1 flex items-center gap-1 text-[12px] font-black ${comparaison.concorde ? 'text-emerald-700' : 'text-red-700'}`}>
                            {comparaison.concorde
                              ? <><CheckCircle2 className="w-4 h-4" /> Le total du papier correspond.</>
                              : <>Écart de {comparaison.ecart > 0 ? '+' : ''}{fmt$(comparaison.ecart)} MAD avec le total calculé : vérifiez les prix.</>}
                          </span>
                        )}
                      </label>
                    </div>
                    <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 space-y-1.5 text-right self-start">
                      <p className="text-[12px] font-bold text-stone-500">Sous-total : {fmt$(apercu.totalAmount)} MAD</p>
                      {apercu.discount > 0 && (
                        <p className="text-[12px] font-bold text-emerald-700">Remise {fmtQte(apercu.discount)} % : -{fmt$(apercu.totalAmount - apercu.totalAfterDiscount)} MAD</p>
                      )}
                      <p className="text-2xl font-black text-stone-900">Total : {fmt$(apercu.totalAfterDiscount)} MAD</p>
                      {apercu.restantSansPrix > 0 && (
                        <p className="text-[11px] font-black text-amber-700 uppercase">{apercu.restantSansPrix} ligne(s) sans prix</p>
                      )}
                      {apercu.changements.length > 0 && (
                        <p className="text-[11px] font-bold text-blue-700 whitespace-pre-line text-left mt-2">{effetSurLeStock(apercu)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 flex gap-2 shrink-0 flex-wrap items-center border-t border-stone-200">
                  <Button variant="outline" onClick={() => imprimer(selected)} className="gap-2 font-black uppercase text-[11px] rounded-xl h-11">
                    <Printer className="w-4 h-4" /> Imprimer le bon
                  </Button>
                  {modifiable && (
                    <Button variant="outline" onClick={() => annuler(selected)} disabled={enCours !== null}
                      className="gap-2 font-black uppercase text-[11px] rounded-xl h-11 border-red-200 text-red-700 hover:bg-red-50">
                      <X className="w-4 h-4" /> Annuler le bon
                    </Button>
                  )}
                  <div className="flex-1" />
                  {aEncaisser && onEncaisserBon && !lectureSeule && (
                    <Button onClick={() => { setSelectedId(null); onEncaisserBon(selected); }}
                      className={`font-black uppercase text-[12px] h-12 px-6 rounded-xl gap-2 text-white ${
                        comptoirEnAttente ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}>
                      <Banknote className="w-4 h-4" /> Encaisser — {fmt$(aEncaisser.remainingBalance)} MAD
                    </Button>
                  )}
                  {modifiable && !sorti && onEnleverBon && (
                    <Button onClick={() => enlever(selected)} disabled={enCours !== null}
                      className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[11px] h-11 px-5 rounded-xl gap-2">
                      {enCours === 'enlevement' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                      Le client enlève la marchandise
                    </Button>
                  )}
                  {modifiable && (
                    <Button onClick={enregistrerSeulement} disabled={enCours !== null || !saisieModifiee} variant="outline"
                      className="font-black uppercase text-[11px] h-11 px-5 rounded-xl gap-2 disabled:opacity-40">
                      {enCours === 'enregistrement' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                      Enregistrer
                    </Button>
                  )}
                  {modifiable && (
                    <Button onClick={finaliser} disabled={enCours !== null}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[12px] h-12 px-6 rounded-xl gap-2">
                      {enCours === 'finalisation' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                      Finaliser et encaisser — {fmt$(apercu.totalAfterDiscount)} MAD
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
