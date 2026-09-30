// ─── Coût de vente, pour l'espace équipe (/staff) ────────────────────────────
// Lecture seule, gardée par verifyEquipe : le compte de l'équipe et
// l'administrateur (choix du patron, 30/09/2026 : l'équipe voit le coût de vente).
//
// Le calcul est fait ICI, avec celui de la page « Coût Vente » de /gestion
// (lib/cout-de-vente) : le navigateur de l'équipe ne reçoit que le résultat,
// jamais les articles, les factures ni les prix d'achat du fournisseur.
//
// Comme dans /gestion, un dossier n'est montré que validé (les 4 vérifications
// cochées) ET avec une déclaration provisoire complète (un PU sur chaque ligne,
// dpComplete) : sinon les chiffres seraient faux.
//
// GET                → { dossiers: [{ id, arrivalDate, supplierId, noBL }] }
// GET ?dossier=ID    → { facture: { id, arrivalDate, supplierId, noBL }, analysis, lockedVente }
//                      404 si le dossier n'existe pas ou n'est pas montrable.

import { NextResponse } from 'next/server';
import { verifyEquipe } from '@/lib/require-equipe';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { calculCoutDeVente, dpComplete, lignesCoutDeVente } from '@/lib/cout-de-vente';
import { isLocalMarketPurchaseArticle } from '@/lib/local-purchase';
import { estBrouillonMagasin } from '@/lib/demande-magasin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAS_DE_CACHE = { 'Cache-Control': 'no-store' };
/** Les 4 vérifications qui ouvrent un dossier au coût de vente (même règle que /gestion). */
const VERIFICATIONS = ['douane_ok', 'facture_mad_ok', 'nw_cbm_ok', 'dp_ok'];
const ID_VALIDE = /^[^/]{1,200}$/;

const erreur = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers: PAS_DE_CACHE });

/** Ce que l'écran et les PDF montrent d'un dossier : rien de plus. */
const enTete = (id: string, f: any) => ({
  id,
  arrivalDate: typeof f?.arrivalDate === 'string' ? f.arrivalDate : '',
  supplierId: typeof f?.supplierId === 'string' ? f.supplierId : '',
  noBL: typeof f?.noBL === 'string' ? f.noBL : '',
});

async function dossiersValides(adminUid: string): Promise<Set<string>> {
  const snap = await dbAdmin().collection(`users/${adminUid}/checklists`).get();
  const ids = new Set<string>();
  for (const d of snap.docs) {
    const checks = d.data()?.checks || {};
    if (VERIFICATIONS.every(k => checks[k] === true)) ids.add(d.id);
  }
  return ids;
}

/** Les articles du dossier, les mêmes que /gestion : ni achats du marché local, ni brouillons de magasin. */
async function articlesDu(base: string, dossier: string): Promise<any[]> {
  const snap = await dbAdmin().collection(`${base}/articles`).where('factureId', '==', dossier).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as any)
    .filter(a => !isLocalMarketPurchaseArticle(a) && !estBrouillonMagasin(a));
}

export async function GET(req: Request) {
  const check = await verifyEquipe(req);
  if (!check.ok) return check.response;
  const base = `users/${check.adminUid}`;
  const dossier = new URL(req.url).searchParams.get('dossier')?.trim() || '';

  try {
    const db = dbAdmin();
    const [valides, catsSnap, polesSnap] = await Promise.all([
      dossiersValides(check.adminUid),
      db.collection(`${base}/categories`).get(),
      db.collection(`${base}/generalCategories`).get(),
    ]);
    const subCategories = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const generalCategories = polesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!dossier) {
      const [facturesSnap, dpsSnap] = await Promise.all([
        db.collection(`${base}/factures`).get(),
        db.collection(`${base}/dp_declarations`).get(),
      ]);
      const puMaps = new Map(dpsSnap.docs.map(d => [d.id, d.data()?.puMap || {}]));
      const candidats = facturesSnap.docs.filter(d => valides.has(d.id));
      const complets = await Promise.all(candidats.map(async d =>
        dpComplete(await articlesDu(base, d.id), subCategories, generalCategories, puMaps.get(d.id) || {})));
      const dossiers = candidats.filter((_, i) => complets[i]).map(d => enTete(d.id, d.data()));
      return NextResponse.json({ dossiers }, { headers: PAS_DE_CACHE });
    }

    const introuvable = () => erreur(404, 'Dossier introuvable, pas encore validé, ou déclaration provisoire incomplète.');
    if (!ID_VALIDE.test(dossier) || !valides.has(dossier)) return introuvable();
    const [factureSnap, articles, dpSnap] = await Promise.all([
      db.doc(`${base}/factures/${dossier}`).get(),
      articlesDu(base, dossier),
      db.doc(`${base}/dp_declarations/${dossier}`).get(),
    ]);
    if (!factureSnap.exists) return introuvable();

    const facture = factureSnap.data();
    const dp = dpSnap.data() || {};
    const puMap = dp.puMap || {};
    if (!dpComplete(articles, subCategories, generalCategories, puMap)) return introuvable();

    const lignes = lignesCoutDeVente(articles, subCategories, generalCategories, puMap, dp.overrides || {});
    const analysis = calculCoutDeVente(facture, lignes, puMap);
    // La catégorie entière ne part pas : le PDF n'en lit que le code douanier.
    const rows = analysis.rows.map(r => ({ ...r, cat: r.cat ? { name: r.cat.name, hsCode: r.cat.hsCode ?? null } : null }));

    const lockedVente = dp.coutVenteLocked && dp.coutVenteLockedValue
      ? { value: Number(dp.coutVenteLockedValue), at: typeof dp.coutVenteLockedAt === 'string' ? dp.coutVenteLockedAt : '' }
      : null;

    return NextResponse.json(
      { facture: enTete(dossier, facture), analysis: { ...analysis, rows }, lockedVente },
      { headers: PAS_DE_CACHE },
    );
  } catch (err: any) {
    console.error('[equipe/cout-vente GET]', err?.code || err?.message || 'erreur');
    return erreur(500, "Le coût de vente n'a pas pu être lu. Réessayez dans un instant.");
  }
}
