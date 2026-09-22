// Aperçu de l'alerte « suivi conteneur » — n'envoie RIEN, écrit un fichier HTML
// à ouvrir dans le navigateur. Sert à régler la mise en forme sans encombrer la
// boîte mail à chaque retouche.
//
// Lancer :
//   npx tsx scripts/apercu-notification.ts
//   (le fichier est écrit à côté, dans apercu-notification.html)

import { writeFileSync } from 'fs';
import { join } from 'path';
import { changementsNotables, resumerChangements } from '../src/lib/suivi-changements';
import type { SuiviConteneur } from '../src/lib/suivi-conteneur';

// Cas réel : un conteneur HMM en mer dont l'arrivée glisse de trois jours et qui
// touche le port entre deux vérifications.
const avant: SuiviConteneur = {
  shipmentId: 6771358, reference: 'NBOZF8S29400', typeReference: 'bl', statut: 'SAILING',
  compagnie: 'HYUNDAI MM', navire: 'SEASPAN BRIGHTNESS', voyage: '0102W',
  portDechargement: 'CASABLANCA', dateDechargement: '2026-10-26', dateDechargementReelle: false,
  conteneurs: ['KOCU4056529'], abonnes: [], majLe: '2026-09-22T06:11:00Z',
  etapes: [{ code: 'LOAD', libelle: 'Chargé à bord', reel: true, date: '2026-09-18', lieu: 'BUSAN' }],
};

const apres: SuiviConteneur = {
  ...avant,
  statut: 'ARRIVED',
  dateDechargement: '2026-10-29',
  lienCarte: 'https://map.shipsgo.com/ocean/shipments/6771358?token=apercu',
  etapes: [
    ...avant.etapes,
    { code: 'DEPA', libelle: 'Départ du port', reel: true, date: '2026-09-19', lieu: 'BUSAN' },
    { code: 'ARRV', libelle: 'Arrivée au port', reel: true, date: '2026-10-29', lieu: 'CASABLANCA' },
  ],
};

const DOSSIER = 'AD12505JG26917A';
const changements = changementsNotables(avant, apres);
const jourFr = (iso?: string) => {
  const [a, m, j] = String(iso || '').slice(0, 10).split('-');
  return j ? `${j}/${m}/${a}` : '—';
};

console.log('\n── Ce qui déclencherait l’alerte ──\n');
console.log(resumerChangements(changements));
console.log('\n── Message poussé sur le téléphone (Telegram) ──\n');
console.log(`🚢 Dossier ${DOSSIER}\n${apres.reference} · ${apres.compagnie}\n\n${resumerChangements(changements)}\n\nArrivée annoncée : ${jourFr(apres.dateDechargement)} à ${apres.portDechargement}`);

const lignes = changements.map(c => `
    <tr><td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0;font-size:13px;font-weight:800;color:${c.important ? '#111827' : '#6B7280'}">${c.titre}</p>
      ${c.detail ? `<p style="margin:2px 0 0;font-size:11px;color:#9CA3AF">${c.detail}</p>` : ''}
    </td></tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="background:#1c1917;padding:24px 28px;border-radius:18px 18px 0 0">
        <p style="margin:0 0 4px;color:#fbbf24;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.25em">Suivi conteneur</p>
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:900;text-transform:uppercase">Dossier ${DOSSIER}</h1>
        <p style="margin:6px 0 0;color:#a8a29e;font-size:12px">${apres.reference} · ${apres.compagnie} · ${apres.navire}</p>
      </td></tr>
      <tr><td style="background:#fff;padding:8px 0"><table width="100%" cellpadding="0" cellspacing="0">${lignes}</table></td></tr>
      <tr><td style="background:#fff;padding:16px 28px 24px">
        <p style="margin:0;font-size:12px;color:#6B7280">Arrivée annoncée : <strong style="color:#111827">${jourFr(apres.dateDechargement)}</strong> à ${apres.portDechargement}</p>
        <p style="margin:10px 0 0"><a href="${apres.lienCarte}" style="font-size:12px;color:#2563eb;font-weight:700">Voir le conteneur sur la carte →</a></p>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:14px 28px;border-radius:0 0 18px 18px">
        <p style="margin:0;font-size:10px;color:#9CA3AF;font-weight:700">Message automatique — la date du dossier a été mise à jour toute seule.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const sortie = join(process.cwd(), 'apercu-notification.html');
writeFileSync(sortie, html);
console.log(`\nAperçu écrit : ${sortie}\n`);
