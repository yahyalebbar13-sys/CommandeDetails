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
//
// Le texte suit le mode de réception choisi (29/09/2026) : colis Sendit (le texte
// d'avant), retrait au magasin (où et quand), transport d'un rouleau (nous
// appelons pour l'organiser). Pour un virement : le motif (n° de commande) et
// où lire le RIB, jamais le RIB lui-même (un e-mail se transfère, se falsifie).
// Les magasins viennent des réglages (shop_catalogue_settings/reception), passés
// par l'appelant : la fiche et le serveur lisent le même document.
//
// Faux RIB : l'accusé de réception part tout seul, du Gmail de LEBTEX, vers
// l'adresse que le créateur de la commande a choisie. Rien de ce qu'il a écrit ne
// doit pouvoir s'y lire comme un message de LEBTEX : le n° de commande n'est repris
// que s'il a la forme du checkout (sinon l'identifiant du document), et le nom,
// l'adresse, les articles sont bornés, sans suite de 8 chiffres ou plus (RIB) ;
// seuls les téléphones marocains valables sont repris.

import type { OrderStatus, ShopOrder } from './shop-types';
import { formatPrice } from './shop-utils';
import {
  dateDe, dateHeure, detailsVariante, fraisColisAnnonces, GARDE_RETRAIT_JOURS_OUVRES, lienPageCommande as lienPageDuSite,
  lignesCollentAuSousTotal, lignesSansPrix, moyenPaiementDe, numeroCommandeAffichable, prixUnitaireLigne, receptionDe,
  telInternational, telLisible, telephonesCommande, texteClientSur, totalLigne, varianteLisible, type LigneCommande,
} from './commandes-boutique';
import { echapperHtml } from './alerte-commande-boutique';
import { delaiColis } from './livraison-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type ReglagesReception } from './reglages-reception';

/** L'adresse de LEBTEX : celle qui envoie, et celle où arrivent les réponses des clients. */
export const EMAIL_LEBTEX = 'lebtexsarlau@gmail.com';
const SITE_LISIBLE = 'www.lebtex.ma';
const SITE_URL = 'https://www.lebtex.ma';

/** Statuts pour lesquels on peut encore confirmer : pas une commande livrée, annulée ou revenue. */
const STATUTS_CONFIRMABLES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery'];

export function statutPermetConfirmation(s: OrderStatus): boolean {
  return STATUTS_CONFIRMABLES.includes(s);
}

type Moment = 'recue' | 'confirmee' | 'preparation' | 'prete' | 'en_route';

/** Où en est la commande, du point de vue du client. */
function momentDe(s: OrderStatus): Moment {
  if (s === 'pending') return 'recue';
  if (s === 'processing') return 'preparation';
  if (s === 'ready_for_pickup') return 'prete';
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

/** Nom du produit affichable, « Article » s'il manque ; borné, sans suite de chiffres (RIB). */
function produitDe(v: unknown): string {
  return texteClientSur(v, 100) || 'Article';
}

/** Pour le sujet : une seule ligne, longueur bornée. */
function surUneLigne(v: unknown, max = 60): string {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Styles (en ligne : les messageries ignorent les feuilles de style) ─────

const COULEUR = { texte: '#111827', gris: '#6B7280', doux: '#374151', trait: '#F3F4F6', rouge: '#C8102E', or: '#D4A843', noir: '#0F0F0F' };

const titreBloc = (t: string) =>
  `<p style="margin:0 0 10px;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${t}</p>`;

const bloc = (contenu: string, fond = '#ffffff') =>
  `<tr><td style="background:${fond};padding:20px 24px;border-top:1px solid ${COULEUR.trait}">${contenu}</td></tr>`;

// ─── Délai de livraison annoncé ──────────────────────────────────────────────
// Le commerçant le choisit dans la boîte d'envoi (« 24-48h », « 2-3 jours ») ;
// il arrive au serveur dans la requête : une ligne, courte, sans caractère de contrôle.

const DELAI_MAX = 30;

export function delaiLivraisonNettoye(v: unknown): string {
  return typeof v === 'string' ? surUneLigne(v, DELAI_MAX) : '';
}

/**
 * Le délai habituel d'un colis Sendit pour la ville (grille de la boutique), à proposer
 * par défaut. Rien pour un retrait ou un transport : ça se fixe au téléphone.
 */
export function delaiLivraisonParDefaut(o: Pick<ShopOrder, 'shippingAddress'> & Partial<Pick<ShopOrder, 'reception' | 'items'>>): string {
  if (receptionDe({ reception: o.reception, items: o.items ?? [] }).mode !== 'domicile') return '';
  return delaiColis(String(o.shippingAddress?.city ?? ''));
}

/** Lien vers la page de la commande (celle qui montre le RIB), seulement pour un identifiant sans surprise. */
const lienPageCommande = (id?: string): string | null => lienPageDuSite(id);

/** Un lien Google Maps réglé par l'administrateur : seulement en https. */
function lienSur(v: string): string | null {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

// ─── E-mail ───────────────────────────────────────────────────────────────────

export function emailConfirmationClient(
  o: ShopOrder,
  options: {
    delaiLivraison?: string;
    reglages?: ReglagesReception;
    /** Accusé de réception envoyé tout seul, sans relecture : le nom est encore plus court. */
    automatique?: boolean;
  } = {},
): { sujet: string; html: string; texte: string } {
  const delai = delaiLivraisonNettoye(options.delaiLivraison);
  const reglages = options.reglages ?? REGLAGES_RECEPTION_DEFAUT;
  const moment = momentDe(o.status);
  // Jamais un n° inventé (« RIB CHANGE 0077… ») : la forme du checkout, sinon l'identifiant du document.
  const numero = numeroCommandeAffichable(o);
  const nom = texteClientSur(o.customerName || o.shippingAddress?.fullName, options.automatique ? 30 : 60);
  // Date complète, jamais « aujourd'hui » : l'e-mail peut être lu le lendemain.
  const passeeLe = dateDe(o.createdAt) ? dateHeure(o.createdAt, 0) : '';
  const lignes = (Array.isArray(o.items) ? o.items : [])
    .filter((l): l is LigneCommande => !!l && typeof l === 'object');
  const reception = receptionDe({ reception: o.reception, items: lignes });
  const mode = reception.mode;
  const moyen = moyenPaiementDe(o);
  const lieu = reglages.lieux[reception.lieu];
  const plan = lienSur(lieu.lienMaps);
  const sansPrix = lignesSansPrix({ items: lignes }).length > 0;
  // Ancienne commande (prix de gros appliqué au sous-total seulement) : les montants
  // par ligne ne feraient pas le sous-total demandé. On n'affiche alors que les quantités.
  const montantsParLigne = lignesCollentAuSousTotal({ items: lignes, subtotal: o.subtotal });
  const total = formatPrice(Number(o.total) || 0);
  const adresse = o.shippingAddress || ({} as ShopOrder['shippingAddress']);
  const ville = texteClientSur(adresse.city, 60);
  const destinataire = texteClientSur(adresse.fullName, options.automatique ? 30 : 60) || nom;
  const villeComplete = [ville, adresse.region, adresse.postalCode].map(v => texteClientSur(v, 60)).filter(Boolean).join(' · ');
  const adresseRue = texteClientSur(adresse.address, 250);
  // Seuls les numéros marocains valables : un « +0077… » n'est pas un téléphone.
  const telephones = telephonesCommande(o).filter(t => /^212[5-8]\d{8}$/.test(telInternational(t))).map(telLisible);
  const reduction = Number(o.discount) > 0 ? Number(o.discount) : 0;
  const coupon = String(o.couponCode ?? '').trim();
  const pageCommande = lienPageCommande(o.id);

  // Les frais : jamais « 0 » ni « gratuite » pour un transport qui se chiffre au téléphone,
  // ni pour un colis à 0 DH qui n'a pas atteint le seuil de livraison offerte.
  const frais = Number(o.deliveryFee) || 0;
  const ligneFrais = mode === 'retrait'
    ? { libelle: 'Retrait', valeur: frais > 0 ? formatPrice(frais) : 'gratuit' }
    : mode === 'transport'
      ? { libelle: 'Transport', valeur: frais > 0 ? formatPrice(frais) : 'à confirmer par téléphone' }
      : {
        libelle: `Livraison${ville ? ` (${ville})` : ''}`,
        // Seuil sur la somme des lignes ; ancienne commande : ancienne livraison offerte (100 / 500 DH).
        valeur: frais > 0
          ? formatPrice(frais)
          : fraisColisAnnonces({ ...o, items: lignes }) === 'offerte' ? 'offerte' : 'à confirmer par téléphone',
      };

  // Pas de reprise de la note du client : n'importe qui peut créer une commande
  // avec l'adresse d'un autre, et ce texte libre partirait de la boîte de LEBTEX.
  const libelleTotal = moyen === 'virement'
    ? 'Total à payer par virement'
    : moyen === 'carte'
      ? 'Total à payer par carte'
      : mode === 'retrait'
        ? 'Total à payer au retrait'
        : mode === 'transport'
          ? 'Total des articles'
          : 'Total à payer à la livraison';
  const precisionsTotal = [
    sansPrix ? 'hors articles au prix à confirmer' : '',
    mode === 'transport' ? 'transport en plus, à confirmer par téléphone' : '',
  ].filter(Boolean).join(' ; ');

  const sujet = moment === 'recue'
    ? `Nous avons bien reçu votre commande n° ${surUneLigne(numero, 40)} — LEBTEX`
    : moment === 'prete'
      ? `Votre commande n° ${surUneLigne(numero, 40)} est prête à retirer — LEBTEX`
      : `Confirmation de votre commande n° ${surUneLigne(numero, 40)} — LEBTEX`;

  const titre = {
    recue: 'Commande bien reçue',
    confirmee: 'Commande confirmée',
    preparation: 'Commande en préparation',
    prete: 'Commande prête à retirer',
    en_route: mode === 'transport' ? 'Commande partie' : 'Commande en route',
  }[moment];

  // L'appel de confirmation est annoncé une seule fois, dans le bloc « … et paiement ».
  const ouverture = {
    recue: `Nous avons bien reçu votre commande n° ${numero}.`,
    confirmee: `Votre commande n° ${numero} est confirmée.`,
    preparation: `Votre commande n° ${numero} est confirmée et en cours de préparation.`,
    prete: `Votre commande n° ${numero} est prête : elle vous attend à ${lieu.nom}.`,
    en_route: mode === 'transport'
      ? `Votre commande n° ${numero} est confirmée et elle est partie avec notre chauffeur ou le transporteur convenu.`
      : `Votre commande n° ${numero} est confirmée et elle est en route avec notre société de livraison.`,
  }[moment];

  // ── Réception, selon le mode ──
  const horaires = `Horaires : ${lieu.horaires}.`;
  let receptionTextes: string[];
  if (mode === 'retrait') {
    const ou = `${lieu.nom} (${lieu.adresse})`;
    const payerSurPlace = moyen === 'cod' ? ' Le paiement se fait sur place, en espèces.' : '';
    receptionTextes = moment === 'recue'
      ? [
        'Nous vous appelons d’abord pour confirmer la commande.',
        `Elle sera préparée à ${ou}${delai ? `, prête sous ${delai}` : ''} : nous vous confirmons le jour de retrait par WhatsApp.`,
        `${horaires}${payerSurPlace}`,
      ]
      : moment === 'prete'
        ? [
          `Elle vous attend à ${ou}. ${horaires}`,
          `Donnez votre numéro de commande et votre nom ; quelqu’un peut venir à votre place avec ce numéro. Nous la gardons ${GARDE_RETRAIT_JOURS_OUVRES} jours ouvrés.${payerSurPlace}`,
        ]
        : [
          `Nous la préparons à ${ou}${delai ? `, prête sous ${delai}` : ''} : nous vous confirmons le jour de retrait par WhatsApp.`,
          `${horaires}${payerSurPlace}`,
        ];
  } else if (mode === 'transport') {
    const options = 'retrait gratuit à Casablanca, livraison par notre camionnette à Casablanca et environs, '
      + 'ou envoi par transporteur jusqu’à son dépôt dans votre ville, où vous récupérez la marchandise';
    receptionTextes = moment === 'recue'
      ? [
        'Votre commande contient un article volumineux (rouleau entier) : il ne part pas par colis.',
        `Nous vous appelons pour organiser le transport : ${options}.`,
        'Rien ne part avant votre accord sur le prix du transport.',
      ]
      : moment === 'en_route'
        ? ['Vérifiez les colis avant de signer.']
        : [
          `Nous organisons avec vous le transport de votre commande${delai ? ` (délai prévu : ${delai})` : ''}. Rien ne part avant votre accord sur le prix du transport.`,
        ];
  } else {
    const especes = moyen === 'cod' ? ' Le paiement se fait en espèces à la réception du colis.' : '';
    receptionTextes = moment === 'recue'
      ? [
        'Nous vous appelons d’abord pour confirmer la commande et l’adresse de livraison.',
        ...(delai ? [`Une fois la commande confirmée, la livraison est prévue sous ${delai}.`] : []),
        `Ensuite, notre société de livraison vous appellera avant de passer.${especes}`,
        'Le colis ne s’ouvre pas avant le paiement.',
      ]
      : [
        ...(delai ? [`La livraison est prévue sous ${delai}.`] : []),
        `Notre société de livraison vous appellera avant de passer.${especes}`,
        'Le colis ne s’ouvre pas avant le paiement.',
      ];
  }

  // ── Paiement autre qu'en espèces ──
  const paiementTextes: string[] = moyen === 'virement'
    ? [
      `Paiement par virement : indiquez le n° de commande ${numero} comme motif.`,
      `Notre RIB est affiché sur la page de votre commande${pageCommande ? ` : ${pageCommande}` : ` sur ${SITE_LISIBLE}`}. LEBTEX ne change jamais de RIB par message ni par e-mail.`,
      'La commande vous est remise dès que le virement est arrivé sur notre compte.',
    ]
    : moyen === 'carte'
      ? ['Paiement par carte bancaire : nous vous confirmons la marche à suivre au téléphone.']
      : [];

  const titreReception = mode === 'retrait' ? 'Retrait et paiement' : mode === 'transport' ? 'Transport et paiement' : 'Livraison et paiement';
  const question = 'Pour toute question, répondez simplement à cet e-mail.';
  const signature = `L’équipe LEBTEX — ${SITE_LISIBLE} — ${EMAIL_LEBTEX}`;

  // ── HTML ──
  const lignesHtml = lignes.map(l => {
    const prix = prixUnitaireLigne(l);
    const details = detailsVariante(l.variant)
      .map(d => `${d.libelle} : <strong style="color:${COULEUR.texte}">${echapperHtml(texteClientSur(d.valeur, 60))}</strong>`)
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

  const paragrapheHtml = (p: string) => `<p style="margin:0 0 8px;font-size:14px;color:${COULEUR.texte};line-height:1.55">${echapperHtml(p)}</p>`;
  // Un lien cliquable dans le paragraphe du RIB : l'adresse, échappée, et rien d'autre.
  const paragraphePaiementHtml = (p: string) => pageCommande && p.includes(pageCommande)
    ? `<p style="margin:0 0 8px;font-size:14px;color:${COULEUR.texte};line-height:1.55">${echapperHtml(p).replace(echapperHtml(pageCommande),
      `<a href="${echapperHtml(pageCommande)}" style="color:${COULEUR.rouge};font-weight:700">${echapperHtml(pageCommande)}</a>`)}</p>`
    : paragrapheHtml(p);

  const blocAdresse = mode === 'retrait'
    ? bloc(`${titreBloc('Lieu de retrait')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.55">
          <strong>${echapperHtml(lieu.nom)}</strong><br>${echapperHtml(lieu.adresse)}<br>${echapperHtml(lieu.horaires)}
        </p>
        ${plan ? `<p style="margin:8px 0 0;font-size:14px"><a href="${echapperHtml(plan)}" style="color:${COULEUR.rouge};font-weight:700">Voir le plan (Google Maps)</a></p>` : ''}
        <p style="margin:8px 0 0;font-size:14px;color:${COULEUR.texte}">Magasin : <strong>${echapperHtml(lieu.telephone)}</strong></p>
        <p style="margin:8px 0 0;font-size:14px;color:${COULEUR.texte}">Votre téléphone : <strong>${echapperHtml(telephones.join(' / ') || '—')}</strong></p>`)
    : bloc(`${titreBloc(mode === 'transport' ? 'Votre adresse' : 'Adresse de livraison')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.55" dir="auto">
          ${destinataire ? `<strong>${echapperHtml(destinataire)}</strong><br>` : ''}${echapperHtml(adresseRue) || '—'}<br>
          ${echapperHtml(villeComplete || '—')}
        </p>
        <p style="margin:8px 0 0;font-size:14px;color:${COULEUR.texte}">Téléphone : <strong>${echapperHtml(telephones.join(' / ') || '—')}</strong></p>`);

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
          ${ligneMontant(echapperHtml(ligneFrais.libelle), echapperHtml(ligneFrais.valeur))}
          ${reduction ? ligneMontant(`Réduction${coupon ? ` (${echapperHtml(coupon)})` : ''}`, `-${echapperHtml(formatPrice(reduction))}`) : ''}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;background:#FEF2F2;border-radius:12px">
          <tr><td style="padding:14px 16px">
            <p style="margin:0;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${libelleTotal}</p>
            <p style="margin:4px 0 0;color:${COULEUR.rouge};font-size:28px;font-weight:900;line-height:1.15">${echapperHtml(total)}</p>
            ${precisionsTotal ? `<p style="margin:4px 0 0;color:${COULEUR.doux};font-size:12px">${echapperHtml(precisionsTotal)}</p>` : ''}
          </td></tr>
        </table>`)}
      ${blocAdresse}
      ${bloc(`${titreBloc(titreReception)}
        ${receptionTextes.map(paragrapheHtml).join('')}
        ${paiementTextes.map(paragraphePaiementHtml).join('')}
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
      const variante = texteClientSur(varianteLisible(l.variant), 120);
      const montant = prixUnitaireLigne(l) <= 0 ? 'prix à confirmer' : montantsParLigne ? formatPrice(totalLigne(l)) : '';
      return `• ${quantiteDe(l.quantity)} × ${produitDe(l.productName)}${variante ? ` (${variante})` : ''}${montant ? ` : ${montant}` : ''}`;
    }),
    ...(lignes.length ? [] : ['—']),
    '',
    `Sous-total : ${formatPrice(Number(o.subtotal) || 0)}`,
    `${ligneFrais.libelle} : ${ligneFrais.valeur}`,
    ...(reduction ? [`Réduction${coupon ? ` (${coupon})` : ''} : -${formatPrice(reduction)}`] : []),
    `${libelleTotal.toUpperCase()} : ${total}${precisionsTotal ? ` (${precisionsTotal})` : ''}`,
    '',
    ...(mode === 'retrait'
      ? [
        'LIEU DE RETRAIT',
        lieu.nom,
        lieu.adresse,
        lieu.horaires,
        ...(plan ? [`Plan : ${plan}`] : []),
        `Magasin : ${lieu.telephone}`,
        `Votre téléphone : ${telephones.join(' / ') || '—'}`,
      ]
      : [
        mode === 'transport' ? 'VOTRE ADRESSE' : 'ADRESSE DE LIVRAISON',
        ...(destinataire ? [destinataire] : []),
        adresseRue || '—',
        villeComplete || '—',
        `Téléphone : ${telephones.join(' / ') || '—'}`,
      ]),
    '',
    ...receptionTextes,
    ...paiementTextes,
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
