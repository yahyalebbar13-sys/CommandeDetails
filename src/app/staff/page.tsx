'use client';

// ─── Espace équipe (/staff) ──────────────────────────────────────────────────
// Un seul compte pour toute l'équipe, créé par le patron depuis son admin
// (« Accès équipe »). On s'y connecte avec un nom d'utilisateur et un mot de
// passe ; le compte porte le badge « staff » posé par le serveur.
//
// Ici : retrouver la session, vérifier l'accès, puis montrer soit la connexion,
// soit l'espace. Le patron (ADMIN_EMAIL) peut aussi l'ouvrir pour voir ce que
// voit l'équipe. Ce contrôle ne sert qu'à l'affichage : chaque route du serveur
// et les règles de la base revérifient l'accès à chaque lecture et écriture.
//
// Session fermée par le patron (mot de passe changé, accès désactivé) : les
// routes refusent tout de suite ; l'écran, lui, redemande un jeton neuf toutes
// les 3 minutes, au retour sur la page et dès qu'une route refuse. Firebase
// refuse alors le jeton, déconnecte, et l'employé revient à la connexion avec
// l'explication.
//
// Toutes les parties du site partagent UNE session par navigateur : un compte
// d'une autre partie (gestion, stock, compte client) n'est jamais déconnecté
// d'office ici, on propose de le faire.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, onIdTokenChanged, signOut, type IdTokenResult, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { EVENEMENT_ACCES_REFUSE } from '@/lib/acces-equipe';
import {
  classerErreurVerification,
  codeErreur,
  compteAffiche,
  MESSAGE_ACCES_DESACTIVE,
  MESSAGE_DECONNECTE_AILLEURS,
  MESSAGE_SANS_ACCES,
  MESSAGE_SESSION_TERMINEE,
  reactionSansAcces,
  roleDepuisJeton,
  type MessageConnexion,
  type RoleEquipe,
} from './_espace/acces';
import { Connexion } from './_espace/connexion';
import { EcranAttente, EcranAutreCompte, EcranVerificationImpossible } from './_espace/ecrans-attente';
import { EspaceEquipe } from './_espace/espace-equipe';

// L'application Firebase par défaut, comme l'admin : une seule session sur le site.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

type Etat =
  | { type: 'chargement' }                                   // la session enregistrée n'est pas encore relue
  | { type: 'deconnecte' }
  | { type: 'verification'; depuisFormulaire: boolean }       // connecté : on vérifie l'accès
  | { type: 'bloque'; horsLigne: boolean }                    // vérification impossible (réseau)
  | { type: 'autre_compte'; email: string }                   // un compte d'une autre partie du site est connecté
  | { type: 'autorise'; role: RoleEquipe; email: string; uid: string };

const MESSAGE_AU_REVOIR: MessageConnexion = { ton: 'info', texte: 'Vous êtes déconnecté.' };
const MESSAGE_AUTRE_COMPTE_SORTI: MessageConnexion = {
  ton: 'info',
  texte: "L'autre compte est déconnecté. Connectez-vous avec le nom d'utilisateur de l'équipe.",
};

/** Contrôle régulier de la session tant que l'espace est ouvert (et visible). */
const INTERVALLE_CONTROLE_MS = 3 * 60_000;
/** Au retour sur la page : pas plus d'un contrôle par minute. */
const ECART_MIN_CONTROLE_MS = 60_000;
/** Une raison de sortie (désactivé, session terminée) vaut pour la déconnexion qui la suit de près. */
const VALIDITE_RAISON_MS = 10_000;

// Repère « une session d'équipe était ouverte sur cet appareil » : si elle a
// disparu sans « Se déconnecter » (Firebase l'efface sans rien dire au
// chargement quand le mot de passe a changé), l'écran de connexion l'explique.
const CLE_SESSION_OUVERTE = 'lebtex_equipe_session_ouverte';
function marquerSessionOuverte(ouverte: boolean) {
  try {
    if (ouverte) window.localStorage.setItem(CLE_SESSION_OUVERTE, '1');
    else window.localStorage.removeItem(CLE_SESSION_OUVERTE);
  } catch { /* stockage bloqué : on s'en passe */ }
}
function sessionEtaitOuverte(): boolean {
  try { return window.localStorage.getItem(CLE_SESSION_OUVERTE) === '1'; } catch { return false; }
}

export default function EspaceEquipePage() {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' });
  const etatRef = useRef<Etat>(etat);
  etatRef.current = etat;
  const [message, setMessage] = useState<MessageConnexion | null>(null);

  /** Numéro de la dernière vérification : une réponse plus ancienne est ignorée. */
  const tour = useRef(0);
  /** Message à montrer quand la déconnexion que l'on vient de demander sera faite. */
  const messageSortie = useRef<MessageConnexion | null>(null);
  /** Pourquoi Firebase vient de refuser la session (il déconnecte lui-même, parfois avant qu'on le sache). */
  const raisonRecente = useRef<{ message: MessageConnexion; le: number } | null>(null);
  /** L'espace a été ouvert : une déconnexion venue d'ailleurs mérite une explication. */
  const dansEspace = useRef(false);

  // Fond sombre jusque sous le rebond de l'iPhone (le corps de page du site est crème).
  useEffect(() => {
    const html = document.documentElement.style.backgroundColor;
    const corps = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = '#0F0F0F';
    document.body.style.backgroundColor = '#0F0F0F';
    return () => {
      document.documentElement.style.backgroundColor = html;
      document.body.style.backgroundColor = corps;
    };
  }, []);

  /** Déconnecte en expliquant pourquoi (accès refusé, désactivé, session terminée). */
  const sortir = useCallback((m: MessageConnexion) => {
    messageSortie.current = m;
    signOut(auth).catch(() => {
      // Presque impossible (rien à joindre sur le réseau) : on montre quand même la connexion.
      messageSortie.current = null;
      dansEspace.current = false;
      marquerSessionOuverte(false);
      setMessage(m);
      setEtat({ type: 'deconnecte' });
    });
  }, []);

  /**
   * Firebase refuse le jeton du compte `uid`. Compte désactivé ou session
   * révoquée : on explique et on revient à la connexion. Renvoie false si
   * l'échec est d'un autre genre (réseau…), à traiter par l'appelant.
   */
  const refusDeFirebase = useCallback((e: unknown, uid: string): boolean => {
    const genre = classerErreurVerification(codeErreur(e));
    if (genre !== 'desactive' && genre !== 'session') return false;
    const actuel = auth.currentUser;
    // Un autre compte s'est connecté entre-temps : ce refus ne le concerne pas.
    if (actuel && actuel.uid !== uid) return true;
    const m: MessageConnexion = { ton: 'erreur', texte: genre === 'desactive' ? MESSAGE_ACCES_DESACTIVE : MESSAGE_SESSION_TERMINEE };
    raisonRecente.current = { message: m, le: Date.now() };
    if (actuel) {
      sortir(m);
    } else {
      // Firebase a déjà déconnecté (avant même de nous rendre l'erreur) : l'écran de
      // connexion est peut-être affiché avec un message plus vague, on le précise.
      dansEspace.current = false;
      marquerSessionOuverte(false);
      setMessage(m);
      setEtat({ type: 'deconnecte' });
    }
    return true;
  }, [sortir]);

  const verifier = useCallback(async (u: User) => {
    const n = ++tour.current;
    setEtat({ type: 'verification', depuisFormulaire: etatRef.current.type === 'deconnecte' });

    let jeton: IdTokenResult | null = null;
    let horsLigne = false;
    try {
      // Jeton neuf : il porte le badge « staff » posé par le serveur, et Firebase
      // refuse ici un compte désactivé ou dont le mot de passe a changé.
      jeton = await u.getIdTokenResult(true);
    } catch (e) {
      // Pas de contrôle du numéro de tour ici : Firebase a pu déconnecter (et donc
      // changer de tour) avant de rendre l'erreur, et l'explication doit s'afficher.
      if (refusDeFirebase(e, u.uid)) return;
      if (classerErreurVerification(codeErreur(e)) === 'reseau') {
        // Sans réseau, le dernier jeton connu (s'il est encore valable) suffit pour
        // ouvrir l'espace : la liste des commandes dira elle-même « hors ligne ».
        try { jeton = await u.getIdTokenResult(false); } catch { horsLigne = true; }
      } else {
        horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
      }
    }
    if (n !== tour.current) return; // un autre changement de session est arrivé entre-temps

    if (!jeton) { setEtat({ type: 'bloque', horsLigne }); return; }
    const role = roleDepuisJeton(u.email, jeton.claims);
    if (!role) {
      if (reactionSansAcces(u.email) === 'deconnecter') { sortir({ ton: 'erreur', texte: MESSAGE_SANS_ACCES }); return; }
      // La session de l'équipe (s'il y en avait une) a été remplacée par ce compte :
      // sa fin, plus tard, n'appellera pas d'explication sur l'espace équipe.
      dansEspace.current = false;
      marquerSessionOuverte(false);
      setMessage(null);
      setEtat({ type: 'autre_compte', email: u.email ?? '' });
      return;
    }
    dansEspace.current = true;
    if (role === 'staff') marquerSessionOuverte(true);
    setMessage(null);
    setEtat({ type: 'autorise', role, email: u.email ?? '', uid: u.uid });
  }, [refusDeFirebase, sortir]);

  // Session : relue au chargement, puis suivie (connexion, déconnexion, autre onglet).
  useEffect(() => {
    const arreter = onAuthStateChanged(auth, u => {
      if (u) { void verifier(u); return; }
      tour.current++; // une vérification en cours n'a plus d'objet
      const r = raisonRecente.current;
      const raison = r && Date.now() - r.le < VALIDITE_RAISON_MS ? r.message : null;
      const vague = dansEspace.current || sessionEtaitOuverte()
        ? { ton: 'info' as const, texte: MESSAGE_DECONNECTE_AILLEURS }
        : null;
      const m = messageSortie.current ?? raison ?? vague;
      messageSortie.current = null;
      raisonRecente.current = null;
      dansEspace.current = false;
      marquerSessionOuverte(false);
      setMessage(m);
      setEtat({ type: 'deconnecte' });
    });
    return () => arreter();
  }, [verifier]);

  const uidAutorise = etat.type === 'autorise' ? etat.uid : null;

  // Espace ouvert : à chaque nouveau jeton de CE compte (renouvellement horaire,
  // contrôles ci-dessous), on revérifie le badge ; retiré, l'espace se ferme.
  // Le jeton d'un autre compte (connexion dans un autre onglet) ne se traite pas
  // ici : onAuthStateChanged s'en charge, sans rien déconnecter d'office.
  useEffect(() => {
    if (!uidAutorise) return;
    const arreter = onIdTokenChanged(auth, u => {
      if (!u || u.uid !== uidAutorise) return;
      u.getIdTokenResult()
        .then(r => {
          if (auth.currentUser?.uid === uidAutorise && !roleDepuisJeton(u.email, r.claims)) sortir({ ton: 'erreur', texte: MESSAGE_SANS_ACCES });
        })
        .catch(() => { /* hors ligne : l'espace reste ouvert, le voyant dit « hors ligne » */ });
    });
    return () => arreter();
  }, [uidAutorise, sortir]);

  // Contrôle de la session : toutes les 3 minutes (page visible), au retour sur
  // la page, au retour du réseau, et tout de suite quand une route refuse
  // (401/403). Un jeton neuf est demandé à Firebase, qui le refuse si le patron a
  // changé le mot de passe ou désactivé l'accès : l'espace se ferme alors.
  useEffect(() => {
    if (!uidAutorise) return;
    let dernier = Date.now();
    let enCours = false;
    const controler = async (force: boolean) => {
      if (enCours || (!force && Date.now() - dernier < ECART_MIN_CONTROLE_MS)) return;
      const u = auth.currentUser;
      if (!u || u.uid !== uidAutorise) return;
      enCours = true;
      dernier = Date.now();
      try {
        const r = await u.getIdTokenResult(true);
        if (auth.currentUser?.uid === uidAutorise && !roleDepuisJeton(u.email, r.claims)) sortir({ ton: 'erreur', texte: MESSAGE_SANS_ACCES });
      } catch (e) {
        // Réseau ou autre : l'espace reste ouvert, on réessaiera au prochain contrôle.
        refusDeFirebase(e, uidAutorise);
      } finally {
        enCours = false;
      }
    };
    const regulier = window.setInterval(() => {
      if (document.visibilityState === 'visible') void controler(false);
    }, INTERVALLE_CONTROLE_MS);
    const auRetour = () => { if (document.visibilityState === 'visible') void controler(false); };
    const auRefus = () => { void controler(true); };
    document.addEventListener('visibilitychange', auRetour);
    window.addEventListener('focus', auRetour);
    window.addEventListener('online', auRetour);
    window.addEventListener(EVENEMENT_ACCES_REFUSE, auRefus);
    return () => {
      window.clearInterval(regulier);
      document.removeEventListener('visibilitychange', auRetour);
      window.removeEventListener('focus', auRetour);
      window.removeEventListener('online', auRetour);
      window.removeEventListener(EVENEMENT_ACCES_REFUSE, auRefus);
    };
  }, [uidAutorise, refusDeFirebase, sortir]);

  const reverifier = useCallback(() => {
    const u = auth.currentUser;
    if (u) void verifier(u);
    else setEtat({ type: 'deconnecte' });
  }, [verifier]);

  // Vérification impossible faute de réseau : on réessaie dès son retour.
  const bloque = etat.type === 'bloque';
  useEffect(() => {
    if (!bloque) return;
    window.addEventListener('online', reverifier);
    return () => window.removeEventListener('online', reverifier);
  }, [bloque, reverifier]);

  /** Déconnexion demandée ; rejette si elle a échoué (l'écran le dit et laisse réessayer). */
  const seDeconnecter = useCallback(async (m: MessageConnexion = MESSAGE_AU_REVOIR) => {
    messageSortie.current = m;
    try {
      await signOut(auth);
      marquerSessionOuverte(false);
    } catch (e) {
      messageSortie.current = null;
      throw e;
    }
  }, []);
  const seDeconnecterSimplement = useCallback(() => seDeconnecter(), [seDeconnecter]);
  const deconnecterAutreCompte = useCallback(() => seDeconnecter(MESSAGE_AUTRE_COMPTE_SORTI), [seDeconnecter]);

  const effacerMessage = useCallback(() => setMessage(null), []);

  if (etat.type === 'chargement') return <EcranAttente texte="Chargement…" />;

  // Session retrouvée à l'ouverture : écran d'attente. Juste après avoir tapé ses
  // identifiants : le formulaire reste affiché, son bouton dit « Vérification… ».
  if (etat.type === 'verification' && !etat.depuisFormulaire) return <EcranAttente texte="Vérification de l'accès…" />;

  if (etat.type === 'deconnecte' || etat.type === 'verification') {
    return (
      <Connexion
        auth={auth}
        message={message}
        onEffacerMessage={effacerMessage}
        verification={etat.type === 'verification'}
      />
    );
  }

  if (etat.type === 'bloque') {
    return (
      <EcranVerificationImpossible
        horsLigne={etat.horsLigne}
        onReessayer={reverifier}
        onDeconnexion={seDeconnecterSimplement}
      />
    );
  }

  if (etat.type === 'autre_compte') {
    return <EcranAutreCompte email={etat.email} onDeconnexion={deconnecterAutreCompte} />;
  }

  return (
    <EspaceEquipe
      key={etat.uid}
      db={db}
      email={etat.email}
      compte={compteAffiche(etat.role, etat.email)}
      onDeconnexion={seDeconnecterSimplement}
    />
  );
}
