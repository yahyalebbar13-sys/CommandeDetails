/**
 * useStatutsAAnnoncer
 *
 * Quand le statut d'un dossier change sans qu'on le touche — le jour d'arrivée
 * passe, ShipsGo déplace la date, l'entrée en stock est atteinte — les clients
 * ne sont plus prévenus d'office : le changement attend dans le bandeau de
 * /gestion, où l'on choisit « Prévenir » ou « Ne pas prévenir ». Les deux
 * inscrivent `lastNotifiedStatus` sur le dossier, qui quitte alors la liste.
 *
 * Un dossier sans article client n'a personne à prévenir : son statut est
 * retenu sans rien demander.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { changementsDeStatut, envoyerAnnonces, type ChangementDeStatut } from '@/lib/edition-dossier';

interface Params {
  firestore: any;
  adminUid: string | null;
  factures: any[];
  articles: any[];        // articles bruts (clientName, factureId)
  enabled: boolean;       // seulement une fois tout chargé
}

const cle = (c: ChangementDeStatut) => `${c.facture.id}:${c.nouveau}`;

export function useStatutsAAnnoncer({ firestore, adminUid, factures, articles, enabled }: Params) {
  // Le statut dépend de la date du jour : un onglet resté ouvert doit voir minuit passer.
  const [jour, setJour] = useState(() => new Date().toDateString());
  useEffect(() => {
    const t = setInterval(() => setJour(new Date().toDateString()), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const changements = useMemo(
    () => (enabled ? changementsDeStatut(factures, articles) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, factures, articles, jour],
  );

  // Décidés ici, en attendant que Firestore renvoie le dossier à jour.
  const [decides, setDecides] = useState<Set<string>>(() => new Set());
  const marquer = (k: string, oui: boolean) => setDecides(prev => {
    const s = new Set(prev);
    if (oui) s.add(k); else s.delete(k);
    return s;
  });

  const retenir = useCallback(async (c: ChangementDeStatut) => {
    if (!firestore || !adminUid) return false;
    try {
      await updateDoc(doc(firestore, 'users', adminUid, 'factures', c.facture.id), { lastNotifiedStatus: c.nouveau });
      return true;
    } catch (err) {
      console.error(`[Statuts] Impossible d'enregistrer le statut annoncé de ${c.facture.id}:`, err);
      return false;
    }
  }, [firestore, adminUid]);

  // Personne à prévenir : on retient le statut, une fois par changement.
  const retenusSansClient = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of changements) {
      if (c.articles.length || retenusSansClient.current.has(cle(c))) continue;
      retenusSansClient.current.add(cle(c));
      retenir(c);
    }
  }, [changements, retenir]);

  const aAnnoncer = useMemo(
    () => changements.filter(c => c.articles.length > 0 && !decides.has(cle(c))),
    [changements, decides],
  );

  /** Envoie les messages aux clients du dossier ; renvoie le nombre lancé. */
  const prevenir = useCallback(async (c: ChangementDeStatut) => {
    if (!firestore || !adminUid) return 0;
    marquer(cle(c), true);
    const n = envoyerAnnonces({
      firestore,
      adminUid,
      destinataires: c.articles,
      ancien: c.ancien,
      nouveau: c.nouveau,
      dates: c.facture,
      noBL: c.facture.noBL,
    });
    // Les messages sont partis : même si l'écriture échoue, le changement ne
    // doit pas revenir proposer un second envoi pendant cette session.
    await retenir(c);
    return n;
  }, [firestore, adminUid, retenir]);

  /** Retient le statut sans rien envoyer. */
  const ignorer = useCallback(async (c: ChangementDeStatut) => {
    marquer(cle(c), true);
    const ok = await retenir(c);
    if (!ok) marquer(cle(c), false);
    return ok;
  }, [retenir]);

  return { aAnnoncer, prevenir, ignorer };
}
