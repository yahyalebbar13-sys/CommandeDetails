// ─── E-mail « confirmation de commande » envoyé au CLIENT ────────────────────
// Le commerçant l'envoie depuis la fiche d'une commande (/admin-shop), après
// l'avoir relu dans une boîte d'aperçu. Le client y retrouve ce qu'il a
// commandé, ce qu'il paiera à la livraison et l'adresse où le colis arrive :
// s'il y a une erreur, il répond simplement à l'e-mail.
//
// Pur (ni Firebase ni nodemailer) : sert à la route /api/shop/commandes/interne
// (envoi), à l'accusé de réception automatique (/api/shop/commandes/alerte) ET à
// la fiche dans le navigateur (aperçu du texte). Testé par
// scripts/test-email-confirmation-client.ts.
// Tout ce qu'il y a dans une commande vient du navigateur du client (la création
// est ouverte à tous) : chaque valeur est échappée avant d'entrer dans le HTML.

import type { OrderStatus, ShopOrder } from './shop-types';
import { formatPrice } from './shop-utils';
import {
  dateDe, dateHeure, detailsVariante, lignesCollentAuSousTotal, lignesSansPrix, prixUnitaireLigne, telLisible,
  telephonesCommande, totalLigne, varianteLisible, type LigneCommande,
} from './commandes-boutique';
import { echapperHtml } from './alerte-commande-boutique';

/** L'adresse de LEBTEX : celle qui envoie, et celle où arrivent les réponses des clients. */
export const EMAIL_LEBTEX = 'lebtexsarlau@gmail.com';
const SITE_LISIBLE = 'www.lebtex.ma';
const SITE_URL = 'https://www.lebtex.ma';

/** Statuts pour lesquels on peut encore confirmer : pas une commande livrée, annulée ou revenue. */
const STATUTS_CONFIRMABLES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];

export function statutPermetConfirmation(s: OrderStatus): boolean {
  return STATUTS_CONFIRMABLES.includes(s);
}

type Moment = 'recue' | 'confirmee' | 'preparation' | 'en_route';

/** Où en est la commande, du point de vue du client. */
function momentDe(s: OrderStatus): Moment {
  if (s === 'pending') return 'recue';
  if (s === 'processing') return 'preparation';
  if (s === 'shipped' || s === 'out_for_delivery') return 'en_route';
  // confirmed — et, par défaut, un statut que la route refuse de toute façon.
  return 'confirmee';
}

/** Quantité affichable : un nombre, ou un texte court ; jamais « undefined » ni « [object Object] ». */
function quantiteDe(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 20);
  return '?';
}

/** Nom du produit affichable, « Article » s'il manque. */
function produitDe(v: unknown): string {
  return (typeof v === 'string' && v.trim()) ? v.trim() : 'Article';
}

/** Pour le sujet : une seule ligne, longueur bornée. */
function surUneLigne(v: unknown, max = 60): string {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Texte libre : échappé, retours à la ligne gardés. */
const paragraphe = (v: unknown) => echapperHtml(String(v ?? '').trim()).replace(/\r?\n/g, '<br>');

// ─── Styles (en ligne : les messageries ignorent les feuilles de style) ─────

const COULEUR = { texte: '#111827', gris: '#6B7280', doux: '#374151', trait: '#F3F4F6', rouge: '#C8102E', or: '#D4A843', noir: '#0F0F0F' };

const titreBloc = (t: string) =>
  `<p style="margin:0 0 10px;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${t}</p>`;

const bloc = (contenu: string, fond = '#ffffff') =>
  `<tr><td style="background:${fond};padding:20px 24px;border-top:1px solid ${COULEUR.trait}">${contenu}</td></tr>`;

// ─── E-mail ───────────────────────────────────────────────────────────────────

export function emailConfirmationClient(o: ShopOrder): { sujet: string; html: string; texte: string } {
  const moment = momentDe(o.status);
  const numero = String(o.orderNumber ?? '').trim();
  const nom = String(o.customerName || o.shippingAddress?.fullName || '').trim();
  // Date complète, jamais « aujourd'hui » : l'e-mail peut être lu le lendemain.
  const passeeLe = dateDe(o.createdAt) ? dateHeure(o.createdAt, 0) : '';
  const lignes = (Array.isArray(o.items) ? o.items : [])
    .filter((l): l is LigneCommande => !!l && typeof l === 'object');
  const sansPrix = lignesSansPrix({ items: lignes }).length > 0;
  // Ancienne commande (prix de gros appliqué au sous-total seulement) : les montants
  // par ligne ne feraient pas le sous-total demandé. On n'affiche alors que les quantités.
  const montantsParLigne = lignesCollentAuSousTotal({ items: lignes, subtotal: o.subtotal });
  const total = formatPrice(Number(o.total) || 0);
  const adresse = o.shippingAddress || ({} as ShopOrder['shippingAddress']);
  const ville = String(adresse.city ?? '').trim();
  const destinataire = String(adresse.fullName ?? '').trim() || nom;
  const villeComplete = [ville, adresse.region, adresse.postalCode].map(v => String(v ?? '').trim()).filter(Boolean).join(' · ');
  const telephones = telephonesCommande(o).map(telLisible).filter(Boolean);
  const livraison = Number(o.deliveryFee) > 0 ? formatPrice(Number(o.deliveryFee)) : 'gratuite';
  const reduction = Number(o.discount) > 0 ? Number(o.discount) : 0;
  const coupon = String(o.couponCode ?? '').trim();
  // Pas de reprise de la note du client : n'importe qui peut créer une commande
  // avec l'adresse d'un autre, et ce texte libre partirait de la boîte de LEBTEX.
  const libelleTotal = 'Total à payer à la livraison';
  const horsPrixAConfirmer = sansPrix ? 'hors articles au prix à confirmer' : '';

  const sujet = moment === 'recue'
    ? `Nous avons bien reçu votre commande n° ${surUneLigne(numero, 40)} — LEBTEX`
    : `Confirmation de votre commande n° ${surUneLigne(numero, 40)} — LEBTEX`;

  const titre = {
    recue: 'Commande bien reçue', confirmee: 'Commande confirmée', preparation: 'Commande en préparation', en_route: 'Commande en route',
  }[moment];

  // L'appel de confirmation est annoncé une seule fois, dans « Livraison et paiement ».
  const ouverture = {
    recue: `Nous avons bien reçu votre commande n° ${numero}.`,
    confirmee: `Votre commande n° ${numero} est confirmée.`,
    preparation: `Votre commande n° ${numero} est confirmée et en cours de préparation.`,
    en_route: `Votre commande n° ${numero} est confirmée et elle est en route avec notre société de livraison.`,
  }[moment];

  const livraisonEtPaiement = moment === 'recue'
    ? [
      'Nous vous appelons d’abord pour confirmer la commande et l’adresse de livraison.',
      'Ensuite, notre société de livraison vous appellera avant de passer. Le paiement se fait en espèces à la réception du colis.',
    ]
    : ['Notre société de livraison vous appellera avant de passer. Le paiement se fait en espèces à la réception du colis.'];

  const question = 'Pour toute question, répondez simplement à cet e-mail.';
  const signature = `L’équipe LEBTEX — ${SITE_LISIBLE} — ${EMAIL_LEBTEX}`;

  // ── HTML ──
  const lignesHtml = lignes.map(l => {
    const prix = prixUnitaireLigne(l);
    const details = detailsVariante(l.variant)
      .map(d => `${d.libelle} : <strong style="color:${COULEUR.texte}">${echapperHtml(d.valeur)}</strong>`)
      .join(' · ');
    const colonnePrix = prix <= 0
      ? `<p style="margin:0;font-size:13px;font-weight:700;color:${COULEUR.gris};font-style:italic">prix à confirmer</p>`
      : montantsParLigne
        ? `<p style="margin:0;font-size:14px;font-weight:800;color:${COULEUR.texte}">${echapperHtml(formatPrice(totalLigne(l)))}</p>`
        : '';
    return `<tr>
      <td style="padding:12px 0;border-bottom:1px solid ${COULEUR.trait};vertical-align:top">
        <p style="margin:0;font-size:14px;font-weight:700;color:${COULEUR.texte}" dir="auto">${echapperHtml(quantiteDe(l.quantity))} × ${echapperHtml(produitDe(l.productName))}</p>
        ${details ? `<p style="margin:4px 0 0;font-size:12px;color:${COULEUR.doux};line-height:1.5" dir="auto">${details}</p>` : ''}
      </td>
      <td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${COULEUR.trait};vertical-align:top;white-space:nowrap">${colonnePrix}</td>
    </tr>`;
  }).join('');

  const ligneMontant = (libelle: string, valeur: string) => `<tr>
      <td style="padding:4px 0;font-size:13px;color:${COULEUR.gris};font-weight:600">${libelle}</td>
      <td align="right" style="padding:4px 0;font-size:13px;color:${COULEUR.texte};font-weight:700;white-space:nowrap">${valeur}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapperHtml(sujet)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${echapperHtml(`${titre} · ${libelleTotal} : ${total}`)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f2f5;padding:24px 12px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%">
      <tr><td style="background:${COULEUR.noir};padding:22px 24px;border-radius:18px 18px 0 0">
        <p style="margin:0 0 6px;color:${COULEUR.or};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.22em">LEBTEX</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900">${titre}</h1>
        <p style="margin:6px 0 0;color:#a8a29e;font-size:12px">n° ${echapperHtml(numero)}${passeeLe ? ` · passée le ${echapperHtml(passeeLe)}` : ''}</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:22px 24px 18px">
        <p style="margin:0 0 10px;font-size:15px;color:${COULEUR.texte};font-weight:700" dir="auto">Bonjour${nom ? ` ${echapperHtml(nom)}` : ''},</p>
        <p style="margin:0;font-size:15px;color:${COULEUR.texte};line-height:1.55">${echapperHtml(ouverture)}</p>
      </td></tr>
      ${bloc(`${titreBloc('Votre commande')}
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${lignesHtml}</table>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:10px">
          ${ligneMontant('Sous-total', echapperHtml(formatPrice(Number(o.subtotal) || 0)))}
          ${ligneMontant(`Livraison${ville ? ` (${echapperHtml(ville)})` : ''}`, echapperHtml(livraison))}
          ${reduction ? ligneMontant(`Réduction${coupon ? ` (${echapperHtml(coupon)})` : ''}`, `-${echapperHtml(formatPrice(reduction))}`) : ''}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;background:#FEF2F2;border-radius:12px">
          <tr><td style="padding:14px 16px">
            <p style="margin:0;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${libelleTotal}</p>
            <p style="margin:4px 0 0;color:${COULEUR.rouge};font-size:28px;font-weight:900;line-height:1.15">${echapperHtml(total)}</p>
            ${horsPrixAConfirmer ? `<p style="margin:4px 0 0;color:${COULEUR.doux};font-size:12px">${horsPrixAConfirmer}</p>` : ''}
          </td></tr>
        </table>`)}
      ${bloc(`${titreBloc('Adresse de livraison')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.55" dir="auto">
          ${destinataire ? `<strong>${echapperHtml(destinataire)}</strong><br>` : ''}${paragraphe(adresse.address) || '—'}<br>
          ${echapperHtml(villeComplete || '—')}
        </p>
        <p style="margin:8px 0 0;font-size:14px;color:${COULEUR.texte}">Téléphone : <strong>${echapperHtml(telephones.join(' / ') || '—')}</strong></p>`)}
      ${bloc(`${titreBloc('Livraison et paiement')}
        ${livraisonEtPaiement.map(p => `<p style="margin:0 0 8px;font-size:14px;color:${COULEUR.texte};line-height:1.55">${echapperHtml(p)}</p>`).join('')}
        <p style="margin:12px 0 0;font-size:14px;color:${COULEUR.texte};line-height:1.55">${echapperHtml(question)}</p>`)}
      <tr><td style="background:#f9fafb;border-top:1px solid ${COULEUR.trait};padding:16px 24px;border-radius:0 0 18px 18px">
        <p style="margin:0;font-size:13px;color:${COULEUR.texte};font-weight:800">L’équipe LEBTEX</p>
        <p style="margin:4px 0 0;font-size:12px;color:${COULEUR.gris}">
          <a href="${SITE_URL}" style="color:${COULEUR.gris};text-decoration:underline">${SITE_LISIBLE}</a> —
          <a href="mailto:${EMAIL_LEBTEX}" style="color:${COULEUR.gris};text-decoration:underline">${EMAIL_LEBTEX}</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // ── Texte brut (aussi l'aperçu de la fiche) ──
  const texte = [
    `Bonjour${nom ? ` ${nom}` : ''},`,
    '',
    ouverture,
    '',
    `Commande n° ${numero}${passeeLe ? `, passée le ${passeeLe}` : ''} sur ${SITE_LISIBLE}`,
    '',
    'VOTRE COMMANDE',
    ...lignes.map(l => {
      const variante = varianteLisible(l.variant);
      const montant = prixUnitaireLigne(l) <= 0 ? 'prix à confirmer' : montantsParLigne ? formatPrice(totalLigne(l)) : '';
      return `• ${quantiteDe(l.quantity)} × ${produitDe(l.productName)}${variante ? ` (${variante})` : ''}${montant ? ` : ${montant}` : ''}`;
    }),
    ...(lignes.length ? [] : ['—']),
    '',
    `Sous-total : ${formatPrice(Number(o.subtotal) || 0)}`,
    `Livraison${ville ? ` (${ville})` : ''} : ${livraison}`,
    ...(reduction ? [`Réduction${coupon ? ` (${coupon})` : ''} : -${formatPrice(reduction)}`] : []),
    `${libelleTotal.toUpperCase()} : ${total}${horsPrixAConfirmer ? ` (${horsPrixAConfirmer})` : ''}`,
    '',
    'ADRESSE DE LIVRAISON',
    ...(destinataire ? [destinataire] : []),
    String(adresse.address ?? '').trim() || '—',
    villeComplete || '—',
    `Téléphone : ${telephones.join(' / ') || '—'}`,
    '',
    ...livraisonEtPaiement,
    '',
    question,
    '',
    signature,
  ].join('\n');

  return { sujet, html, texte };
}

// ─── Échec d'envoi Gmail, en mots du commerçant ───────────────────────────────
// Utilisé par la route d'envoi ; ici pour être testé sans serveur.

/** Délais dépassés AVANT tout échange avec Gmail (connexion, accueil) : rien n'est parti. */
const DELAI_AVANT_ENVOI = /^(Connection timeout|Greeting never received)/;

/**
 * Pourquoi Gmail n'a pas pris l'e-mail, en mots du commerçant ; le journal serveur
 * ne garde que les codes. `incertain` : la connexion a été coupée en route, peut-être
 * après que Gmail a reçu le message ; l'e-mail est alors peut-être parti.
 */
export function echecEnvoiGmail(err: any): { message: string; incertain: boolean } {
  const code = String(err?.code || '').replace(/[^A-Z0-9_]/gi, '').slice(0, 20);
  const etape = String(err?.command || '');
  const texteErreur = String(err?.message || '');
  const reponseGmail = Number(err?.responseCode) || 0;

  if (code === 'EAUTH') {
    return {
      incertain: false,
      message: `Gmail a refusé la connexion de ${EMAIL_LEBTEX}. Sur Vercel (Settings → Environment Variables), `
        + `GMAIL_APP_PASSWORD doit contenir le mot de passe d’application de ce compte, et GMAIL_USER doit valoir ${EMAIL_LEBTEX} `
        + '(ou ne pas exister). Redéployez le site après la modification.',
    };
  }
  // Seul le refus au moment de RCPT TO porte sur l'adresse du client.
  if (code === 'EENVELOPE' && etape === 'RCPT TO') {
    return { incertain: false, message: 'Gmail a refusé l’adresse e-mail du client. Vérifiez-la avec lui par téléphone.' };
  }
  // MAIL FROM ou DATA refusés : c'est l'envoi lui-même qui est bloqué (limite du jour, le plus souvent).
  if (code === 'EENVELOPE') {
    return {
      incertain: false,
      message: `Gmail refuse d’envoyer pour l’instant (la limite d’envois du jour de ${EMAIL_LEBTEX} est peut-être atteinte). Réessayez plus tard.`,
    };
  }

  const coupeeEnRoute =
    !code
    || (code === 'ETIMEDOUT' && !DELAI_AVANT_ENVOI.test(texteErreur))
    || (code === 'ESOCKET' && err?.syscall !== 'connect' && err?.syscall !== 'getaddrinfo')
    || (code === 'ECONNECTION' && /closed unexpectedly/i.test(texteErreur))
    || (code === 'EPROTOCOL' && /^Unexpected Response/.test(texteErreur));
  if (coupeeEnRoute) {
    return {
      incertain: true,
      message: `La connexion avec Gmail a été coupée pendant l’envoi : l’e-mail est peut-être parti. `
        + `Regardez dans les « Messages envoyés » de ${EMAIL_LEBTEX} avant de le renvoyer.`,
    };
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS', 'ETLS'].includes(code)) {
    return { incertain: false, message: 'Gmail n’a pas répondu : l’e-mail n’est pas parti. Réessayez dans un moment.' };
  }
  return {
    incertain: false,
    message: `Gmail a refusé l’envoi (code ${code}${reponseGmail ? ` ${reponseGmail}` : ''}). Réessayez dans quelques minutes.`,
  };
}
