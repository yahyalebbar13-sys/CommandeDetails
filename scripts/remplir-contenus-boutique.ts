// ─── Remplit les fiches de la boutique : informations manquantes (FR) et arabe ──
// Lit un fichier de contenus relus ({ produits: [{ id, frAjouts, ar, variantesModelAr }],
// categories: [{ slug, nameAr, descriptionAr }] }) et l'écrit dans Firestore :
//   - FR : seulement les champs vides sur le site, dans la surcharge (shop_product_overrides)
//     si elle existe — c'est là que l'admin écrit —, sinon dans la fiche (shop_custom_products) ;
//   - arabe (…Ar) : dans la fiche shop_custom_products (l'admin ne la réécrit jamais) ; une
//     valeur arabe déjà présente n'est remplacée que si le contenu relu la corrige ;
//   - modelAr des variantes : dans le document qui porte les variantes affichées, en
//     gardant tous leurs autres champs ;
//   - catégories : nameAr / descriptionAr sur les fiches personnalisées, et dans
//     shop_category_overrides pour les rayons d'origine.
// Avant toute chose, les 4 collections sont sauvegardées dans --sauvegarde=<dossier>.
//
//   npx tsx scripts/remplir-contenus-boutique.ts --contenus=<fichier.json> --sauvegarde=<dossier>            # simulation
//   npx tsx scripts/remplir-contenus-boutique.ts --contenus=<fichier.json> --sauvegarde=<dossier> --ecrire   # écrit

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { SHOP_CATEGORIES } from '../src/lib/shop-products-data';

const ECRIRE = process.argv.includes('--ecrire');
const arg = (nom: string) => process.argv.find(a => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);

type Contenus = {
  produits: { id: string; frAjouts?: Record<string, string>; ar?: Record<string, string>; variantesModelAr?: Record<string, string> }[];
  categories: { slug: string; nameAr: string; descriptionAr: string }[];
};

const plein = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const COLLECTIONS = ['shop_custom_products', 'shop_product_overrides', 'shop_custom_categories', 'shop_category_overrides'];

async function main() {
  const fichier = arg('contenus');
  const dossier = arg('sauvegarde');
  if (!fichier || !dossier) throw new Error('--contenus=<fichier> et --sauvegarde=<dossier> sont obligatoires');
  const contenus: Contenus = JSON.parse(readFileSync(fichier, 'utf8'));

  initializeApp({ credential: cert(JSON.parse(readFileSync('service-account.json', 'utf8'))) });
  const db = getFirestore();

  // 1. Sauvegarde complète avant toute écriture
  mkdirSync(dossier, { recursive: true });
  const sauvegarde: Record<string, Record<string, unknown>> = {};
  for (const col of COLLECTIONS) {
    sauvegarde[col] = Object.fromEntries((await db.collection(col).get()).docs.map(d => [d.id, d.data()]));
  }
  const cheminSauvegarde = join(dossier, 'sauvegarde-boutique.json');
  writeFileSync(cheminSauvegarde, JSON.stringify(sauvegarde, null, 1));
  console.log(`Sauvegarde : ${cheminSauvegarde}`);
  console.log(`${ECRIRE ? 'ÉCRITURE' : 'SIMULATION (rien n’est écrit)'}\n`);

  const ecritures: { ref: DocumentReference; donnees: Record<string, unknown> }[] = [];
  const ajouter = (ref: DocumentReference, donnees: Record<string, unknown>) => {
    if (Object.keys(donnees).length) ecritures.push({ ref, donnees });
  };
  let nbFr = 0, nbAr = 0, nbArCorriges = 0, nbModeles = 0;

  // 2. Produits
  for (const c of contenus.produits) {
    const fiche = sauvegarde.shop_custom_products[c.id] as Record<string, any> | undefined;
    const surcharge = sauvegarde.shop_product_overrides[c.id] as Record<string, any> | undefined;
    if (!fiche) {
      console.log(`⚠ ${c.id} : fiche introuvable, ignorée`);
      continue;
    }
    const effectif = (champ: string) => (plein(surcharge?.[champ]) ? surcharge![champ] : fiche[champ]);
    const refFiche = db.doc(`shop_custom_products/${c.id}`);
    const refSurcharge = db.doc(`shop_product_overrides/${c.id}`);

    const fr: Record<string, string> = {};
    for (const [champ, valeur] of Object.entries(c.frAjouts || {})) {
      if (champ.endsWith('Ar') || !plein(valeur) || plein(effectif(champ))) continue;
      fr[champ] = valeur.trim();
    }
    const ar: Record<string, string> = {};
    for (const [champ, valeur] of Object.entries(c.ar || {})) {
      if (!champ.endsWith('Ar') || !plein(valeur)) continue;
      if (plein(surcharge?.[champ])) continue; // saisi dans l'admin : on n'y touche pas
      const actuel = fiche[champ];
      if (plein(actuel) && actuel.trim() === valeur.trim()) continue;
      if (plein(actuel)) {
        nbArCorriges++;
        console.log(`  ~ ${c.id}.${champ} corrigé : « ${actuel.slice(0, 60)} » → « ${valeur.slice(0, 60)} »`);
      }
      ar[champ] = valeur.trim();
    }
    nbFr += Object.keys(fr).length;
    nbAr += Object.keys(ar).length;
    ajouter(surcharge ? refSurcharge : refFiche, fr);
    ajouter(refFiche, ar);

    const modeles = Object.entries(c.variantesModelAr || {}).filter(([, v]) => plein(v));
    if (modeles.length) {
      const surSurcharge = Array.isArray(surcharge?.variants) && surcharge!.variants.length > 0;
      const variants: any[] = (surSurcharge ? surcharge!.variants : fiche.variants) || [];
      let change = false;
      const suite = variants.map(v => {
        const modelAr = modeles.find(([id]) => id === v.id)?.[1];
        if (!modelAr || v.modelAr === modelAr) return v;
        change = true;
        nbModeles++;
        return { ...v, modelAr };
      });
      if (change) ajouter(surSurcharge ? refSurcharge : refFiche, { variants: suite });
    }
    const resume = [Object.keys(fr).length && `FR ${Object.keys(fr).join(', ')}`, Object.keys(ar).length && `AR ${Object.keys(ar).length} champ(s)`, modeles.length && `modelAr ${modeles.length}`].filter(Boolean);
    console.log(`• ${String(fiche.name).slice(0, 50).padEnd(50)} ${resume.join(' · ') || 'rien à écrire'}`);
  }

  // 3. Catégories
  const slugsOrigine = new Set(SHOP_CATEGORIES.map(c => c.slug));
  let nbCategories = 0;
  for (const cat of contenus.categories) {
    if (!plein(cat.nameAr)) continue;
    const donnees = { nameAr: cat.nameAr.trim(), ...(plein(cat.descriptionAr) && { descriptionAr: cat.descriptionAr.trim() }) };
    for (const [id, doc] of Object.entries(sauvegarde.shop_custom_categories) as [string, any][]) {
      if (doc.slug === cat.slug) ajouter(db.doc(`shop_custom_categories/${id}`), donnees);
    }
    if (slugsOrigine.has(cat.slug)) ecritures.push({ ref: db.doc(`shop_category_overrides/${cat.slug}`), donnees: { ...donnees, __merge: true } });
    nbCategories++;
    console.log(`• rayon ${cat.slug} → ${cat.nameAr}`);
  }

  console.log(`\nÀ écrire : ${nbFr} champ(s) FR, ${nbAr} champ(s) arabes (dont ${nbArCorriges} corrections), ${nbModeles} modèle(s) de variante, ${nbCategories} rayon(s) — ${ecritures.length} document(s).`);
  if (!ECRIRE) return;

  // 4. Écriture par lots (update échoue si le document a disparu entre-temps : rien n'est créé par erreur)
  for (let i = 0; i < ecritures.length; i += 400) {
    const lot = db.batch();
    for (const { ref, donnees } of ecritures.slice(i, i + 400)) {
      const { __merge, ...champs } = donnees as Record<string, unknown> & { __merge?: boolean };
      if (__merge) lot.set(ref, champs, { merge: true });
      else lot.update(ref, champs);
    }
    await lot.commit();
  }
  console.log('✅ Écrit. Pour revenir en arrière : la sauvegarde ci-dessus contient les 4 collections d’avant.');
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e?.message || e); process.exit(1); });
