// ─── E-mail « nouvelle commande » de la boutique ─────────────────────────────
// Ce que reçoit le commerçant dès qu'un client valide son panier sur lebtex.ma :
// de quoi rappeler le client depuis son téléphone sans ouvrir l'admin (numéros
// cliquables, WhatsApp avec le message de confirmation déjà écrit) et le détail
// exact de ce qu'il faut mettre dans le colis.
//
// Pur (ni Firebase ni nodemailer) : testé par scripts/test-alerte-commande-boutique.ts.
// Tout ce qu'il y a dans une commande vient du navigateur du client (la création
// est ouverte à tous) : chaque valeur est échappée avant d'entrer dans le HTML.

import type { ShopOrder } from './shop-types';
import { formatPrice } from './shop-utils';
import {
  dateHeure, detailsVariante, lienAppel, lienWhatsAppClient, lignesCollentAuSousTotal, lignesSansPrix,
  messageConfirmation, nombreArticles, prixUnitaireLigne, telLisible, telephonesCommande, totalLigne,
  varianteLisible, type LigneCommande,
} from './commandes-boutique';

/** Échappement HTML complet, attributs compris. */
export function echapperHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte libre du client : échappé, retours à la ligne gardés. */
const paragraphe = (v: unknown) => echapperHtml(String(v ?? '').trim()).replace(/\r?\n/g, '<br>');

/** Pour le sujet : une seule ligne, longueur bornée (un nom de 2 000 caractères ne doit pas envahir la boîte). */
function surUneLigne(v: unknown, max = 60): string {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * L'e-mail du client s'il a l'air d'en être un, sinon null. Sert d'adresse de
 * réponse : répondre à l'alerte écrit directement au client.
 */
export function emailDuClient(o: Pick<ShopOrder, 'customerEmail'>): string | null {
  const e = String(o.customerEmail ?? '').trim();
  return e.length <= 254 && /^[^\s@<>",;:()]+@[^\s@<>",;:()]+\.[^\s@<>",;:()]+$/.test(e) ? e : null;
}

const nomClient = (o: ShopOrder) => String(o.customerName || o.shippingAddress?.fullName || '').trim() || 'Client sans nom';

// ─── Styles (en ligne : les messageries ignorent les feuilles de style) ─────

const COULEUR = { texte: '#111827', gris: '#6B7280', trait: '#F3F4F6', rouge: '#C8102E', or: '#D4A843', noir: '#0F0F0F', whatsapp: '#25D366' };

const titreBloc = (t: string) =>
  `<p style="margin:0 0 10px;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${t}</p>`;

const bouton = (href: string, libelle: string, fond: string) =>
  `<a href="${echapperHtml(href)}" style="display:inline-block;background:${fond};color:#ffffff;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:800;text-decoration:none;margin:0 8px 6px 0">${libelle}</a>`;

const bloc = (contenu: string, fond = '#ffffff') =>
  `<tr><td style="background:${fond};padding:20px 24px;border-top:1px solid ${COULEUR.trait}">${contenu}</td></tr>`;

// ─── E-mail ───────────────────────────────────────────────────────────────────

export function emailNouvelleCommande(
  o: ShopOrder & { id: string },
  lienAdmin: string,
  maintenant = Date.now(),
): { sujet: string; html: string; texte: string } {
  const nom = nomClient(o);
  const ville = String(o.shippingAddress?.city ?? '').trim();
  // Sans horodatage (commande tout juste écrite), elle vient d'arriver.
  const recue = dateHeure(o.createdAt ?? new Date(maintenant), maintenant);
  const lignes = (o.items || []) as LigneCommande[];
  const sansPrix = lignesSansPrix(o);
  const prixDeGros = !lignesCollentAuSousTotal(o);
  const nbArticles = nombreArticles(o);
  const total = formatPrice(Number(o.total) || 0);
  const tels = telephonesCommande(o);
  const messageWhatsApp = messageConfirmation(o, maintenant);
  const emailClient = emailDuClient(o);
  const adresse = o.shippingAddress || ({} as ShopOrder['shippingAddress']);
  // Le nom de livraison ne se répète que s'il diffère de celui du client.
  const destinataire = String(adresse.fullName ?? '').trim();
  const autreDestinataire = destinataire && destinataire !== nom ? destinataire : '';
  const villeComplete = [ville, adresse.region, adresse.postalCode].map(v => String(v ?? '').trim()).filter(Boolean).join(' · ');
  const livraison = Number(o.deliveryFee) > 0 ? formatPrice(Number(o.deliveryFee)) : 'gratuite';
  const reduction = Number(o.discount) > 0 ? Number(o.discount) : 0;
  const avertissementSansPrix = sansPrix.length
    ? `${sansPrix.length} article${sansPrix.length > 1 ? 's' : ''} sans prix : prix à fixer avec le client avant de confirmer.`
    : '';

  const sujet = [
    `🛒 Nouvelle commande — ${surUneLigne(nom)}${ville ? `, ${surUneLigne(ville, 40)}` : ''}`,
    `${total}${sansPrix.length ? ' + prix à fixer' : ''}`,
    `n° ${surUneLigne(o.orderNumber, 40)}`,
  ].join(' — ');

  // ── HTML ──
  const telephonesHtml = tels.map((t, i) => {
    const appel = lienAppel(t);
    const whatsapp = lienWhatsAppClient(t, messageWhatsApp);
    return `<div style="margin:${i ? '14px' : '0'} 0 0">
      <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:${COULEUR.texte};letter-spacing:0.02em">${echapperHtml(telLisible(t))}
        <span style="font-size:11px;font-weight:700;color:${COULEUR.gris};letter-spacing:0">${i ? '· autre numéro' : '· principal'}</span></p>
      ${appel ? bouton(appel, '📞 Appeler', COULEUR.texte) : ''}${whatsapp ? bouton(whatsapp, '💬 WhatsApp', COULEUR.whatsapp) : ''}
    </div>`;
  }).join('');

  const lignesHtml = lignes.map(l => {
    const prix = prixUnitaireLigne(l);
    const details = detailsVariante(l.variant)
      .map(d => `${d.libelle} : <strong style="color:${COULEUR.texte}">${echapperHtml(d.valeur)}</strong>`)
      .join(' · ');
    const colonnePrix = prix > 0
      ? `<p style="margin:0;font-size:14px;font-weight:800;color:${COULEUR.texte}">${formatPrice(totalLigne(l))}</p>
         <p style="margin:3px 0 0;font-size:11px;color:${COULEUR.gris}">${formatPrice(prix)} / unité</p>`
      : `<p style="margin:0;font-size:13px;font-weight:900;color:${COULEUR.rouge}">prix à fixer</p>`;
    return `<tr>
      <td style="padding:12px 0;border-bottom:1px solid ${COULEUR.trait};vertical-align:top">
        <p style="margin:0;font-size:14px;font-weight:800;color:${COULEUR.texte}" dir="auto"><span style="color:${COULEUR.rouge}">${echapperHtml(l.quantity)} ×</span> ${echapperHtml(l.productName)}</p>
        ${details ? `<p style="margin:4px 0 0;font-size:12px;color:#374151;line-height:1.5">${details}</p>` : ''}
      </td>
      <td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${COULEUR.trait};vertical-align:top;white-space:nowrap">${colonnePrix}</td>
    </tr>`;
  }).join('');

  const ligneTotal = (libelle: string, valeur: string, fort = false) => `<tr>
      <td style="padding:4px 0;font-size:${fort ? '15px' : '13px'};color:${fort ? COULEUR.texte : COULEUR.gris};font-weight:${fort ? 900 : 600}">${libelle}</td>
      <td align="right" style="padding:4px 0;font-size:${fort ? '15px' : '13px'};color:${fort ? COULEUR.rouge : COULEUR.texte};font-weight:${fort ? 900 : 700};white-space:nowrap">${valeur}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapperHtml(sujet)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${echapperHtml(`${total} à encaisser · ${nom}${ville ? ` · ${ville}` : ''}${tels[0] ? ` · ${telLisible(tels[0])}` : ''}`)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 12px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="background:${COULEUR.noir};padding:22px 24px;border-radius:18px 18px 0 0">
        <p style="margin:0 0 6px;color:${COULEUR.or};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.22em">Nouvelle commande sur lebtex.ma</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900" dir="auto">${echapperHtml(nom)}${ville ? ` <span style="color:#a8a29e;font-weight:700">· ${echapperHtml(ville)}</span>` : ''}</h1>
        <p style="margin:6px 0 0;color:#a8a29e;font-size:12px">Reçue ${echapperHtml(recue)} · n° ${echapperHtml(o.orderNumber)}</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:22px 24px 18px">
        <p style="margin:0;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">Total à encaisser</p>
        <p style="margin:4px 0 0;color:${COULEUR.rouge};font-size:34px;font-weight:900;line-height:1.1">${total}</p>
        <p style="margin:6px 0 0;color:${COULEUR.gris};font-size:12px">Paiement à la livraison · ${nbArticles} article${nbArticles > 1 ? 's' : ''}</p>
        ${avertissementSansPrix ? `<p style="margin:12px 0 0;padding:10px 12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;color:${COULEUR.rouge};font-size:13px;font-weight:800">⚠ ${avertissementSansPrix}</p>` : ''}
      </td></tr>
      ${bloc(`${titreBloc('Client')}
        <p style="margin:0 0 12px;font-size:17px;font-weight:800;color:${COULEUR.texte}" dir="auto">${echapperHtml(nom)}</p>
        ${telephonesHtml || `<p style="margin:0;font-size:13px;color:${COULEUR.rouge};font-weight:700">Aucun téléphone valable dans la commande.</p>`}
        ${emailClient ? `<p style="margin:12px 0 0;font-size:12px;color:${COULEUR.gris}">E-mail : ${echapperHtml(emailClient)}</p>` : ''}`)}
      ${bloc(`${titreBloc('Adresse de livraison')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.5" dir="auto">
          ${autreDestinataire ? `<strong>${echapperHtml(autreDestinataire)}</strong><br>` : ''}${paragraphe(adresse.address) || '—'}<br>
          <strong>${echapperHtml(villeComplete || '—')}</strong>
        </p>`)}
      ${bloc(`${titreBloc('À mettre dans le colis')}
        <table width="100%" cellpadding="0" cellspacing="0">${lignesHtml}</table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
          ${ligneTotal('Sous-total', formatPrice(Number(o.subtotal) || 0))}
          ${ligneTotal(`Livraison${ville ? ` (${echapperHtml(ville)})` : ''}`, livraison)}
          ${reduction ? ligneTotal(`Réduction${o.couponCode ? ` (${echapperHtml(o.couponCode)})` : ''}`, `-${formatPrice(reduction)}`) : ''}
          ${ligneTotal('Total à encaisser', total, true)}
        </table>
        ${prixDeGros ? `<p style="margin:10px 0 0;font-size:12px;color:${COULEUR.gris};font-style:italic">Prix de gros appliqué : le sous-total fait foi, pas le détail des lignes.</p>` : ''}`)}
      ${o.notes && String(o.notes).trim() ? bloc(`${titreBloc('Note du client')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.5" dir="auto">${paragraphe(o.notes)}</p>`, '#FFFBEB') : ''}
      <tr><td style="background:#ffffff;padding:20px 24px 24px;border-top:1px solid ${COULEUR.trait}">
        <a href="${echapperHtml(lienAdmin)}" style="display:block;background:${COULEUR.rouge};color:#ffffff;text-align:center;padding:16px;border-radius:12px;font-size:16px;font-weight:900;text-decoration:none">Ouvrir la commande</a>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid ${COULEUR.trait};padding:14px 24px;border-radius:0 0 18px 18px">
        <p style="margin:0;font-size:12px;color:${COULEUR.texte};font-weight:800">Promis au client : un appel sous 2 h pour confirmer.</p>
        <p style="margin:4px 0 0;font-size:10px;color:#9CA3AF;font-weight:700">Message automatique de lebtex.ma${emailClient ? ' — répondre à cet e-mail écrit directement au client.' : '.'}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // ── Texte brut ──
  const texte = [
    'NOUVELLE COMMANDE SUR LEBTEX.MA',
    `Reçue ${recue} — n° ${o.orderNumber}`,
    '',
    `TOTAL À ENCAISSER : ${total} (paiement à la livraison, ${nbArticles} article${nbArticles > 1 ? 's' : ''})`,
    ...(avertissementSansPrix ? [`/!\\ ${avertissementSansPrix}`] : []),
    '',
    'CLIENT',
    nom,
    ...tels.flatMap((t, i) => [
      `${telLisible(t)}${i ? ' (autre numéro)' : ''} — appeler : ${lienAppel(t) ?? '—'}`,
      `  WhatsApp : ${lienWhatsAppClient(t, messageWhatsApp) ?? '—'}`,
    ]),
    ...(tels.length ? [] : ['Aucun téléphone valable dans la commande.']),
    ...(emailClient ? [`E-mail : ${emailClient}`] : []),
    '',
    'ADRESSE DE LIVRAISON',
    ...(autreDestinataire ? [autreDestinataire] : []),
    String(adresse.address ?? '').trim() || '—',
    villeComplete || '—',
    '',
    'À METTRE DANS LE COLIS',
    ...lignes.map(l => {
      const prix = prixUnitaireLigne(l);
      const variante = varianteLisible(l.variant);
      const montant = prix > 0 ? `${formatPrice(prix)} × ${l.quantity} = ${formatPrice(totalLigne(l))}` : 'PRIX À FIXER';
      return `• ${l.quantity} × ${l.productName}${variante ? ` (${variante})` : ''} — ${montant}`;
    }),
    '',
    `Sous-total : ${formatPrice(Number(o.subtotal) || 0)}`,
    `Livraison${ville ? ` (${ville})` : ''} : ${livraison}`,
    ...(reduction ? [`Réduction${o.couponCode ? ` (${o.couponCode})` : ''} : -${formatPrice(reduction)}`] : []),
    `Total à encaisser : ${total}`,
    ...(prixDeGros ? ['(Prix de gros appliqué : le sous-total fait foi, pas le détail des lignes.)'] : []),
    ...(o.notes && String(o.notes).trim() ? ['', 'NOTE DU CLIENT', String(o.notes).trim()] : []),
    '',
    `Ouvrir la commande : ${lienAdmin}`,
    '',
    'Promis au client : un appel sous 2 h pour confirmer.',
  ].join('\n');

  return { sujet, html, texte };
}

// ─── E-mail « alertes en pause » ────────────────────────────────────────────
// Au-delà du plafond d'alertes (commandes en rafale, ou quelqu'un qui en crée en
// boucle : la création est ouverte à tous), les e-mails s'arrêtent pour ne pas
// épuiser le quota Gmail, partagé avec les autres envois du site. Le commerçant
// en est prévenu une fois : les commandes, elles, arrivent toujours dans l'admin.

const heureMaroc = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' }).format(d);
const jourMaroc = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function emailAlertesEnPause(
  raison: { plafond: number; periode: 'heure' | 'jour' },
  reprise: Date,
  lienAdmin: string,
  maintenant = Date.now(),
): { sujet: string; html: string; texte: string } {
  const periode = raison.periode === 'heure' ? 'en une heure' : 'en 24 heures';
  // La reprise tombe au plus tard dans 24 h : aujourd'hui ou demain.
  const quand = `${jourMaroc(reprise) === jourMaroc(new Date(maintenant)) ? 'aujourd’hui' : 'demain'} vers ${heureMaroc(reprise)}`;
  const sujet = `⚠ Beaucoup de commandes : alertes e-mail en pause jusqu'à ${heureMaroc(reprise)}`;
  const lignes = [
    `Plus de ${raison.plafond} commandes sont arrivées ${periode} sur lebtex.ma.`,
    `Les e-mails « nouvelle commande » sont en pause ; ils reprendront ${quand} (heure du Maroc).`,
    'Les commandes continuent d’arriver dans l’admin : ouvrez-le pour les voir et rappeler les clients.',
    'Si ces commandes vous semblent fausses (mêmes noms, numéros bizarres), quelqu’un en crée peut-être en boucle : prévenez la personne qui gère le site.',
  ];
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapperHtml(sujet)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="560" cellpadding="0" cellspacing="0" align="center" style="max-width:560px;width:100%;background:#ffffff;border-radius:18px">
    <tr><td style="padding:22px 24px">
      <p style="margin:0 0 12px;color:${COULEUR.rouge};font-size:18px;font-weight:900">Alertes e-mail en pause</p>
      ${lignes.map(l => `<p style="margin:0 0 10px;font-size:14px;color:${COULEUR.texte};line-height:1.5">${echapperHtml(l)}</p>`).join('')}
      <a href="${echapperHtml(lienAdmin)}" style="display:block;margin-top:16px;background:${COULEUR.rouge};color:#ffffff;text-align:center;padding:14px;border-radius:12px;font-size:15px;font-weight:900;text-decoration:none">Ouvrir les commandes</a>
    </td></tr>
  </table>
</body></html>`;
  const texte = [...lignes, '', `Ouvrir les commandes : ${lienAdmin}`].join('\n');
  return { sujet, html, texte };
}
