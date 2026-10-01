"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Plus, CheckCircle2, Clock, XCircle, Search, X, Printer, AlertTriangle, Building2, Lock, PackageCheck, Undo2, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, serverTimestamp, writeBatch, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import type { TransferOrder, TransferOrderItem, StockItem, StoreLocation, Store } from '@/lib/types';
import { logAudit } from '@/lib/audit-log';
import { cleanUndefined } from '@/lib/utils';
import { disponibleDepuis } from '@/lib/stock-disponible';
import {
  type BonTransfert, type CompteTransfert, type ContexteTransfert,
  arrondiQte, uniteCourte, qteAvecUnite, numeroBonTransfert, departsPossibles, departRetenu, arriveesPossibles,
  statutTransfert, transfertsAReceptionner, raisonPasReception, raisonPasAnnulation, raisonPasClore,
  estEnRoute, estAncienBonEnAttente, lignesSansSortie, mouvementsRattrapageSortie,
  mouvementsEnvoi, mouvementsReception, mouvementsAnnulation, erreurReception, calculManquants,
  recuDeLigne, phrasePerteTransport, MESSAGE_MOUVEMENTS_EN_CHARGEMENT,
} from '@/lib/transferts';
import { construireBonTransfertHtml } from '@/lib/bon-transfert-imprime';
import { imprimerHtml, messageImpression } from '@/lib/impression';
import { LOGO_B64 } from '@/lib/logo-b64';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';
import { pasDeSaisie } from '@/lib/unites-pole';
import { ChampQuantite } from './stock-sale-flow';

interface TransferOrdersViewProps {
  transferOrders: TransferOrder[];
  /** Familles et pôles : servent à décrire les produits sur le bon imprimé (qualité, GSM, curseur…). */
  categories?: any[];
  generalCategories?: any[];
  stockItems: StockItem[];
  stores: Store[];
  /** Mouvements, pour résoudre automatiquement les emplacements (FIFO en sortie). */
  movements?: any[];
  userRole: 'ADMIN' | 'COMMERCIAL' | 'UNAUTHORIZED';
  activeStore: StoreLocation | 'ALL';
  adminUid: string | null;
  /** Le magasin du compte connecté (storeAccess.storeId) : c'est de lui que part la marchandise. */
  userStoreId?: string | null;
  /** Compte en lecture seule : il voit les bons, il n'envoie, ne reçoit ni n'annule rien. */
  lectureSeule?: boolean;
  /**
   * Faux tant que la collection des mouvements n'a pas répondu : `movements` vaut alors [] et
   * tout serait calculé sur un journal vide — stock du départ trop haut (aucune vente déduite),
   * sorties sans emplacement, ancienne sortie d'un bon introuvable. Envoyer, réceptionner et
   * annuler attendent donc le chargement.
   */
  mouvementsCharges?: boolean;
  /** Pas de réseau : un envoi resterait en attente, fenêtre bloquée, et se perdrait au rechargement. */
  horsLigne?: boolean;
}

/** Une erreur dont le message est déjà écrit pour l'utilisateur. */
class ErreurTransfert extends Error {}

/**
 * Le message à montrer quand une écriture échoue. Le cas qui compte : un droit qui manque —
 * Firestore répond « permission-denied », et l'utilisateur doit savoir que ce n'est pas une panne
 * mais une règle (un magasin n'écrit que dans son propre stock).
 */
function messageErreur(e: any, quoi: string, magasin: string): string {
  if (e instanceof ErreurTransfert) return e.message;
  const code = String(e?.code || '');
  if (code === 'permission-denied' || /permission/i.test(String(e?.message || ''))) {
    return `Droit refusé : votre compte ne peut pas ${quoi}. Un magasin n'écrit que dans son propre stock — ici, `
      + `celui de ${magasin}. Connectez-vous avec le compte de ce magasin, ou demandez à l'administrateur.`;
  }
  if (code === 'unavailable' || code === 'failed-precondition' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return `Pas de connexion : impossible de ${quoi} hors ligne. Rien n'a été enregistré ; réessayez une fois la connexion revenue.`;
  }
  return `Impossible de ${quoi}. Rien n'a été enregistré : réessayez, et si l'erreur revient, rechargez la page.`;
}

/**
 * L'unité commune à toutes les lignes d'un bon, s'il n'en a qu'une (un bon de TAFFETA : m). Sinon
 * rien : additionner des mètres et des pièces ne donne pas un total qu'on puisse nommer.
 */
function uniteCommune(lignes: { unitOfMeasure?: string }[]): string {
  const unites = new Set(lignes.map(l => uniteCourte(l.unitOfMeasure)));
  return unites.size === 1 ? [...unites][0] : '';
}

const MESSAGE_HORS_LIGNE = 'Pas de connexion : rien ne peut être enregistré hors ligne. Réessayez une fois la connexion revenue.';

export default function TransferOrdersView({
  transferOrders, stockItems, stores, movements = [], userRole, adminUid, categories = [], generalCategories = [],
  userStoreId = null, lectureSeule = false, activeStore, mouvementsCharges = true, horsLigne = false,
}: TransferOrdersViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const getStoreLabel = (id: string) => stores.find(s => s.id === id)?.name || id;

  const [search, setSearch] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [validateModal, setValidateModal] = useState<{ open: boolean; order?: BonTransfert }>({ open: false });
  /** Le bon tout juste envoyé : la fenêtre qui suit propose de l'imprimer (un clic frais). */
  const [envoiFait, setEnvoiFait] = useState<BonTransfert | null>(null);

  // ── Le trajet : le départ est le magasin du compte ─────────────────────────────────────────
  // Demande du patron (01/10/2026) : ce sont les magasins qui envoient leur marchandise aux
  // autres. Un compte magasin part donc toujours de chez lui (les règles Firestore ne le laissent
  // écrire que sous son nom) ; l'admin choisit le départ, le magasin principal par défaut. CHRIFA
  // « contient » ses entrepôts : son disponible les inclut (disponibleDepuis).
  const compte: CompteTransfert = useMemo(() => ({
    role: userRole,
    magasin: userRole === 'ADMIN' ? null : userStoreId,
    lectureSeule,
  }), [userRole, userStoreId, lectureSeule]);
  const estAdmin = userRole === 'ADMIN';
  /** Le magasin choisi en haut de l'écran, ou null en vue globale. */
  const magasinAffiche = activeStore === 'ALL' || activeStore === 'ALL_MAIN' ? null : String(activeStore);
  /** Ce que les règles d'affichage des boutons doivent savoir du journal. */
  const contexte: ContexteTransfert = { mouvementsCharges, mouvements: movements };
  const [departChoisi, setDepartChoisi] = useState<string>('');
  const departs = useMemo(() => departsPossibles(compte, stores), [compte, stores]);
  const fromStore = useMemo(
    () => departRetenu(compte, stores, departChoisi, magasinAffiche),
    [compte, stores, departChoisi, magasinAffiche]
  );
  /** Les seuls lieux d'arrivée possibles : les AUTRES magasins — jamais un entrepôt. */
  const magasinsArrivee = useMemo(
    () => arriveesPossibles(fromStore, stores).map(id => stores.find(s => s.id === id)!).filter(Boolean),
    [stores, fromStore]
  );

  // Create Form State
  const [toStore, setToStore] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<TransferOrderItem[]>([]);
  const [articleSearch, setArticleSearch] = useState('');

  // Le départ change (choix de l'admin, ou liste des magasins arrivée après le premier rendu) :
  // les quantités saisies étaient plafonnées sur le stock de l'ancien départ. On repart des
  // lignes vides plutôt que de les laisser se faire refuser à l'envoi sans explication ; et une
  // arrivée devenue égale au départ est effacée.
  useEffect(() => {
    setSelectedItems([]);
    setToStore(prev => (prev === fromStore ? '' : prev));
  }, [fromStore]);

  // Validate Form State
  const [receivedItems, setReceivedItems] = useState<Record<string, number>>({}); // articleId -> qty

  const filteredOrders = useMemo(() => {
    let res = [...transferOrders] as BonTransfert[];
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(o => o.id.toLowerCase().includes(q)
        || numeroBonTransfert(o.id).toLowerCase().includes(q)
        || getStoreLabel(o.toStore)?.toLowerCase().includes(q)
        || getStoreLabel(o.fromStore)?.toLowerCase().includes(q));
    }
    return res.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [transferOrders, search, stores]);

  /**
   * Les bons qui attendent CE compte : pour un magasin, ceux qui lui sont destinés ; pour l'admin,
   * ceux destinés au magasin choisi en haut de l'écran (tous en vue globale) — le même calcul que
   * le badge du menu (stock-app). La liste, elle, contient aussi les envois SORTANTS du magasin
   * choisi : ils ne sont pas « à réceptionner » par lui. Les anciens bons PENDING ne comptent que
   * pour l'admin (transfertsAReceptionner).
   */
  const aReceptionner = useMemo(
    () => transfertsAReceptionner(
      transferOrders as BonTransfert[],
      estAdmin ? magasinAffiche : (userStoreId || '__aucun__'),
      { avecAnciens: estAdmin },
    ),
    [transferOrders, estAdmin, userStoreId, magasinAffiche]
  );

  // ── Impression ────────────────────────────────────────────────────────────────────────────
  // Directement depuis le clic, jamais après un await : certains navigateurs n'impriment que
  // tant que le geste de l'utilisateur est « frais » (src/lib/impression.ts).
  const imprimerBon = (order: BonTransfert) => {
    try {
      const html = construireBonTransfertHtml({
        bon: order,
        nomDepart: getStoreLabel(order.fromStore),
        nomArrivee: getStoreLabel(order.toStore),
        categories,
        generalCategories,
        logo: LOGO_B64,
      });
      imprimerHtml(html).catch(e => toast({ variant: 'destructive', title: 'Impression impossible', description: messageImpression(e) }));
    } catch (e: any) {
      console.error('[transfert] impression impossible :', e);
      toast({ variant: 'destructive', title: 'Impression impossible', description: messageImpression(e) });
    }
  };

  const addArticleToTransfer = (item: StockItem) => {
    if (selectedItems.find(i => i.articleId === item.articleId)) return;
    const availableInSource = disponibleDepuis(item, fromStore, stores);
    if (availableInSource <= 0) {
      toast({
        variant: 'destructive',
        title: 'Stock insuffisant',
        description: `L'article "${item.productName}" n'a plus rien au lieu de départ (${getStoreLabel(fromStore)}).`
      });
      return;
    }
    setSelectedItems(prev => [...prev, {
      articleId: item.articleId,
      realArticleId: (item as any)._realArticleId || item.articleId,
      categoryId: item.categoryId,
      productName: item.nameFR || item.productName,
      nameFR: item.nameFR,
      color: item.color,
      size: item.size,
      quality: item.quality,
      unitOfMeasure: item.unitOfMeasure,
      sentQty: Math.min(1, availableInSource)
    }]);
    setArticleSearch('');
  };

  // ── 1. ENVOI : le bon « En route » + les sorties du départ, en un seul lot ─────────────────
  const handleSendTransfer = async () => {
    if (!firestore || !adminUid || selectedItems.length === 0 || enCours) return;
    if (lectureSeule) return toast({ variant: 'destructive', title: 'Lecture seule', description: 'Votre compte est en lecture seule : il ne peut pas envoyer de marchandise.' });
    if (!fromStore) return toast({ variant: 'destructive', title: 'Aucun magasin de départ', description: 'Votre compte n\'est rattaché à aucun magasin : demandez à l\'administrateur de vous en attribuer un.' });
    if (!toStore) return toast({ variant: 'destructive', title: 'Lieu d\'arrivée manquant', description: 'Choisissez le magasin qui reçoit la marchandise, à l\'étape 1.' });
    if (fromStore === toStore) return toast({ variant: 'destructive', title: 'Trajet impossible', description: 'Le magasin d\'arrivée doit être un autre magasin que celui du départ.' });

    if (!mouvementsCharges) return toast({ variant: 'destructive', title: 'Patientez', description: MESSAGE_MOUVEMENTS_EN_CHARGEMENT });
    // Hors ligne, le lot ne serait pas refusé : il attendrait le serveur, fenêtre bloquée sur
    // « Envoi… », et se perdrait sans bruit si la page est rechargée.
    if (horsLigne || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return toast({ variant: 'destructive', title: 'Hors ligne', description: MESSAGE_HORS_LIGNE });
    }

    // Vérification stricte des stocks disponibles au départ
    for (const item of selectedItems) {
      const originalStock = stockItems.find(s => s.articleId === item.articleId);
      const available = disponibleDepuis(originalStock, fromStore, stores);
      if (item.sentQty <= 0) {
        return toast({ variant: 'destructive', title: 'Quantité invalide', description: `Indiquez une quantité valide pour ${item.productName}.` });
      }
      if (item.sentQty > arrondiQte(available)) {
        return toast({
          variant: 'destructive',
          title: 'Stock insuffisant',
          description: `Quantité demandée (${qteAvecUnite(item.sentQty, item.unitOfMeasure)}) supérieure au stock disponible (${qteAvecUnite(available, item.unitOfMeasure)}) à ${getStoreLabel(fromStore)} pour ${item.productName}.`
        });
      }
    }

    setEnCours(true);
    try {
      const now = new Date().toISOString();
      const docRef = doc(collection(firestore, 'users', adminUid, 'transferOrders'));
      // Les sorties du départ, adressées en FIFO parmi les racks de chaque variante. Aucune entrée
      // à l'arrivée : elle s'écrira à la réception, par le magasin d'arrivée, sous SON nom.
      const { mouvements: sorties, sorties: copieSorties } = mouvementsEnvoi({
        bonId: docRef.id,
        items: selectedItems,
        depart: fromStore,
        arrivee: toStore,
        libelleArrivee: getStoreLabel(toStore),
        mouvements: movements,
        stockItems,
        lieux: stores,
        date: now.split('T')[0],
      });
      const refsSorties = sorties.map(() => doc(collection(firestore, 'users', adminUid, 'stockMovements')));

      const bon: Omit<BonTransfert, 'id'> = {
        fromStore: fromStore as StoreLocation,
        toStore: toStore as StoreLocation,
        // EN_ROUTE et non PENDING : un écran resté sur l'ancienne version recevrait un bon PENDING
        // par l'ancien parcours (perte ressortie à l'arrivée, sans relire le bon). Il ignore
        // EN_ROUTE. `sortieAlEnvoi` dit que la sortie est faite : la réception n'en refera pas.
        status: 'EN_ROUTE',
        items: selectedItems,
        date: now,
        createdAt: serverTimestamp(),
        sortieAlEnvoi: true,
        sortiesEnvoi: copieSorties,
        mouvementsSortie: refsSorties.map(r => r.id),
        envoyePar: user?.email || undefined,
      };

      // Le bon ET ses sorties dans le MÊME lot : un bon « En route » sans sortie ferait recevoir
      // à l'arrivée une marchandise jamais partie. Tout est sous le nom du départ — c'est ce que
      // les règles acceptent d'un compte magasin.
      // cleanUndefined partout : une ligne peut n'avoir ni taille ni qualité (variante couleur), et
      // Firestore refuse un champ undefined (« Unsupported field value: undefined »).
      const batch = writeBatch(firestore);
      batch.set(docRef, cleanUndefined(bon));
      sorties.forEach((m, k) => batch.set(refsSorties[k], cleanUndefined({ ...m, createdAt: serverTimestamp() })));
      await batch.commit();

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_CREATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: docRef.id,
        description: `Transfert ${numeroBonTransfert(docRef.id)} envoyé ${getStoreLabel(fromStore)} → ${getStoreLabel(toStore)} · ${selectedItems.length} référence(s), ${arrondiQte(selectedItems.reduce((s, i) => s + i.sentQty, 0))} ${uniteCommune(selectedItems) || 'unité(s)'} — sortis du stock du départ, en route`,
        metadata: { fromStore, toStore, itemCount: selectedItems.length, mouvementsSortie: refsSorties.length },
      });

      toast({ title: 'Transfert envoyé', description: `La marchandise est sortie du stock de ${getStoreLabel(fromStore)}. Elle entrera dans celui de ${getStoreLabel(toStore)} quand il la réceptionnera.` });
      setCreateModal(false);
      setSelectedItems([]);
      setEnvoiFait({ ...(bon as any), id: docRef.id, date: now });
    } catch (e: any) {
      console.error('[transfert] envoi refusé :', e);
      toast({ variant: 'destructive', title: 'Envoi non enregistré', description: messageErreur(e, 'envoyer de la marchandise depuis ce magasin', getStoreLabel(fromStore)) });
    } finally {
      setEnCours(false);
    }
  };

  /** Ouvre la réception. Le parcours (sortie déjà faite ou non) se décide au clic de validation. */
  const ouvrirReception = (order: BonTransfert) => {
    const raison = raisonPasReception(order, compte, contexte);
    if (raison) return toast({ variant: 'destructive', title: 'Réception impossible', description: raison });
    const init: Record<string, number> = {};
    order.items.forEach(i => init[i.articleId] = i.sentQty);
    setReceivedItems(init);
    setValidateModal({ open: true, order });
  };

  // ── 2. RÉCEPTION : le bon passe « Reçu » + les entrées à l'arrivée, en une transaction ──────
  // Un seul parcours pour tous les bons en route. Pour un ancien bon (PENDING), la sortie au
  // départ est recherchée au journal ligne par ligne AU MOMENT DE VALIDER — pas à l'ouverture de
  // la fenêtre, quand le journal n'était peut-être pas encore chargé. Une ligne dont la sortie
  // manque voit sa sortie écrite au départ (par l'administrateur seul : c'est le stock d'un autre
  // magasin). Jamais de PERTE à l'arrivée : le manquant a déjà quitté le départ.
  // L'ancien parcours (entrée du reçu + PERTE du manquant à l'arrivée, sans rien au départ) est
  // retiré : appliqué à un bon dont la sortie existait, il comptait le manquant perdu deux fois ;
  // à un bon sans sortie, il faisait apparaître la marchandise reçue de rien.
  const handleReceive = async () => {
    if (!firestore || !adminUid || !validateModal.order || enCours) return;
    const order = validateModal.order;
    const raison = raisonPasReception(order, compte, contexte);
    if (raison) return toast({ variant: 'destructive', title: 'Réception impossible', description: raison });
    const erreur = erreurReception(order.items, receivedItems);
    if (erreur) return toast({ variant: 'destructive', title: 'Quantité à corriger', description: erreur });

    setEnCours(true);
    try {
      const now = new Date().toISOString();
      const jour = now.split('T')[0];
      const manquants = calculManquants(order.items, receivedItems);
      // Ancien bon : les sorties qui manquent au départ (aucune pour un bon du nouveau parcours).
      const rattrapage = estAncienBonEnAttente(order)
        ? mouvementsRattrapageSortie({
          bon: order,
          libelleArrivee: getStoreLabel(order.toStore),
          mouvements: movements,
          stockItems,
          lieux: stores,
          date: jour,
        })
        : [];
      if (rattrapage.length > 0 && !estAdmin) {
        throw new ErreurTransfert('Ancien bon dont la sortie au départ n\'a pas été enregistrée : seul l\'administrateur peut le réceptionner. Prévenez-le.');
      }
      const entrees = mouvementsReception({
        bon: order,
        recus: receivedItems,
        libelleDepart: getStoreLabel(order.fromStore),
        mouvements: movements,
        stockItems,
        date: jour,
      });
      const ecritures = [...rattrapage, ...entrees];
      const refs = ecritures.map(() => doc(collection(firestore, 'users', adminUid, 'stockMovements')));
      const refsEntrees = refs.slice(rattrapage.length);
      const updatedItems = order.items.map(item => ({ ...item, receivedQty: Math.min(recuDeLigne(item, receivedItems), arrondiQte(item.sentQty)) }));
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);

      // Une transaction et non un simple lot : elle relit le bon juste avant d'écrire. Deux
      // personnes qui réceptionnent le même carton, ou une réception pendant que le départ
      // annule, ne peuvent plus faire entrer la marchandise deux fois — ni la faire entrer
      // alors qu'elle est déjà rendue au départ.
      await runTransaction(firestore, async tx => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) throw new ErreurTransfert('Ce bon n\'existe plus : il a peut-être été supprimé. Rechargez la page.');
        const donnees = snap.data() || {};
        if (donnees.status === 'CANCELLED') throw new ErreurTransfert('Ce transfert vient d\'être annulé (ou clos) : rien n\'a été reçu.');
        if (!estEnRoute(donnees)) throw new ErreurTransfert('Ce transfert a déjà été réceptionné (sans doute depuis un autre poste). Rien n\'a été enregistré une seconde fois.');
        ecritures.forEach((m, k) => tx.set(refs[k], cleanUndefined({ ...m, createdAt: serverTimestamp() })));
        tx.update(orderRef, cleanUndefined({
          status: 'VALIDATED',
          items: updatedItems,
          receivedDate: now,
          manquants,
          mouvementsEntree: refsEntrees.map(r => r.id),
          ...(rattrapage.length > 0 ? { mouvementsSortieRattrapes: refs.slice(0, rattrapage.length).map(r => r.id) } : {}),
          recuPar: user?.email || undefined,
        }));
      });

      const perte = phrasePerteTransport(manquants);
      logAudit(firestore, adminUid, {
        action: 'TRANSFER_VALIDATED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: order.id,
        description: `Réception du transfert ${numeroBonTransfert(order.id)} ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} · ${uniteCommune(updatedItems)
          ? `reçu : ${arrondiQte(updatedItems.reduce((s, i) => s + (i.receivedQty || 0), 0))} ${uniteCommune(updatedItems)}`
          : `${arrondiQte(updatedItems.reduce((s, i) => s + (i.receivedQty || 0), 0))} unité(s) reçue(s)`}${perte ? ` · ${perte}` : ''}${rattrapage.length > 0
          ? ` · ancien bon : sortie de ${getStoreLabel(order.fromStore)} écrite à la réception (elle n'avait pas été enregistrée à l'envoi)` : ''}`,
        metadata: { fromStore: order.fromStore, toStore: order.toStore, manquants, sortiesRattrapees: rattrapage.length },
      });

      toast({
        title: 'Transfert reçu',
        description: perte
          ? `La marchandise reçue est entrée dans le stock de ${getStoreLabel(order.toStore)}. ${perte} (noté sur le bon).`
          : `La marchandise est entrée dans le stock de ${getStoreLabel(order.toStore)}.`,
      });
      setValidateModal({ open: false });
    } catch (e: any) {
      console.error('[transfert] réception refusée :', e);
      toast({ variant: 'destructive', title: 'Réception non enregistrée', description: messageErreur(e, 'réceptionner ce transfert', getStoreLabel(order.toStore)) });
    } finally {
      setEnCours(false);
    }
  };

  // ── 3. ANNULATION : les sorties rendues au départ, à l'identique ──────────────────────────
  const handleCancel = async (order: BonTransfert) => {
    if (!firestore || !adminUid || enCours) return;
    const raison = raisonPasAnnulation(order, compte, contexte);
    if (raison) return toast({ variant: 'destructive', title: 'Annulation impossible', description: raison });

    const ok = await confirm({
      title: `Annuler l'envoi ${numeroBonTransfert(order.id)} ?`,
      description: `La marchandise de ce bon (${order.items.length} référence(s)) revient dans le stock de ${getStoreLabel(order.fromStore)}, `
        + `aux mêmes emplacements qu'à la sortie. ${getStoreLabel(order.toStore)} ne pourra plus le réceptionner.\n\n`
        + 'À faire seulement si la marchandise n\'est pas partie, ou si elle est revenue.',
      confirmLabel: 'Oui, annuler l\'envoi',
      cancelLabel: 'Non, garder le transfert',
      variant: 'destructive',
    });
    if (!ok) return;

    setEnCours(true);
    try {
      const now = new Date().toISOString();
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);
      let nbRetours = 0;

      // Transaction : on relit le bon juste avant. Reçu entre-temps, il ne s'annule plus — sinon
      // la marchandise serait à la fois entrée à l'arrivée et rendue au départ. On relit aussi les
      // sorties elles-mêmes : un emplacement renommé depuis l'envoi a réécrit leur emplacement,
      // pas la copie figée sur le bon (mouvementsAnnulation).
      await runTransaction(firestore, async tx => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) throw new ErreurTransfert('Ce bon n\'existe plus : il a peut-être été supprimé. Rechargez la page.');
        const donnees = snap.data() || {};
        if (donnees.status === 'CANCELLED') throw new ErreurTransfert('Ce transfert est déjà annulé : rien n\'a été rendu une seconde fois.');
        if (!estEnRoute(donnees)) throw new ErreurTransfert('Ce transfert vient d\'être réceptionné par le magasin d\'arrivée : il ne s\'annule plus. Pour faire revenir la marchandise, faites un transfert dans l\'autre sens.');
        if (donnees.sortieAlEnvoi !== true) throw new ErreurTransfert('Ancien bon : il ne peut pas être annulé ici. Il se réceptionne, ou l\'administrateur le clôt.');
        const bon = { ...order, ...donnees, id: order.id } as BonTransfert;
        const ids: string[] = Array.isArray(bon.mouvementsSortie) ? bon.mouvementsSortie : [];
        const relues = await Promise.all(ids.map(async id => {
          const m = await tx.get(doc(firestore, 'users', adminUid, 'stockMovements', id));
          return m.exists() ? (m.data() as Record<string, any>) : null;
        }));
        const retours = mouvementsAnnulation(bon, now.split('T')[0], ids.length > 0 ? relues : undefined);
        if (retours.length === 0) {
          throw new ErreurTransfert('Les sorties de cet envoi ne sont plus au journal (supprimées ?) : il n\'y a rien à rendre. Demandez à l\'administrateur.');
        }
        const refsRetours = retours.map(() => doc(collection(firestore, 'users', adminUid, 'stockMovements')));
        retours.forEach((m, k) => tx.set(refsRetours[k], cleanUndefined({ ...m, createdAt: serverTimestamp() })));
        tx.update(orderRef, cleanUndefined({
          status: 'CANCELLED',
          cancelledDate: now,
          annulePar: user?.email || undefined,
          mouvementsAnnulation: refsRetours.map(r => r.id),
        }));
        nbRetours = refsRetours.length;
      });

      logAudit(firestore, adminUid, {
        action: 'TRANSFER_CANCELLED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: order.id,
        description: `Envoi ${numeroBonTransfert(order.id)} ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} annulé avant réception · marchandise remise dans le stock de ${getStoreLabel(order.fromStore)}`,
        metadata: { fromStore: order.fromStore, toStore: order.toStore, mouvementsAnnulation: nbRetours },
      });
      toast({ title: 'Envoi annulé', description: `La marchandise est de retour dans le stock de ${getStoreLabel(order.fromStore)}.` });
    } catch (e: any) {
      console.error('[transfert] annulation refusée :', e);
      toast({ variant: 'destructive', title: 'Annulation non enregistrée', description: messageErreur(e, 'annuler cet envoi', getStoreLabel(order.fromStore)) });
    } finally {
      setEnCours(false);
    }
  };

  // ── Ancien bon déjà réglé autrement : le clore, sans aucun mouvement (admin) ──────────────
  const handleClore = async (order: BonTransfert) => {
    if (!firestore || !adminUid || enCours) return;
    const raison = raisonPasClore(order, compte);
    if (raison) return toast({ variant: 'destructive', title: 'Clôture impossible', description: raison });

    const ok = await confirm({
      title: `Clore l'ancien bon ${numeroBonTransfert(order.id)} sans mouvement ?`,
      description: `Le bon ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} passe à « Clos ». Aucun stock ne bouge : `
        + `ni sortie à ${getStoreLabel(order.fromStore)}, ni entrée à ${getStoreLabel(order.toStore)}.\n\n`
        + 'À faire seulement si ce transfert a déjà été réglé autrement (marchandise arrivée et recomptée par un inventaire, '
        + 'ou bon fait par erreur). Si la marchandise attend encore d\'entrer en stock, réceptionnez-le plutôt.',
      confirmLabel: 'Oui, clore sans mouvement',
      cancelLabel: 'Non, garder le bon',
      variant: 'destructive',
    });
    if (!ok) return;

    setEnCours(true);
    try {
      const now = new Date().toISOString();
      const orderRef = doc(firestore, 'users', adminUid, 'transferOrders', order.id);
      await runTransaction(firestore, async tx => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) throw new ErreurTransfert('Ce bon n\'existe plus : il a peut-être été supprimé. Rechargez la page.');
        const donnees = snap.data() || {};
        if (!estAncienBonEnAttente(donnees)) throw new ErreurTransfert('Ce bon n\'est plus en attente (reçu, annulé ou clos entre-temps) : rien n\'a été changé.');
        tx.update(orderRef, cleanUndefined({
          status: 'CANCELLED',
          closSansMouvement: true,
          cancelledDate: now,
          annulePar: user?.email || undefined,
        }));
      });
      logAudit(firestore, adminUid, {
        action: 'TRANSFER_CANCELLED',
        userId: user?.uid || '',
        userEmail: user?.email || '',
        entityType: 'transfer',
        entityId: order.id,
        description: `Ancien bon ${numeroBonTransfert(order.id)} ${getStoreLabel(order.fromStore)} → ${getStoreLabel(order.toStore)} clos sans mouvement de stock (déjà réglé autrement)`,
        metadata: { fromStore: order.fromStore, toStore: order.toStore, closSansMouvement: true },
      });
      toast({ title: 'Ancien bon clos', description: 'Aucun stock n\'a bougé. Le bon ne s\'affiche plus « à réceptionner ».' });
    } catch (e: any) {
      console.error('[transfert] clôture refusée :', e);
      toast({ variant: 'destructive', title: 'Clôture non enregistrée', description: messageErreur(e, 'clore ce bon', getStoreLabel(order.toStore)) });
    } finally {
      setEnCours(false);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Valeurs d'affichage uniquement : récapitulatifs et messages rattachés aux champs. Elles ne
  // décident rien — aucune de ces lignes n'écrit, ne bloque un enregistrement ni ne change un
  // calcul existant.
  // ---------------------------------------------------------------------------------------------

  /** Total des unités qui quitteront le lieu de départ, pour le récapitulatif du nouveau bon. */
  const totalUnitesEnvoyees = selectedItems.reduce((s, i) => s + (i.sentQty || 0), 0);
  /** Les références proposées par la recherche, sorties du JSX pour pouvoir dire « aucun résultat ». */
  const resultatsRecherche = articleSearch
    ? stockItems.filter(i =>
        i.productName.toLowerCase().includes(articleSearch.toLowerCase())
        || i.color?.toLowerCase().includes(articleSearch.toLowerCase())
        || i.quality?.toLowerCase().includes(articleSearch.toLowerCase())
      ).slice(0, 10)
    : [];

  /** Le bon en cours de réception, et ses totaux relus avant validation. */
  const bonRecu = validateModal.order;
  /**
   * Ancien bon : les lignes dont la sortie au départ n'est pas retrouvée au journal — leur sortie
   * sera écrite à la validation. Recalculé à chaque rendu : le journal peut finir de charger
   * pendant que la fenêtre est ouverte. La validation refait ce calcul au clic.
   */
  const lignesARattraper = bonRecu && estAncienBonEnAttente(bonRecu) ? lignesSansSortie(bonRecu, movements) : [];
  /** Pourquoi « Valider la réception » est grisé, ou null. */
  const raisonPasValiderReception = bonRecu
    ? (raisonPasReception(bonRecu, compte, contexte) || erreurReception(bonRecu.items, receivedItems))
    : null;
  const totalEnvoyeBon = bonRecu ? bonRecu.items.reduce((s, i) => s + (i.sentQty || 0), 0) : 0;
  // Même lecture qu'à l'enregistrement : une case laissée telle quelle vaut la quantité envoyée.
  const totalCompteBon = bonRecu ? bonRecu.items.reduce((s, i) => s + (receivedItems[i.articleId] ?? i.sentQty), 0) : 0;
  const ecartBon = arrondiQte(totalEnvoyeBon - totalCompteBon);

  /** Pourquoi « Nouveau transfert » est grisé, ou null. */
  const raisonPasEnvoi = lectureSeule
    ? 'Compte en lecture seule : pas d\'envoi possible.'
    : departs.length === 0
      ? 'Votre compte n\'est rattaché à aucun magasin : l\'administrateur doit vous en attribuer un.'
      : null;
  /** Ce qui empêche d'envoyer MAINTENANT (le formulaire reste ouvrable pour préparer le bon). */
  const raisonPasEnvoiMaintenant = !mouvementsCharges
    ? MESSAGE_MOUVEMENTS_EN_CHARGEMENT
    : horsLigne ? MESSAGE_HORS_LIGNE : null;

  const pastilleStatut = (order: BonTransfert) => {
    const s = statutTransfert(order);
    const style = s.code === 'EN_ROUTE' ? 'bg-amber-100 text-amber-700'
      : s.code === 'RECU' ? 'bg-emerald-100 text-emerald-700'
        : s.code === 'RECU_AVEC_MANQUANT' ? 'bg-orange-100 text-orange-800'
          : 'bg-red-100 text-red-700';
    const Icone = s.code === 'EN_ROUTE' ? Clock : s.code === 'ANNULE' ? XCircle : s.code === 'RECU_AVEC_MANQUANT' ? AlertTriangle : CheckCircle2;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${style}`} title={s.aide}>
        <Icone className="w-3 h-3" /> {s.libelle}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[11px] font-black text-blue-300 uppercase tracking-[0.3em] mb-1">Logistique Interne</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Bons de <span className="text-blue-300">Transfert</span>
            </h1>
            <p className="text-xs font-medium text-blue-100/90 leading-snug mt-2">
              Envoyer de la marchandise de votre magasin vers un autre magasin. Le stock du départ baisse à
              l'envoi ; celui de l'arrivée monte quand le magasin d'arrivée réceptionne. Le bon s'imprime et
              accompagne la marchandise.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
            <Button
              onClick={() => setCreateModal(true)}
              disabled={Boolean(raisonPasEnvoi)}
              className="bg-white hover:bg-stone-50 text-blue-900 font-black text-xs tracking-wide h-11 px-6 rounded-2xl shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" /> Nouveau transfert
            </Button>
            {raisonPasEnvoi && <p className="text-[11px] font-bold text-blue-100/90 max-w-[260px] sm:text-right">{raisonPasEnvoi}</p>}
          </div>
        </div>
      </div>

      {/* À réceptionner : le bandeau qui ne se rate pas */}
      {aReceptionner.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-amber-500 text-white shrink-0"><PackageCheck className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-black text-amber-900">
                {aReceptionner.length} transfert{aReceptionner.length > 1 ? 's' : ''} à réceptionner
                {!estAdmin && userStoreId ? ` à ${getStoreLabel(userStoreId)}` : ''}
              </p>
              <p className="text-[11px] font-medium text-amber-800 leading-snug">
                {lectureSeule
                  ? 'La marchandise est partie du magasin de départ. Votre compte est en lecture seule : la réception se fait depuis le compte du magasin.'
                  : <>La marchandise est partie du magasin de départ. Comptez-la à l'arrivée puis réceptionnez : c'est
                    ce qui la fait entrer dans le stock{estAdmin ? ' du magasin d\'arrivée' : ' de votre magasin'}.</>}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {aReceptionner.map(order => {
              const raison = raisonPasReception(order, compte, contexte);
              return (
                <div key={order.id} className="rounded-2xl bg-white border border-amber-200 p-3 space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-stone-900">
                      {numeroBonTransfert(order.id)} · {getStoreLabel(order.fromStore)} → {getStoreLabel(order.toStore)}
                    </p>
                    <p className="text-[11px] font-medium text-stone-500">
                      Parti le {new Date(order.date).toLocaleDateString('fr-FR')} · {order.items.length} référence(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => imprimerBon(order)} className="h-8 px-3 rounded-xl text-[11px] font-bold gap-1.5">
                      <Printer className="w-3.5 h-3.5" /> Bon
                    </Button>
                    <Button
                      size="sm"
                      disabled={Boolean(raison) || enCours}
                      title={raison || 'Compter ce qui est arrivé et le faire entrer en stock'}
                      onClick={() => ouvrirReception(order)}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black h-8 px-3 rounded-xl"
                    >
                      Réceptionner
                    </Button>
                  </div>
                </div>
                {/* La raison en clair : une info-bulle ne s'affiche pas sur un écran tactile. */}
                {raison && <p className="text-[11px] font-bold text-amber-800 leading-snug sm:text-right">{raison}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        <div className="p-4 border-b border-stone-100">
          <Champ
            label="Retrouver un bon"
            htmlFor="recherche-bon"
            aide="Par numéro de bon (BT-…) ou par nom du magasin de départ ou d'arrivée."
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                id="recherche-bon"
                placeholder="Numéro de bon ou magasin…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${CLASSE_CHAMP} pl-10`}
              />
            </div>
          </Champ>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50/50">
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Date et numéro</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Trajet</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Contenu</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600">Où en est le bon</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-stone-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredOrders.map(order => {
              const enRoute = estEnRoute(order);
              const raisonR = enRoute ? raisonPasReception(order, compte, contexte) : null;
              const raisonA = enRoute ? raisonPasAnnulation(order, compte, contexte) : null;
              const ancien = estAncienBonEnAttente(order);
              // Les boutons ne s'affichent qu'à qui ils concernent : la réception à l'arrivée (et à
              // l'admin), l'annulation au départ (et à l'admin). S'ils sont grisés, la raison est
              // écrite dessous — jamais un bouton qui disparaît sans explication.
              const concerneReception = enRoute && (estAdmin || userStoreId === order.toStore);
              const concerneAnnulation = enRoute && !ancien && (estAdmin || userStoreId === order.fromStore);
              const peutClore = !raisonPasClore(order, compte);
              const raisons = Array.from(new Set([
                concerneReception ? raisonR : null,
                concerneAnnulation ? raisonA : null,
                // Ancien bon vu du départ : dire pourquoi il n'y a pas d'« Annuler ».
                ancien && !estAdmin && userStoreId === order.fromStore ? raisonPasAnnulation(order, compte) : null,
              ].filter((r): r is string => Boolean(r))));
              const manque = Array.isArray(order.manquants) ? order.manquants : [];
              return (
              <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-900">{new Date(order.date).toLocaleDateString('fr-FR')}</div>
                  <div className="text-[11px] font-medium text-stone-400">{numeroBonTransfert(order.id)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <span className="bg-stone-100 px-2 py-1 rounded-md">{getStoreLabel(order.fromStore)}</span>
                    <Truck className="w-3 h-3 text-stone-400" />
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">{getStoreLabel(order.toStore)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-stone-700">{order.items.length} référence(s)</div>
                  <div className="text-[11px] font-medium text-stone-400">
                    {uniteCommune(order.items)
                      ? `Envoyé : ${arrondiQte(order.items.reduce((acc, i) => acc + i.sentQty, 0))} ${uniteCommune(order.items)}`
                      : `${arrondiQte(order.items.reduce((acc, i) => acc + i.sentQty, 0))} unité(s) envoyée(s)`}
                  </div>
                  {manque.length > 0 && (
                    <div className="text-[11px] font-bold text-orange-700 mt-0.5" title={phrasePerteTransport(manque)}>
                      Manquant à l'arrivée : {manque.map(m => `${m.productName} ${qteAvecUnite(m.manquant, m.unitOfMeasure)}`).join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">{pastilleStatut(order)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => imprimerBon(order)}
                      className="h-8 px-3 rounded-xl border-stone-200 text-stone-700 hover:text-blue-600 hover:border-blue-200 text-[11px] font-bold gap-1.5 shadow-sm"
                      title="Le bon imprimé accompagne la marchandise pendant le trajet"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimer le bon</span>
                    </Button>
                    {concerneReception && (
                      <Button size="sm" disabled={enCours || Boolean(raisonR)} onClick={() => ouvrirReception(order)} className="bg-blue-600 hover:bg-blue-700 text-[11px] font-black h-8 px-3 rounded-xl" title={raisonR || 'Compter ce qui est arrivé et le faire entrer dans le stock d\'arrivée'}>
                        Réceptionner
                      </Button>
                    )}
                    {peutClore && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enCours}
                        onClick={() => handleClore(order)}
                        className="h-8 px-3 rounded-xl border-stone-300 text-stone-700 hover:bg-stone-50 text-[11px] font-bold gap-1.5"
                        title="Ancien bon déjà réglé autrement : le clore sans aucun mouvement de stock"
                      >
                        <Archive className="w-3.5 h-3.5" /> Clore sans mouvement
                      </Button>
                    )}
                    {concerneAnnulation && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enCours || Boolean(raisonA)}
                        onClick={() => handleCancel(order)}
                        className="h-8 px-3 rounded-xl border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-bold gap-1.5"
                        title="La marchandise revient dans le stock du départ, aux mêmes emplacements"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Annuler l'envoi
                      </Button>
                    )}
                  </div>
                  {raisons.map(r => (
                    <p key={r} className="text-[11px] font-bold text-stone-500 leading-snug mt-1.5 max-w-[320px] ml-auto">{r}</p>
                  ))}
                </td>
              </tr>
              );
            })}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm font-bold text-stone-500">Aucun bon de transfert à afficher.</p>
                  <p className="text-[11px] font-medium text-stone-400 mt-1">
                    Le bouton « Nouveau transfert », en haut à droite, sert à en créer un.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      <Dialog open={createModal} onOpenChange={open => { if (!enCours) setCreateModal(open); }}>
        <DialogContent className="max-w-3xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">Nouveau bon de transfert</DialogTitle>
            <p className="text-[11px] font-medium text-stone-500 leading-snug">
              Deux questions dans l'ordre : le trajet, puis la marchandise. Le récapitulatif en bas se relit avant
              d'envoyer.
            </p>
          </DialogHeader>
          <div className="space-y-6">
            <Encadre ton="info" titre="Ce que l'envoi déclenche">
              La marchandise sort tout de suite du stock de {getStoreLabel(fromStore) || 'votre magasin'}. Elle entre
              dans le stock du magasin d'arrivée seulement quand celui-ci la réceptionne (il la voit dans « À
              réceptionner »). Tant qu'elle n'est pas reçue, l'envoi peut être annulé : elle revient alors dans le
              stock de {getStoreLabel(fromStore) || 'votre magasin'}. Imprimez le bon : il accompagne la marchandise.
            </Encadre>

            <SectionFormulaire
              numero={1}
              titre="D'où et vers quel magasin ?"
              aide={estAdmin
                ? 'Choisissez le magasin qui envoie (le magasin principal par défaut, avec ses entrepôts), puis celui qui reçoit. Les quantités proposées à l\'étape 2 sont celles du départ.'
                : 'La marchandise part de votre magasin : il ne reste qu\'à désigner le magasin qui reçoit.'}
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Champ
                  label="Lieu de départ"
                  htmlFor="transfert-depart"
                  aide={estAdmin
                    ? 'Le magasin principal compte aussi ce qui est rangé dans ses entrepôts.'
                    : 'Votre magasin : un magasin n\'envoie que sa propre marchandise.'}
                  indice={!estAdmin ? (
                    <span className="inline-flex items-center gap-1 text-stone-400">
                      <Lock className="w-3 h-3" /> Votre magasin
                    </span>
                  ) : undefined}
                >
                  {estAdmin ? (
                    <select
                      id="transfert-depart"
                      value={fromStore}
                      onChange={e => setDepartChoisi(e.target.value)}
                      className={`${CLASSE_CHAMP} w-full border bg-white px-3 outline-none`}
                    >
                      {departs.map(id => (
                        <option key={id} value={id}>🏪 {getStoreLabel(id)}</option>
                      ))}
                    </select>
                  ) : (
                    <div
                      id="transfert-depart"
                      className={`${CLASSE_CHAMP} flex w-full items-center gap-2 border border-stone-200 bg-stone-50 px-3`}
                    >
                      <Building2 className="w-4 h-4 shrink-0 text-stone-400" />
                      <span className="truncate">{getStoreLabel(fromStore) || '—'}</span>
                    </div>
                  )}
                </Champ>

                <Champ
                  label="Lieu d'arrivée"
                  obligatoire
                  htmlFor="transfert-arrivee"
                  aide="Un des autres magasins. La marchandise y entrera quand il la réceptionnera."
                >
                  {magasinsArrivee.length > 0 ? (
                    <select
                      id="transfert-arrivee"
                      value={toStore}
                      onChange={e => setToStore(e.target.value)}
                      className={`${CLASSE_CHAMP} w-full border bg-white px-3 outline-none`}
                    >
                      <option value="" disabled>Choisissez le magasin qui reçoit…</option>
                      {magasinsArrivee.map(s => (
                        <option key={s.id} value={s.id}>🏪 {s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Encadre ton="attention" titre="Aucun magasin ne peut recevoir">
                      En dehors du départ, aucun autre magasin n'est déclaré : la marchandise n'a nulle part où aller.
                      Les entrepôts ne comptent pas — ils appartiennent au magasin principal. Faites ajouter le magasin
                      destinataire, puis revenez envoyer le bon.
                    </Encadre>
                  )}
                </Champ>
              </div>
            </SectionFormulaire>

            <SectionFormulaire
              numero={2}
              titre="Quoi et combien ?"
              aide="Une ligne par référence. Un article décliné en couleurs, qualités ou tailles se transfère variante par variante : c'est la variante choisie qui quitte le lieu de départ, jamais le produit entier."
              action={
                <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                  Stock de départ : {getStoreLabel(fromStore)}
                </span>
              }
            >
              <Champ
                label="Chercher la référence à transférer"
                htmlFor="transfert-recherche"
                aide="Nom, couleur ou qualité. La pastille de droite donne ce qui reste au lieu de départ : une référence à zéro ne peut pas être ajoutée au bon."
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 z-10" />
                  <Input
                    id="transfert-recherche"
                    placeholder="Nom, couleur ou qualité…"
                    value={articleSearch}
                    onChange={e => setArticleSearch(e.target.value)}
                    className={`${CLASSE_CHAMP} pl-10`}
                  />

                  {articleSearch && (
                    <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-2">
                      {resultatsRecherche.map(item => {
                        const availInSrc = disponibleDepuis(item, fromStore, stores);
                        return (
                          <button key={item.articleId} onClick={() => addArticleToTransfer(item)} className="w-full text-left px-3 py-2 hover:bg-stone-50 rounded-lg flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-stone-800 truncate">{item.productName}</p>
                              <p className="text-[11px] font-medium text-stone-400 truncate">{[item.quality, item.color, item.size].filter(Boolean).join(' · ') || 'Référence sans déclinaison'}</p>
                            </div>
                            <span className={`text-[11px] font-black px-2 py-1 rounded-md shrink-0 ${availInSrc > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                              {availInSrc > 0 ? `${qteAvecUnite(availInSrc, item.unitOfMeasure)} au départ` : 'Rien au départ'}
                            </span>
                          </button>
                        );
                      })}
                      {resultatsRecherche.length === 0 && (
                        <p className="px-3 py-4 text-center text-[11px] font-bold text-stone-400">
                          Aucune référence ne correspond à cette recherche.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Champ>

              {/* Lignes retenues */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600">Référence retenue</th>
                      <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-36">Quantité envoyée</th>
                      <th className="px-4 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item, idx) => {
                      const originalStock = stockItems.find(s => s.articleId === item.articleId);
                      const availInSrc = disponibleDepuis(originalStock, fromStore, stores);
                      // Message rattaché à la ligne fautive, pour ne plus le découvrir au moment du clic.
                      const erreurLigne = availInSrc <= 0
                        ? `Plus rien à ${getStoreLabel(fromStore) || 'ce lieu'} : retirez la ligne.`
                        : item.sentQty <= 0
                          ? 'Indiquez la quantité : une ligne à zéro empêche l\'envoi du bon.'
                          : item.sentQty > arrondiQte(availInSrc)
                            ? `Au-delà de ce qui reste au départ (${qteAvecUnite(availInSrc, item.unitOfMeasure)}).`
                            : null;

                      return (
                        <tr key={item.articleId} className="border-b border-stone-100 last:border-0 align-top">
                          <td className="px-4 py-3">
                            <p className="text-[13px] font-bold text-stone-800 leading-tight">
                              {item.productName} {[item.quality ? `[${item.quality}]` : '', item.color, item.size].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                              Reste à {getStoreLabel(fromStore) || 'ce lieu'} : <strong className="text-emerald-700">{qteAvecUnite(availInSrc, item.unitOfMeasure)}</strong>
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <ChampQuantite
                                garderDecimales
                                min={pasDeSaisie(item.unitOfMeasure)}
                                max={availInSrc}
                                valeur={item.sentQty}
                                unite={item.unitOfMeasure}
                                aria-label={`Quantité envoyée pour ${item.productName}`}
                                onQuantite={val => {
                                  const bounded = arrondiQte(Math.max(0, Math.min(val, availInSrc)));
                                  setSelectedItems(prev => prev.map((p, i) => i === idx ? { ...p, sentQty: bounded } : p));
                                }}
                                className={`${CLASSE_CHAMP} text-center`}
                              />
                              {uniteCourte(item.unitOfMeasure) && (
                                <span className="shrink-0 text-[11px] font-bold text-stone-500">{uniteCourte(item.unitOfMeasure)}</span>
                              )}
                            </div>
                            {erreurLigne && (
                              <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1 mt-1.5">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {erreurLigne}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-700 mt-3"
                              title="Retirer cette référence du bon"
                              aria-label={`Retirer ${item.productName} du bon`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center">
                          <p className="text-[13px] font-bold text-stone-500">Aucune référence dans ce bon.</p>
                          <p className="text-[11px] font-medium text-stone-400 mt-1">
                            Utilisez la recherche ci-dessus : chaque référence trouvée s'ajoute en un clic.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFormulaire>

            <Recapitulatif titre="À relire avant d'envoyer">
              <LigneResume libelle="Part de" valeur={getStoreLabel(fromStore) || '—'} />
              <LigneResume libelle="Arrive à" valeur={getStoreLabel(toStore) || '—'} />
              <LigneResume libelle="Références au bon" valeur={selectedItems.length} />
              {uniteCommune(selectedItems)
                ? <LigneResume libelle="Quantité qui sort du stock du départ" valeur={`${arrondiQte(totalUnitesEnvoyees)} ${uniteCommune(selectedItems)}`} fort />
                : <LigneResume libelle="Unités qui sortent du stock du départ" valeur={arrondiQte(totalUnitesEnvoyees)} fort />}
              <LigneResume libelle="Entrée à l'arrivée" valeur="à la réception" />
            </Recapitulatif>

            <BoutonValider
              onClick={handleSendTransfer}
              enCours={enCours}
              libelleEnCours="Envoi…"
              raisonDesactive={
                raisonPasEnvoi
                  ? raisonPasEnvoi
                  : raisonPasEnvoiMaintenant
                    ? raisonPasEnvoiMaintenant
                  : magasinsArrivee.length === 0
                    ? "Aucun autre magasin n'est déclaré : il n'y a nulle part où envoyer la marchandise."
                    : !toStore
                      ? "Choisissez le magasin qui reçoit, à l'étape 1, pour envoyer le bon."
                      : selectedItems.length === 0
                        ? "Ajoutez au moins une référence à l'étape 2 pour envoyer le bon."
                        : null
              }
            >
              Envoyer : sortir la marchandise du stock de {getStoreLabel(fromStore) || 'votre magasin'}
            </BoutonValider>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={enCours} onClick={() => setCreateModal(false)} className="rounded-xl text-xs font-bold text-stone-500">Fermer sans envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* APRÈS L'ENVOI : imprimer le bon, d'un clic frais */}
      <Dialog open={Boolean(envoiFait)} onOpenChange={open => { if (!open) setEnvoiFait(null); }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">Transfert envoyé</DialogTitle>
          </DialogHeader>
          {envoiFait && (
            <div className="space-y-4">
              <Encadre ton="info" titre={`${numeroBonTransfert(envoiFait.id)} · ${getStoreLabel(envoiFait.fromStore)} → ${getStoreLabel(envoiFait.toStore)}`}>
                La marchandise est sortie du stock de {getStoreLabel(envoiFait.fromStore)}. Elle est « En route » :
                {` ${getStoreLabel(envoiFait.toStore)}`} la voit dans « À réceptionner ». Imprimez le bon et mettez-le avec
                la marchandise.
              </Encadre>
              <Button onClick={() => imprimerBon(envoiFait)} className="w-full h-11 rounded-2xl font-black gap-2">
                <Printer className="w-4 h-4" /> Imprimer le bon de transfert
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnvoiFait(null)} className="rounded-xl text-xs font-bold text-stone-500">Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RÉCEPTION */}
      <Dialog open={validateModal.open} onOpenChange={open => { if (!open && !enCours) setValidateModal({ open: false }); }}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-stone-900">Réceptionner le transfert</DialogTitle>
            <p className="text-[11px] font-medium text-stone-500 leading-snug">
              Comptez ce qui est réellement arrivé, référence par référence, puis validez. C'est cette réception qui
              fait entrer la marchandise dans le stock d'arrivée.
            </p>
          </DialogHeader>
          <div className="space-y-6">
            <Encadre ton="attention" titre="Ce qui manque est noté comme perte au transport">
              La marchandise est sortie du stock de départ à l'envoi. Ce que vous ne comptez pas ici n'entre donc
              nulle part : il est noté sur le bon et au journal comme perte au transport, sans autre mouvement de
              stock. On ne peut pas recevoir plus que ce qui est parti. Recomptez avant de valider.
            </Encadre>
            {lignesARattraper.length > 0 && bonRecu && (
              <Encadre ton="attention" titre="Ancien bon : sortie du départ jamais enregistrée">
                Pour {lignesARattraper.length} référence(s) de ce bon, la sortie du stock de {getStoreLabel(bonRecu.fromStore)} n'a
                pas été enregistrée à l'envoi. En validant, elle est écrite maintenant au départ, en même temps que
                l'entrée ici : le départ perd ce qui a été envoyé, l'arrivée gagne ce qui est compté.
                {!estAdmin && ' Seul l\'administrateur peut le faire : prévenez-le.'}
              </Encadre>
            )}

            <SectionFormulaire
              numero={1}
              titre="De quel bon s'agit-il ?"
              aide="Rappel du trajet inscrit sur le bon. Il ne se modifie plus à ce stade."
            >
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <span className="bg-white border border-stone-200 px-2.5 py-1 rounded-lg text-xs font-bold text-stone-700">
                  {bonRecu ? getStoreLabel(bonRecu.fromStore) : '—'}
                </span>
                <Truck className="w-3.5 h-3.5 text-stone-400" />
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                  {bonRecu ? getStoreLabel(bonRecu.toStore) : '—'}
                </span>
                <span className="text-[11px] font-medium text-stone-500 ml-auto">
                  {bonRecu ? numeroBonTransfert(bonRecu.id) : ''} · parti le {bonRecu ? new Date(bonRecu.date).toLocaleDateString('fr-FR') : ''}
                </span>
              </div>
            </SectionFormulaire>

            <SectionFormulaire
              numero={2}
              titre="Combien est arrivé ?"
              aide="Une case par référence, déjà remplie avec la quantité envoyée. Ne la corrigez que si le comptage donne autre chose."
            >
              <div className="overflow-x-auto">
              <table className="w-full text-left border border-stone-200 rounded-xl overflow-hidden">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600">Référence</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-24">Envoyé</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-stone-600 w-40">Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {bonRecu?.items.map(item => {
                    const recuSaisi = receivedItems[item.articleId] ?? item.sentQty;
                    const manque = arrondiQte(item.sentQty - recuSaisi);
                    return (
                      <tr key={item.articleId} className="border-b border-stone-100 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-bold text-stone-800 leading-tight">{item.productName}</p>
                          {[item.quality, item.color, item.size].filter(Boolean).length > 0 && (
                            <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                              {[item.quality, item.color, item.size].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-black text-blue-600 tabular-nums">{qteAvecUnite(item.sentQty, item.unitOfMeasure)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ChampQuantite
                              garderDecimales
                              min={0}
                              max={item.sentQty}
                              valeur={recuSaisi}
                              unite={item.unitOfMeasure}
                              aria-label={`Quantité reçue pour ${item.productName}`}
                              onQuantite={val => setReceivedItems(prev => ({ ...prev, [item.articleId]: val }))}
                              className={`${CLASSE_CHAMP} text-center border-emerald-200 focus-visible:ring-emerald-500`}
                            />
                            {uniteCourte(item.unitOfMeasure) && (
                              <span className="shrink-0 text-[11px] font-bold text-stone-500">{uniteCourte(item.unitOfMeasure)}</span>
                            )}
                          </div>
                          {manque > 0 && (
                            <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1 mt-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {`${qteAvecUnite(manque, item.unitOfMeasure)} manquant(s) : noté(s) comme perte au transport.`}
                            </p>
                          )}
                          {manque < 0 && (
                            <p className="text-[11px] font-bold text-rose-600 leading-snug flex items-start gap-1 mt-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Plus que l'envoyé : ramenez à {qteAvecUnite(item.sentQty, item.unitOfMeasure)} au plus.
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </SectionFormulaire>

            <Recapitulatif titre="À relire avant de valider">
              <LigneResume libelle="Parti de" valeur={bonRecu ? getStoreLabel(bonRecu.fromStore) : '—'} />
              {bonRecu && uniteCommune(bonRecu.items) ? (
                <>
                  <LigneResume libelle="Quantité envoyée" valeur={`${arrondiQte(totalEnvoyeBon)} ${uniteCommune(bonRecu.items)}`} />
                  <LigneResume libelle="Quantité reçue (entre en stock)" valeur={`${arrondiQte(totalCompteBon)} ${uniteCommune(bonRecu.items)}`} fort ton="positif" />
                </>
              ) : (
                <>
                  <LigneResume libelle="Unités envoyées" valeur={arrondiQte(totalEnvoyeBon)} />
                  <LigneResume libelle="Unités reçues (entrent en stock)" valeur={arrondiQte(totalCompteBon)} fort ton="positif" />
                </>
              )}
              <LigneResume
                libelle="Manquant (perte au transport)"
                valeur={bonRecu && uniteCommune(bonRecu.items) ? `${ecartBon} ${uniteCommune(bonRecu.items)}` : ecartBon}
                ton={ecartBon > 0 ? 'alerte' : 'neutre'}
              />
            </Recapitulatif>

            <BoutonValider
              onClick={handleReceive}
              enCours={enCours}
              libelleEnCours="Réception…"
              raisonDesactive={raisonPasValiderReception}
            >
              Valider la réception et faire entrer en stock
            </BoutonValider>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              type="button"
              onClick={() => validateModal.order && imprimerBon(validateModal.order)}
              className="rounded-xl text-xs font-bold gap-1.5"
              title="Le bon imprimé accompagne la marchandise pendant le trajet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer le bon</span>
            </Button>
            <Button variant="ghost" disabled={enCours} onClick={() => setValidateModal({ open: false })} className="rounded-xl text-xs font-bold text-stone-500">Fermer sans valider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
