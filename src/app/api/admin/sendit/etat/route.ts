// ─── Sendit : état du branchement (administrateur) ───────────────────────────
// Lecture seule, pour la carte « Sendit » de l'écran Réception & paiement :
// connexion (compte, échéance du jeton), villes de ramassage, statuts réels du
// compte, nombre de quartiers, et le dernier webhook reçu (pour régler la
// signature). Ne crée jamais rien chez Sendit.
//
// Jamais de clé ni de jeton dans la réponse : seulement « posée / pas posée ».
//
// GET            → état (la connexion gardée en mémoire sert si elle est encore bonne)
// GET ?tester=1  → se reconnecte à neuf (« Tester la connexion »)

import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/require-admin';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import {
  ErreurSendit,
  MESSAGE_NON_CONFIGURE,
  URL_WEBHOOK_SENDIT,
  compterQuartiers,
  idRamassage,
  senditConfigure,
  statutsOfficiels,
  testerConnexion,
  variablesSendit,
  villesRamassage,
} from '@/lib/sendit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };

/** Documents de diagnostic écrits par /api/webhooks/sendit (fermés aux navigateurs). */
const CHEMIN_DIAGNOSTIC_WEBHOOK = 'shop_meta/sendit_webhook';
const CHEMIN_REFUS_WEBHOOK = 'shop_meta/sendit_webhook_refus';

function isoDe(v: any): string | null {
  if (v && typeof v.toMillis === 'function') return new Date(v.toMillis()).toISOString();
  return null;
}

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Le dernier webhook accepté : forme, preuve, statut. Rien de personnel n'y est gardé. */
async function dernierWebhook() {
  const snap = await dbAdmin().doc(CHEMIN_DIAGNOSTIC_WEBHOOK).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const ev = d.evenement && typeof d.evenement === 'object' ? d.evenement : {};
  return {
    le: isoDe(d.dernierLe),
    nombre: Number.isFinite(Number(d.nombre)) ? Number(d.nombre) : 0,
    format: texte(d.format, 40),
    preuve: texte(d.preuve, 60),
    commandeTrouvee: d.commandeTrouvee === true,
    resultat: texte(d.resultat, 40),
    champs: Array.isArray(d.champs) ? d.champs.filter((c: unknown) => typeof c === 'string').slice(0, 20).map((c: string) => c.slice(0, 40)) : [],
    evenement: {
      event: texte(ev.event, 60),
      statut: texte(ev.statut, 40),
      ancienStatut: texte(ev.ancienStatut, 40),
      statutRetour: texte(ev.statutRetour, 40),
      lastActionAt: texte(ev.lastActionAt, 30),
    },
  };
}

/** Le dernier appel refusé (sans preuve valable) : forme de la signature, jeton présent. */
async function dernierRefus() {
  const snap = await dbAdmin().doc(CHEMIN_REFUS_WEBHOOK).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const forme = ['absente', 'hex', 'base64', 'autre'].includes(d.signature) ? d.signature as string : 'absente';
  return {
    le: isoDe(d.dernierLe),
    nombre: Number.isFinite(Number(d.nombre)) ? Number(d.nombre) : 0,
    signature: forme,
    jeton: d.jeton === true,
    signeeAvecClePublique: d.signeeAvecClePublique === true,
  };
}

export async function GET(req: Request) {
  const check = await verifyAdmin(req);
  if (!check.ok) return check.response;
  const tester = new URL(req.url).searchParams.get('tester') === '1';

  const illisible = (err: any) => {
    console.error('[admin/sendit/etat] diagnostic illisible :', err?.code || err?.message || 'erreur');
    return null;
  };
  const [dernier, refus] = await Promise.all([dernierWebhook().catch(illisible), dernierRefus().catch(illisible)]);
  const base = {
    variables: variablesSendit(),
    webhook: { url: URL_WEBHOOK_SENDIT, dernier, refus },
  };

  if (!senditConfigure()) {
    return NextResponse.json({ configure: false, message: MESSAGE_NON_CONFIGURE, ...base }, { headers: PAS_DE_CACHE });
  }

  let connexion: Awaited<ReturnType<typeof testerConnexion>>;
  try {
    connexion = await testerConnexion(tester);
  } catch (e) {
    const message = e instanceof ErreurSendit ? e.message : 'Connexion à Sendit impossible pour le moment.';
    return NextResponse.json({ configure: true, connecte: false, erreur: message, ...base }, { headers: PAS_DE_CACHE });
  }

  // Chaque lecture peut échouer seule : la carte montre ce qui a marché.
  const [villes, statuts, nombre, ramassage] = await Promise.allSettled([
    villesRamassage(),
    statutsOfficiels(),
    compterQuartiers(),
    idRamassage(),
  ]);
  const erreurs: string[] = [];
  const valeur = <T,>(r: PromiseSettledResult<T>, quoi: string): T | null => {
    if (r.status === 'fulfilled') return r.value;
    erreurs.push(`${quoi} : ${r.reason instanceof ErreurSendit ? r.reason.message : 'lecture impossible'}`);
    return null;
  };

  return NextResponse.json({
    configure: true,
    connecte: true,
    compte: connexion.compte,
    jetonExpireLe: connexion.expireLe,
    jetonGardeJusquA: connexion.gardeJusquA,
    villesRamassage: valeur(villes, 'Villes de ramassage') ?? [],
    ramassage: valeur(ramassage, 'Ville de ramassage'),
    statuts: valeur(statuts, 'Statuts') ?? [],
    nombreQuartiers: valeur(nombre, 'Quartiers'),
    erreurs,
    ...base,
  }, { headers: PAS_DE_CACHE });
}
