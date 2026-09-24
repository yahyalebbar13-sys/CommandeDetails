// ─── Enregistre les anciens designs de curseurs comme qualités ────────────────
// Même règle que le bouton « Anciens designs → qualités » de l'écran Groupes
// (cf. src/lib/designs-curseurs.ts) : pour chaque catégorie de curseurs, les
// designs de `categories/{id}/designs` absents de ses qualités (et de celles
// de son pôle) sont ajoutés à `sliderQualities`, sans doublon de référence ni
// de photo. Rien n'est supprimé ni modifié d'autre.
//
// Lancer (clé de service Firebase à la racine : service-account.json) :
//   npx tsx scripts/enregistrer-designs-curseurs.ts            # simulation : n'écrit rien
//   npx tsx scripts/enregistrer-designs-curseurs.ts --ecrire   # écrit pour de bon

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { designsAEnregistrer } from '../src/lib/designs-curseurs';
import { detectSpecType } from '../src/lib/quality-schema';
import { isSliderLineOrCategory } from '../src/lib/constants';

const ECRIRE = process.argv.includes('--ecrire');

async function main() {
  const cle = JSON.parse(readFileSync('service-account.json', 'utf8'));
  initializeApp({ credential: cert(cle) });
  const db = getFirestore();

  const config = await db.doc('publicConfig/adminConfig').get();
  const uid: string = config.data()?.adminUid;
  if (!uid) throw new Error('adminUid introuvable dans publicConfig/adminConfig');

  const poles = (await db.collection(`users/${uid}/generalCategories`).get()).docs.map(d => ({ id: d.id, ...d.data() } as any));
  const categories = (await db.collection(`users/${uid}/categories`).get()).docs.map(d => ({ id: d.id, ...d.data() } as any));

  const curseurs = categories.filter(c => {
    const pole = poles.find(p => p.id === c.generalCategoryId);
    return detectSpecType(pole) === 'slider' || isSliderLineOrCategory(c.name, pole);
  });

  console.log(`${ECRIRE ? 'ÉCRITURE' : 'SIMULATION (rien n’est écrit)'} — ${curseurs.length} catégorie(s) de curseurs sur ${categories.length}\n`);

  let total = 0;
  let touchees = 0;
  for (const c of curseurs) {
    const designs = (await db.collection(`users/${uid}/categories/${c.id}/designs`).get()).docs.map(d => ({ id: d.id, ...d.data() } as any));
    const pole = poles.find(p => p.id === c.generalCategoryId);
    const siennes: any[] = Array.isArray(c.sliderQualities) ? c.sliderQualities : [];
    const aAjouter = designsAEnregistrer(designs, [...siennes, ...(pole?.sliderQualities || [])]);
    console.log(`• ${c.name} (pôle ${pole?.name || '—'}) : ${designs.length} design(s), ${siennes.length} qualité(s), ${aAjouter.length} à ajouter`);
    aAjouter.forEach(q => console.log(`    + ${q.label}${q.nameFR ? ` — ${q.nameFR}` : ''}${q.size ? ` · taille ${q.size}` : ''}${q.sliderWeightG ? ` · ${q.sliderWeightG} g` : ''}${q.imageUrl ? ' [photo]' : ''}`));
    if (!aAjouter.length) continue;
    total += aAjouter.length;
    touchees++;
    if (ECRIRE) {
      await db.doc(`users/${uid}/categories/${c.id}`).update({ sliderQualities: [...siennes, ...aAjouter] });
    }
  }

  console.log(`\n${ECRIRE ? '✅ Écrit' : 'À écrire'} : ${total} design(s) dans ${touchees} catégorie(s).`);
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e?.message || e); process.exit(1); });
