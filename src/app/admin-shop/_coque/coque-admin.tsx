'use client';

// ─── Coque de l'admin boutique ───────────────────────────────────────────────
// Tout ce qui entoure les écrans : l'écoute en direct des commandes, l'alerte
// « nouvelle commande » (montée ici pour sonner quel que soit l'onglet), la
// navigation, l'en-tête, l'adresse (?vue=…&commande=…), le tableau de bord et
// l'écran Commandes. page.tsx ne garde que la connexion et les écrans
// Produits, Catégories, Clients et Catalogue, qu'il passe dans `ecrans`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore';
import type { ShopOrder } from '@/lib/shop-types';
import type { FileCommandes } from '@/lib/commandes-boutique';
import { EcranCommandes } from '../_commandes/ecran-commandes';
import { actionsFirestore } from '../_commandes/actions-commandes';
import { normaliserCommande } from '../_commandes/normaliser-commande';
import { useAlerteNouvellesCommandes } from '../_commandes/use-alerte-nouvelles-commandes';
import { EnTeteAdmin, type InfosConnexion } from './en-tete';
import {
  MESSAGE_HORS_LIGNE_SANS_DONNEES,
  messageErreurLecture,
  resumeAConfirmer,
  useMaintenant,
  type EtatConnexion,
} from './etat-commandes';
import { NavigationAdmin } from './navigation';
import { BandeauErreur, EtatChargementCommandes, TableauDeBord } from './tableau-de-bord';
import { adresseAvec, lireAdresse, VUE_PAR_DEFAUT, type VueAdmin } from './vues';

export interface EcransAdmin {
  produits: () => ReactNode;
  categories: () => ReactNode;
  catalogue: () => ReactNode;
  /** Clients se calcule à partir des commandes ; un clic sur une commande l'ouvre dans l'écran Commandes. */
  clients: (p: { orders: ShopOrder[]; onOuvrirCommande: (id: string) => void }) => ReactNode;
}

/** Repère posé sur l'entrée d'historique ajoutée pour une fiche ouverte. */
const MARQUE_FICHE = 'lebtexFicheCommande';

/** Lecture de l'adresse dès le premier rendu côté navigateur (le serveur, lui, affiche l'écran de chargement). */
function adresseInitiale() {
  if (typeof window === 'undefined') return { vue: VUE_PAR_DEFAUT, commande: null as string | null };
  return lireAdresse(window.location.search);
}

const adresseActuelle = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const entreeDeFiche = () => !!(window.history.state as Record<string, unknown> | null)?.[MARQUE_FICHE];

export function CoqueAdmin({ db, user, onDeconnexion, ecrans }: {
  db: Firestore;
  /** Compte administrateur déjà vérifié par la page. */
  user: { email: string | null; displayName: string | null };
  onDeconnexion: () => void;
  ecrans: EcransAdmin;
}) {
  // ── Commandes en temps réel ──
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [pret, setPret] = useState(false);              // le serveur a répondu au moins une fois
  const pretRef = useRef(false);
  const [horsLigne, setHorsLigne] = useState(false);    // la dernière liste vient du cache, pas du serveur
  const [erreurLecture, setErreurLecture] = useState<string | null>(null); // la base a refusé : écoute arrêtée
  const [actualiseLe, setActualiseLe] = useState<Date | null>(null);
  const [tentative, setTentative] = useState(0);        // « Réessayer » relance l'écoute

  useEffect(() => {
    setErreurLecture(null);
    const q = query(collection(db, 'shop_orders'), orderBy('createdAt', 'desc'));
    // includeMetadataChanges : on est prévenu quand la connexion tombe (liste
    // servie depuis le cache), sinon le voyant resterait vert hors ligne.
    const arreter = onSnapshot(
      q,
      { includeMetadataChanges: true },
      snap => {
        const duCache = snap.metadata.fromCache;
        // Écoute relancée hors connexion (« Réessayer ») : le cache en mémoire a été
        // vidé à l'arrêt, et Firestore renvoie une liste vide « tirée du cache ».
        // Ce n'est pas « plus aucune commande » : on garde la dernière liste connue.
        if (duCache && snap.empty && pretRef.current) {
          setHorsLigne(true);
          setErreurLecture(null);
          return;
        }
        // N'importe qui peut créer une commande : chacune est remise d'aplomb ici,
        // au seul point d'entrée, avant d'arriver dans un écran.
        setOrders(snap.docs.map(d => normaliserCommande(d.id, d.data())));
        setHorsLigne(duCache);
        if (!duCache) {
          pretRef.current = true;
          setPret(true);
          setActualiseLe(new Date());
        }
        setErreurLecture(null);
      },
      err => setErreurLecture(messageErreurLecture(err)),
    );
    return () => arreter();
  }, [db, tentative]);

  const reessayer = useCallback(() => setTentative(t => t + 1), []);

  // Ce que voient les écrans : jamais « aucune commande » quand on ne sait pas.
  const erreur = erreurLecture ?? (!pret && horsLigne ? MESSAGE_HORS_LIGNE_SANS_DONNEES : null);
  const chargement = !pret && !erreur;
  const etat: EtatConnexion = erreurLecture ? 'erreur' : horsLigne ? 'hors_ligne' : pret ? 'direct' : 'connexion';
  const connexion: InfosConnexion = { etat, message: erreur, actualiseLe };

  // ── Écran affiché et fiche ouverte, gardés dans l'adresse ──
  const [vue, setVue] = useState<VueAdmin>(() => adresseInitiale().vue);
  const [commandeOuverteId, setCommandeOuverteId] = useState<string | null>(() => adresseInitiale().commande);

  // ── Historique du navigateur ──
  // Ouvrir une fiche ajoute une entrée : le geste « retour » du téléphone (ou le
  // bouton Précédent) ferme la fiche au lieu de quitter l'admin. Changer d'écran
  // ou passer d'une fiche à l'autre remplace l'entrée, sans en empiler.
  const ficheEmpilee = useRef(false);   // l'entrée actuelle est celle d'une fiche, ajoutée ici
  const aEmpiler = useRef(false);       // la prochaine mise à jour de l'adresse ajoute une entrée
  const ouverteRef = useRef(commandeOuverteId);
  ouverteRef.current = commandeOuverteId;

  // Lien direct vers une fiche (e-mail « nouvelle commande ») : on glisse la liste
  // dessous, pour que « retour » mène aux commandes avant de ramener à Gmail.
  const insertionFaite = useRef(false);
  useEffect(() => {
    if (insertionFaite.current) return;
    insertionFaite.current = true;
    const { commande } = lireAdresse(window.location.search);
    if (!commande) return;
    window.history.replaceState({ ...window.history.state, [MARQUE_FICHE]: false }, '', adresseAvec(window.location.href, 'commandes', null));
    window.history.pushState({ ...window.history.state, [MARQUE_FICHE]: true }, '', adresseAvec(window.location.href, 'commandes', commande));
    ficheEmpilee.current = true;
  }, []);

  useEffect(() => {
    const voulue = adresseAvec(window.location.href, vue, commandeOuverteId);
    if (aEmpiler.current) {
      aEmpiler.current = false;
      if (commandeOuverteId) {
        window.history.pushState({ ...window.history.state, [MARQUE_FICHE]: true }, '', voulue);
        ficheEmpilee.current = true;
        return;
      }
    }
    if (!commandeOuverteId) ficheEmpilee.current = false;
    const marque = ficheEmpilee.current;
    if (voulue !== adresseActuelle() || entreeDeFiche() !== marque) {
      window.history.replaceState({ ...window.history.state, [MARQUE_FICHE]: marque }, '', voulue);
    }
  }, [vue, commandeOuverteId]);

  // Retour / Suivant du navigateur : l'écran suit l'adresse.
  useEffect(() => {
    const auRetour = () => {
      const { vue: v, commande } = lireAdresse(window.location.search);
      aEmpiler.current = false;
      ficheEmpilee.current = !!commande && entreeDeFiche();
      setVue(v);
      setCommandeOuverteId(commande);
    };
    window.addEventListener('popstate', auRetour);
    return () => window.removeEventListener('popstate', auRetour);
  }, []);

  /** Fermer la fiche : si c'est nous qui avons ajouté son entrée, on la retire (retour). */
  const fermerFiche = useCallback(() => {
    if (ficheEmpilee.current && entreeDeFiche()) {
      // Un second appui avant le retour effectif ne doit pas reculer encore (il sortirait de l'admin).
      ficheEmpilee.current = false;
      window.history.back();
      return;
    }
    setCommandeOuverteId(null);
  }, []);

  // Changer d'écran remonte en haut de page (pas au premier affichage).
  const premierAffichage = useRef(true);
  useEffect(() => {
    if (premierAffichage.current) { premierAffichage.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [vue]);

  // ── File demandée d'ailleurs (tableau de bord, pastille « N à confirmer ») ──
  const [fileDemandee, setFileDemandee] = useState<{ file: FileCommandes; jeton: number } | null>(null);
  const jeton = useRef(0);

  const changerVue = useCallback((v: VueAdmin) => {
    setFileDemandee(null);
    setVue(v);
    // La fiche est un panneau par-dessus l'écran Commandes : on la ferme en le quittant.
    if (v !== 'commandes') setCommandeOuverteId(null);
    window.scrollTo({ top: 0 });
  }, []);

  const voirFile = useCallback((file: FileCommandes) => {
    jeton.current += 1;
    setFileDemandee({ file, jeton: jeton.current });
    setVue('commandes');
    window.scrollTo({ top: 0 });
  }, []);
  const voirAConfirmer = useCallback(() => voirFile('a_confirmer'), [voirFile]);

  // Ouvrir une commande (tableau de bord, Clients, notification, lien de l'e-mail).
  // Stable : le hook d'alerte la reçoit en paramètre, et la marque « vue » passe
  // par une ref pour éviter la boucle hook ↔ fonction.
  const ouvrirCommande = useCallback((id: string | null) => {
    if (!id) { fermerFiche(); return; }
    // Aucune fiche ouverte : celle-ci aura son entrée dans l'historique.
    if (!ouverteRef.current) aEmpiler.current = true;
    setVue('commandes');
    setCommandeOuverteId(id);
  }, [fermerFiche]);

  // ── Alerte des nouvelles commandes (son, notification, titre de l'onglet) ──
  const alerte = useAlerteNouvellesCommandes(orders, pret, ouvrirCommande);
  const marquerVueRef = useRef(alerte.marquerVue);
  useEffect(() => { marquerVueRef.current = alerte.marquerVue; });
  useEffect(() => {
    if (commandeOuverteId) marquerVueRef.current(commandeOuverteId);
  }, [commandeOuverteId]);

  // ── Actions sur les commandes (statut, note) : via le serveur, signées par le compte connecté ──
  const auteur = user.email || '';
  const actions = useMemo(() => actionsFirestore(db, auteur), [db, auteur]);

  // ── Pastilles « à confirmer », qui passent au rouge avec le temps ──
  const maintenant = useMaintenant();
  const resume = useMemo(() => resumeAConfirmer(orders, maintenant), [orders, maintenant]);

  const utilisateur = { nom: user.displayName || 'Administrateur', email: user.email || '' };

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex">
      <NavigationAdmin
        vue={vue}
        onVue={changerVue}
        aConfirmer={resume.aConfirmer}
        enRetard={resume.enRetard}
        connexion={connexion}
        onReessayer={reessayer}
        utilisateur={utilisateur}
        onDeconnexion={onDeconnexion}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <EnTeteAdmin
          vue={vue}
          connexion={connexion}
          onReessayer={reessayer}
          aConfirmer={resume.aConfirmer}
          enRetard={resume.enRetard}
          onVoirAConfirmer={voirAConfirmer}
          utilisateur={utilisateur}
          onDeconnexion={onDeconnexion}
        />

        {/* En bas sur téléphone : la hauteur de la barre du bas et de la zone sûre, pour que rien ne soit caché.
            overflow-x-clip (et non auto) : coupe un débordement latéral sans casser les éléments « sticky » des écrans. */}
        <main className="flex-1 min-w-0 overflow-x-clip px-4 pt-4 md:px-6 md:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
          {vue === 'commandes' && (
            <EcranCommandes
              orders={orders}
              chargement={chargement}
              erreur={erreur}
              actions={actions}
              commandeOuverteId={commandeOuverteId}
              onOuvrir={ouvrirCommande}
              nonVues={alerte.nonVues}
              alertes={alerte}
              fileDemandee={fileDemandee}
              onReessayer={reessayer}
            />
          )}
          {vue === 'tableau' && (
            <TableauDeBord
              orders={orders}
              pret={pret}
              erreur={erreur}
              maintenant={maintenant}
              nonVues={alerte.nonVues}
              onOuvrirCommande={ouvrirCommande}
              onVoirFile={voirFile}
              onReessayer={reessayer}
            />
          )}
          {vue === 'produits' && ecrans.produits()}
          {vue === 'categories' && ecrans.categories()}
          {vue === 'clients' && (
            pret ? (
              <>
                {erreur && <div className="mb-4"><BandeauErreur message={erreur} onReessayer={reessayer} /></div>}
                {ecrans.clients({ orders, onOuvrirCommande: ouvrirCommande })}
              </>
            ) : (
              // Sans commandes lues, la liste des clients serait vide : on ne l'affiche pas.
              <EtatChargementCommandes erreur={erreur} onReessayer={reessayer} />
            )
          )}
          {vue === 'catalogue' && ecrans.catalogue()}
        </main>
      </div>
    </div>
  );
}
