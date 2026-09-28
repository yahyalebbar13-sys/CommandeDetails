// ─── Accès de l'équipe : créé, modifié, désactivé par l'administrateur ───────
// Réservée à l'administrateur (verifyAdmin) : l'équipe elle-même n'y a jamais accès.
//
// L'équipe partage UN compte Firebase Auth, dont l'e-mail est fabriqué à partir
// du nom d'utilisateur (cf. lib/acces-equipe.ts). Le mot de passe est tapé par
// l'administrateur à l'écran « Accès équipe » : il passe par cette route vers
// Firebase Auth, qui seul le garde ; il n'est jamais écrit dans la base, jamais
// renvoyé, jamais journalisé.
//
// shop_meta/acces_equipe (fermé aux navigateurs) désigne le compte en service :
//   { uid, identifiant, desactive, valideApres (secondes), creeLe, majLe, adminUid }
// verifyEquipe (lib/require-equipe.ts) et les règles Firestore s'y fient.
//
// GET  → { configure, identifiant?, desactive?, creeLe?, majLe?, derniereConnexion?, anomalie? }
// POST { identifiant, motDePasse?, desactive? } → { ok: true, ...même forme } ou { error } (400/409/500)
//   - pas encore d'accès : création (mot de passe obligatoire) ;
//   - accès existant : nouveau nom, nouveau mot de passe, désactivation/réactivation.
//     Nouveau mot de passe ou désactivation → les sessions ouvertes sont
//     révoquées : les actions de l'équipe sont refusées tout de suite (routes),
//     la liste des commandes aussi (règles Firestore, une fois déployées), et
//     chaque téléphone revient à l'écran de connexion en quelques minutes
//     (l'espace /staff revérifie sa session régulièrement).
// `anomalie` (ajout au contrat) : le compte Firebase ne correspond plus au
// document — 'email_modifie' (adresse changée depuis un navigateur : le compte
// est un compte Firebase ordinaire) ou 'nom_a_enregistrer' (un renommage n'a
// pas été enregistré jusqu'au bout). L'équipe est bloquée tant que le patron
// n'a pas enregistré à nouveau.

import { NextResponse } from 'next/server';
import { getAuth, type Auth, type UpdateRequest, type UserRecord } from 'firebase-admin/auth';
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/require-admin';
import { appAdmin, dbAdmin } from '@/lib/firebase-admin-serveur';
import { CHEMIN_ACCES_EQUIPE, oublierAccesEquipeEnCache } from '@/lib/require-equipe';
import {
  emailEquipe,
  identifiantDeEmail,
  identifiantValide,
  motDePasseAcceptable,
  normaliserIdentifiant,
  problemeIdentifiant,
  REGLE_IDENTIFIANT,
} from '@/lib/acces-equipe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
const NOM_AFFICHE = 'Équipe LEBTEX';
// « déjà pris » : l'écran « Accès équipe » reconnaît ce refus à ces mots.
// Le compte qui l'occupe a pu être ouvert par n'importe qui depuis l'inscription
// de la boutique (le domaine est public) : on ne lui donne jamais les droits de
// l'équipe, et seul le patron peut le supprimer, depuis la console Firebase.
const DEJA_PRIS =
  "Ce nom d'utilisateur est déjà pris par un autre compte. Choisissez-en un autre. "
  + "(Si ce compte n'est pas le vôtre, il peut être supprimé dans la console Firebase, rubrique Authentication.)";
const COMPTE_MODIFIE =
  "Le compte de l'équipe a été modifié depuis un navigateur (adresse de connexion changée). "
  + 'Pour le remettre en ordre, choisissez un nouveau mot de passe et enregistrez.';

type Anomalie = 'email_modifie' | 'nom_a_enregistrer';

type EtatAcces = {
  configure: boolean;
  identifiant?: string;
  desactive?: boolean;
  creeLe?: string;
  majLe?: string;
  derniereConnexion?: string | null;
  anomalie?: Anomalie;
};

const erreur = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers: PAS_DE_CACHE });

const reponse = (corps: EtatAcces | (EtatAcces & { ok: true })) =>
  NextResponse.json(corps, { headers: PAS_DE_CACHE });

/** Date Firestore (ou texte de date) → ISO ; rien si illisible. */
function isoDe(v: unknown): string | undefined {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return new Date(v).toISOString();
  return undefined;
}

/** Secondes depuis une date Firebase Auth (« Sat, 27 Sep 2026 10:00:00 GMT ») ; null si absente. */
function secondesDe(dateUtc: string | undefined | null): number | null {
  const ms = dateUtc ? Date.parse(dateUtc) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Le compte Firebase, ou null s'il a été supprimé (depuis la console, par exemple). */
async function compteOuNull(auth: Auth, uid: string): Promise<UserRecord | null> {
  try {
    return await auth.getUser(uid);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

function etatDe(data: FirebaseFirestore.DocumentData, compte: UserRecord): EtatAcces {
  // Le nom affiché est celui que la connexion utilise vraiment (l'adresse du
  // compte Firebase), le document ne venant qu'ensuite : si un renommage s'est
  // arrêté en route, le patron voit le nom que l'équipe doit taper, et
  // « Désactiver » (qui renvoie ce nom) ne remet pas l'ancien en place.
  const duCompte = identifiantDeEmail(compte.email || '');
  const duDocument = typeof data.identifiant === 'string' && identifiantValide(data.identifiant) ? data.identifiant : null;
  const identifiant = duCompte ?? duDocument ?? undefined;
  const anomalie: Anomalie | undefined = duCompte === null
    ? 'email_modifie'
    : duDocument !== duCompte ? 'nom_a_enregistrer' : undefined;
  const derniere = compte.metadata?.lastSignInTime;
  return {
    configure: true,
    identifiant,
    ...(anomalie ? { anomalie } : {}),
    // Même lecture que verifyEquipe : seul `false` ouvre l'accès.
    desactive: data.desactive !== false || compte.disabled === true,
    creeLe: isoDe(data.creeLe),
    majLe: isoDe(data.majLe),
    derniereConnexion: derniere && Number.isFinite(Date.parse(derniere)) ? new Date(derniere).toISOString() : null,
  };
}

/** Erreurs Firebase → phrase compréhensible, sans détail interne. */
function traduire(err: any): { status: number; message: string } {
  const code = String(err?.code || '');
  const brut = String(err?.message || '');
  if (code === 'auth/email-already-exists') return { status: 409, message: DEJA_PRIS };
  if (code === 'auth/invalid-password') {
    return { status: 400, message: 'Mot de passe refusé : choisissez-en un plus long.' };
  }
  if (/PASSWORD_DOES_NOT_MEET_REQUIREMENTS/i.test(brut) || code === 'auth/password-does-not-meet-requirements') {
    return {
      status: 400,
      message: 'Mot de passe refusé par Firebase : il faut sans doute une majuscule, un chiffre ou un symbole en plus. Choisissez-en un plus solide.',
    };
  }
  if (code === 'auth/invalid-email') {
    return { status: 400, message: `Nom d'utilisateur refusé, choisissez-en un autre. Règle : ${REGLE_IDENTIFIANT}` };
  }
  if (code === 'auth/user-not-found') {
    return { status: 409, message: "Le compte de l'équipe vient d'être supprimé. Rechargez la page, puis créez l'accès à nouveau." };
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return { status: 500, message: 'Trop de demandes pour le moment. Réessayez dans quelques minutes.' };
  }
  return { status: 500, message: "L'accès de l'équipe n'a pas pu être enregistré. Réessayez dans un instant." };
}

export async function GET(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  try {
    const snap = await dbAdmin().doc(CHEMIN_ACCES_EQUIPE).get();
    const data = snap.data();
    const uid = typeof data?.uid === 'string' && data.uid ? data.uid : null;
    if (!data || !uid) return reponse({ configure: false });
    const compte = await compteOuNull(getAuth(appAdmin()), uid);
    // Compte supprimé entre-temps : il faut recréer l'accès (avec un mot de passe).
    if (!compte) return reponse({ configure: false });
    return reponse(etatDe(data, compte));
  } catch (err: any) {
    console.error('[admin/acces-equipe GET]', err?.code || err?.message || 'erreur');
    return erreur(500, "L'accès de l'équipe n'a pas pu être lu. Réessayez dans un instant.");
  }
}

export async function POST(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;

  // Le corps contient le mot de passe : il n'est jamais journalisé, même en cas d'erreur.
  let corps: any;
  try { corps = await req.json(); } catch { return erreur(400, 'Requête illisible'); }

  const identifiant = normaliserIdentifiant(corps?.identifiant);
  const probleme = problemeIdentifiant(identifiant);
  if (probleme) return erreur(400, probleme);

  const brut = corps?.motDePasse;
  if (brut !== undefined && brut !== null && typeof brut !== 'string') return erreur(400, 'Mot de passe illisible');
  // Champ laissé vide à la modification : on garde le mot de passe actuel.
  const motDePasse = typeof brut === 'string' && brut !== '' ? brut : null;
  if (motDePasse) {
    const raison = motDePasseAcceptable(motDePasse, identifiant);
    if (raison) return erreur(400, raison);
  }

  const d = corps?.desactive;
  if (d !== undefined && d !== null && typeof d !== 'boolean') return erreur(400, 'Valeur « désactivé » illisible');
  const desactive: boolean | undefined = typeof d === 'boolean' ? d : undefined;

  try {
    const auth = getAuth(appAdmin());
    const ref = dbAdmin().doc(CHEMIN_ACCES_EQUIPE);
    const snap = await ref.get();
    const data = snap.data();
    const uidEnregistre = typeof data?.uid === 'string' && data.uid ? data.uid : null;
    const compte = uidEnregistre ? await compteOuNull(auth, uidEnregistre) : null;

    const resultat = compte && data
      ? await modifier(auth, ref, data, compte, { identifiant, motDePasse, desactive, adminUid: check.uid })
      : await creer(auth, ref, uidEnregistre, { identifiant, motDePasse, desactive, adminUid: check.uid });
    // Vide la copie de CETTE fonction serveur seulement. L'effet immédiat vient
    // d'ailleurs : les écritures de l'équipe relisent toujours l'accès (cf. require-equipe.ts).
    oublierAccesEquipeEnCache();
    return resultat;
  } catch (err: any) {
    // Le code seul : jamais le corps de la requête (mot de passe).
    console.error('[admin/acces-equipe POST]', err?.code || err?.message || 'erreur');
    oublierAccesEquipeEnCache();
    const t = traduire(err);
    return erreur(t.status, t.message);
  }
}

type Demande = { identifiant: string; motDePasse: string | null; desactive: boolean | undefined; adminUid: string };

/** Claims que verifyEquipe et les règles Firestore exigent ; seul firebase-admin peut les poser. */
const claimsEquipe = (adminUid: string) => ({ staff: true, adminUid });

async function creer(
  auth: Auth,
  ref: DocumentReference,
  uidEnregistre: string | null,
  { identifiant, motDePasse, desactive, adminUid }: Demande,
): Promise<NextResponse> {
  if (!motDePasse) return erreur(400, "Choisissez un mot de passe pour créer l'accès de l'équipe.");

  let compte: UserRecord;
  try {
    compte = await auth.createUser({
      email: emailEquipe(identifiant),
      password: motDePasse,
      displayName: NOM_AFFICHE,
      emailVerified: false,
      disabled: desactive === true,
    });
  } catch (err: any) {
    // Un compte existe déjà avec cet e-mail : quelqu'un a pu l'ouvrir avant nous
    // (inscription sur la boutique). Lui donner les droits de l'équipe lui
    // ouvrirait les commandes : on ne le touche pas.
    if (err?.code === 'auth/email-already-exists') return erreur(409, DEJA_PRIS);
    throw err;
  }

  const maintenant = Timestamp.now();
  try {
    await auth.setCustomUserClaims(compte.uid, claimsEquipe(adminUid));
    // Heure de Firebase de préférence : c'est elle qui date les connexions (auth_time).
    const valideApres = secondesDe(compte.tokensValidAfterTime) ?? maintenant.seconds;
    // Transaction : si l'accès a changé depuis notre lecture (deuxième onglet),
    // on n'écrase pas l'accès que l'autre vient de créer.
    const ecrit = await ref.firestore.runTransaction(async tx => {
      const s = await tx.get(ref);
      const uidActuel = typeof s.data()?.uid === 'string' && s.data()!.uid ? s.data()!.uid : null;
      if (uidActuel !== uidEnregistre) return false;
      tx.set(ref, {
        uid: compte.uid,
        identifiant,
        desactive: desactive === true,
        valideApres,
        creeLe: maintenant,
        majLe: maintenant,
        adminUid,
      });
      return true;
    });
    if (!ecrit) {
      await auth.deleteUser(compte.uid).catch(() => {});
      return erreur(409, "L'accès de l'équipe vient d'être modifié sur un autre écran. Rechargez la page.");
    }
  } catch (err) {
    // Sans document, ce compte ne servirait à rien et bloquerait l'identifiant.
    await auth.deleteUser(compte.uid).catch(() => {});
    throw err;
  }

  return reponse({
    ok: true,
    configure: true,
    identifiant,
    desactive: desactive === true,
    creeLe: maintenant.toDate().toISOString(),
    majLe: maintenant.toDate().toISOString(),
    derniereConnexion: null,
  });
}

async function modifier(
  auth: Auth,
  ref: DocumentReference,
  data: FirebaseFirestore.DocumentData,
  compte: UserRecord,
  { identifiant, motDePasse, desactive, adminUid }: Demande,
): Promise<NextResponse> {
  // Rien de précisé : on garde l'état enregistré (et on aligne Firebase dessus).
  const desactiveFinal = desactive ?? (data.desactive !== false || compte.disabled === true);

  // Adresse du compte changée depuis un navigateur (hors de equipe.lebtex.ma) :
  // celui qui l'a fait a pu changer aussi le mot de passe. Remettre l'adresse
  // sans nouveau mot de passe lui rendrait l'accès : on l'exige (sauf pour
  // désactiver, qui protège), et toutes les sessions sont révoquées plus bas.
  const emailModifie = identifiantDeEmail(compte.email || '') === null;
  if (emailModifie && !motDePasse && desactive !== true) return erreur(400, COMPTE_MODIFIE);
  // Désactiver sans nouveau mot de passe : l'adresse trafiquée reste en place.
  // La remettre effacerait l'avertissement, et « Réactiver » rouvrirait le
  // compte avec le mot de passe qu'a peut-être choisi celui qui l'a trafiqué.
  // Elle ne sert à rien tant que le compte est désactivé, et le prochain
  // enregistrement avec un nouveau mot de passe la remet d'aplomb.
  const garderAdresseTrafiquee = emailModifie && !motDePasse;

  const changements: UpdateRequest = {};
  const emailVoulu = emailEquipe(identifiant);
  if (!garderAdresseTrafiquee && (compte.email || '').toLowerCase() !== emailVoulu) changements.email = emailVoulu;
  if (motDePasse) changements.password = motDePasse;
  if (compte.disabled !== desactiveFinal) changements.disabled = desactiveFinal;

  if (Object.keys(changements).length) {
    try {
      await auth.updateUser(compte.uid, changements);
    } catch (err: any) {
      // Même prudence qu'à la création : le nom appartient déjà à un autre compte.
      if (err?.code === 'auth/email-already-exists') return erreur(409, DEJA_PRIS);
      throw err;
    }
  }
  // Remis à chaque enregistrement : un compte dont les claims auraient été
  // effacés (console, autre outil) retrouve l'accès prévu, et rien d'autre.
  await auth.setCustomUserClaims(compte.uid, claimsEquipe(adminUid));

  const maintenant = Timestamp.now();
  // `valideApres` illisible (document abîmé) : on le réécrit, en révoquant aussi,
  // pour que les téléphones reviennent proprement à la connexion au lieu de
  // rester dans un espace où plus rien ne passe.
  const aReparer = !Number.isFinite(Number(data.valideApres));
  let valideApres: number | null = null;
  // Nouveau mot de passe, désactivation ou compte trafiqué : on révoque toutes les sessions ouvertes.
  if (motDePasse || desactive === true || emailModifie || aReparer) {
    await auth.revokeRefreshTokens(compte.uid);
    const apres = await compteOuNull(auth, compte.uid);
    valideApres = secondesDe(apres?.tokensValidAfterTime) ?? maintenant.seconds;
  }

  await ref.set({
    uid: compte.uid,
    identifiant,
    desactive: desactiveFinal,
    ...(valideApres !== null ? { valideApres } : {}),
    majLe: maintenant,
    adminUid,
  }, { merge: true });

  const derniere = compte.metadata?.lastSignInTime;
  return reponse({
    ok: true,
    configure: true,
    identifiant,
    // Toujours à remettre en ordre (nouveau mot de passe) : l'écran garde son avertissement.
    ...(garderAdresseTrafiquee ? { anomalie: 'email_modifie' as const } : {}),
    desactive: desactiveFinal,
    creeLe: isoDe(data.creeLe),
    majLe: maintenant.toDate().toISOString(),
    derniereConnexion: derniere && Number.isFinite(Date.parse(derniere)) ? new Date(derniere).toISOString() : null,
  });
}
