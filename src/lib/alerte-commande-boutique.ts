// ─── E-mail « nouvelle commande » de la boutique ─────────────────────────────
// Ce que reçoit le commerçant dès qu'un client valide son panier sur lebtex.ma :
// de quoi rappeler le client depuis son téléphone sans ouvrir l'admin (numéros
// cliquables, WhatsApp avec le message de confirmation déjà écrit) et le détail
// exact de ce qu'il faut mettre dans le colis.
//
// Depuis le 29/09/2026, il dit aussi comment le client reçoit sa commande (colis
// Sendit, retrait à Derb Omar ou CHRIFA, transport d'un rouleau à organiser) et
// comment il paie (un virement se vérifie sur le compte avant de remettre quoi
// que ce soit). Le contrôle des frais de livraison est ici aussi : le navigateur
// du client les calcule, le serveur les recalcule avec la même grille.
//
// Pur (ni Firebase ni nodemailer) : testé par scripts/test-alerte-commande-boutique.ts.
// Tout ce qu'il y a dans une commande vient du navigateur du client (la création
// est ouverte à tous) : chaque valeur est échappée avant d'entrer dans le HTML.

import type { ShopOrder } from './shop-types';
import { formatPrice } from './shop-utils';
import {
  alerteEspeces, commandeAncienne, commandeMixte, CONSIGNE_COMMANDE_MIXTE, dateHeure, detailsVariante, fraisColisAnnonces,
  fraisColisAttendus, libelleMode, lienAppel, lienWhatsAppClient, lignesCollentAuSousTotal, lignesSansPrix, MENTION_LIGNE_ROULEAU,
  messageConfirmation, moyenPaiementDe, NOMS_LIEUX, nombreArticles, prixUnitaireLigne, receptionDe, telLisible, telephonesCommande,
  totalLigne, transportPrevu, varianteLisible, type LigneCommande,
} from './commandes-boutique';
import { fraisLivraison } from './livraison-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type ReglagesReception } from './reglages-reception';

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

// ─── Contrôle des frais de livraison ─────────────────────────────────────────
// Les frais sont calculés par le navigateur du client et écrits tels quels dans
// la commande : rien ne l'empêche d'y mettre 0. Le serveur les recalcule avec
// la grille de livraison-boutique (mode, ville, montant des lignes) et range le
// résultat dans shop_orders_interne/{id}.controleFrais ; la fiche prévient si
// ça ne colle pas. On ne corrige rien tout seul : l'équipe vérifie à l'appel.

export interface ControleFrais {
  /** Frais selon la grille ; null = transport à fixer au téléphone (aucun frais attendu). */
  attendus: number | null;
  /** Frais écrits dans la commande. */
  saisis: number;
  /** saisis − attendus (saisis tout court quand rien n'est attendu) ; 0 = tout va bien. */
  ecart: number;
}

export function controleFraisCommande(
  o: Pick<ShopOrder, 'reception' | 'items' | 'shippingAddress' | 'deliveryFee'> & { createdAt?: unknown },
): ControleFrais {
  const r = receptionDe(o);
  const brut = Number(o.deliveryFee);
  const saisis = Number.isFinite(brut) ? brut : 0;
  // Un rouleau commandé « à domicile » ne partira pas par Sendit : son transport se fixe au téléphone.
  const mode = r.volumineux && r.mode === 'domicile' ? 'transport' : r.mode;
  if (mode === 'domicile') {
    // Colis : le palier de la ville, plus jamais offert depuis le 30/09/2026 (une commande d'avant
    // garde la règle de sa date). Ancienne commande payée selon l'ancienne grille (25 à 50 DH) : rien à comparer.
    const attendus = fraisColisAttendus(o);
    if (attendus === null && commandeAncienne(o)) return { attendus: saisis, saisis, ecart: 0 };
    const cible = attendus ?? 0;
    return { attendus, saisis, ecart: Math.round((saisis - cible) * 100) / 100 };
  }
  const attendus = fraisLivraison({ mode, ville: String(o.shippingAddress?.city ?? '') });
  const ecart = attendus === null ? saisis : Math.round((saisis - attendus) * 100) / 100;
  return { attendus, saisis, ecart };
}

/** L'avertissement à montrer quand les frais ne collent pas, sinon null. */
export function messageControleFrais(c: ControleFrais | null | undefined): string | null {
  if (!c || !Number.isFinite(c.ecart) || Math.abs(c.ecart) < 0.5) return null;
  if (c.attendus === null) {
    return `Frais de livraison dans la commande : ${formatPrice(c.saisis)}, alors que le transport se fixe au téléphone. Vérifiez avec le client.`;
  }
  return `Frais de livraison dans la commande : ${formatPrice(c.saisis)} ; la grille donne ${formatPrice(c.attendus)} `
    + '(ville et montant des articles). Vérifiez pendant l’appel.';
}

// ─── Réception et paiement, en mots du commerçant ───────────────────────────

/** Ce qu'il faut faire de la commande, selon son mode : colis, retrait, transport. */
function receptionPourLeCommercant(o: ShopOrder, reglages: ReglagesReception): { titre: string; lignes: string[] } {
  const r = receptionDe(o);
  const ville = String(o.shippingAddress?.city ?? '').trim();
  if (r.mode === 'retrait') {
    const lieu = reglages.lieux[r.lieu];
    return {
      titre: `Retrait à ${NOMS_LIEUX[r.lieu]}`,
      lignes: [
        `Le client vient chercher sa commande à ${lieu.nom} (${lieu.adresse}).`,
        r.volumineux ? 'Rouleau(x) : préparer à CHRIFA.' : 'Petits articles : préparer à Derb Omar.',
        ...(commandeMixte(o) ? [CONSIGNE_COMMANDE_MIXTE] : []),
        'Fixer avec lui le jour de passage, puis lui envoyer le message « commande prête ».',
      ],
    };
  }
  if (r.mode === 'transport' || r.volumineux) {
    const prevu = transportPrevu(o);
    return {
      titre: 'Transport à organiser',
      lignes: [
        ...(r.mode === 'domicile' ? ['Rouleau commandé « à domicile » : Sendit ne le prend pas. Proposer le retrait à CHRIFA ou le transport.'] : []),
        prevu === 'camionnette'
          ? `Casablanca et environs${ville ? ` (${ville})` : ''} : camionnette LEBTEX, ou retrait gratuit à CHRIFA.`
          : `Autre ville${ville ? ` (${ville})` : ''} : transporteur de Derb Omar jusqu’à son dépôt, où le client récupère ; ou retrait gratuit à CHRIFA.`,
        ...(r.preferenceTransport ? [`Préférence du client : ${r.preferenceTransport}.`] : []),
        ...(commandeMixte(o) ? [CONSIGNE_COMMANDE_MIXTE] : []),
        'Annoncer le prix du transport au téléphone : rien ne part avant l’accord du client.',
      ],
    };
  }
  return { titre: 'Adresse de livraison (colis Sendit)', lignes: [] };
}

/** « Espèces à la livraison », « Virement — à vérifier sur le compte »… */
function paiementPourLeCommercant(o: ShopOrder): string {
  const moyen = moyenPaiementDe(o);
  if (moyen === 'virement') return 'Virement — à vérifier sur le compte avant de remettre la marchandise (motif : n° de commande)';
  if (moyen === 'carte') return 'Carte bancaire — à vérifier avant de remettre la marchandise';
  const { mode } = receptionDe(o);
  if (mode === 'retrait') return 'Espèces au retrait';
  if (mode === 'transport') return 'Espèces ou virement, à convenir au téléphone';
  return 'Espèces à la livraison (Sendit)';
}

/** Les frais tels que le commerçant doit les lire : « 20 MAD », « offerte », « 0 MAD (à vérifier) », « à confirmer ». */
function fraisPourLeCommercant(o: ShopOrder): { libelle: string; valeur: string } {
  const r = receptionDe(o);
  const ville = String(o.shippingAddress?.city ?? '').trim();
  const frais = Number(o.deliveryFee) || 0;
  if (r.mode === 'retrait') return { libelle: 'Retrait', valeur: frais > 0 ? formatPrice(frais) : 'gratuit' };
  if (r.mode === 'transport' || r.volumineux) {
    return { libelle: 'Transport', valeur: frais > 0 ? formatPrice(frais) : 'à confirmer par téléphone' };
  }
  // « offerte » : seulement une commande d'avant le 30/09/2026 qui atteignait le seuil de sa date.
  const annonce = fraisColisAnnonces(o);
  return {
    libelle: `Livraison${ville ? ` (${ville})` : ''}`,
    valeur: frais > 0 ? formatPrice(frais) : annonce === 'offerte' ? 'offerte' : `${formatPrice(0)} (à vérifier)`,
  };
}

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
  options: { reglages?: ReglagesReception; controleFrais?: ControleFrais | null } = {},
): { sujet: string; html: string; texte: string } {
  const reglages = options.reglages ?? REGLAGES_RECEPTION_DEFAUT;
  const r = receptionDe(o);
  const moyen = moyenPaiementDe(o);
  const reception = receptionPourLeCommercant(o, reglages);
  const paiement = paiementPourLeCommercant(o);
  const fraisAffiches = fraisPourLeCommercant(o);
  const alerteFrais = messageControleFrais(options.controleFrais);
  const alerteArgent = alerteEspeces(o);
  const mode = r.volumineux ? `VOLUMINEUX · ${libelleMode(r)}` : libelleMode(r);
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
  // Les adresses des magasins réglées par le patron, comme le reste de l'e-mail.
  const messageWhatsApp = messageConfirmation(o, maintenant, { reglages });
  const emailClient = emailDuClient(o);
  const adresse = o.shippingAddress || ({} as ShopOrder['shippingAddress']);
  // Le nom de livraison ne se répète que s'il diffère de celui du client.
  const destinataire = String(adresse.fullName ?? '').trim();
  const autreDestinataire = destinataire && destinataire !== nom ? destinataire : '';
  const villeComplete = [ville, adresse.region, adresse.postalCode].map(v => String(v ?? '').trim()).filter(Boolean).join(' · ');
  const reduction = Number(o.discount) > 0 ? Number(o.discount) : 0;
  const avertissementSansPrix = sansPrix.length
    ? `${sansPrix.length} article${sansPrix.length > 1 ? 's' : ''} sans prix : prix à fixer avec le client avant de confirmer.`
    : '';
  // Un rouleau : le prix du transport se fixe au téléphone, il n'est pas dans ce total.
  const transportEnPlus = r.mode === 'transport' || r.volumineux;
  const libelleTotal = moyen === 'virement'
    ? `Total à recevoir par virement${transportEnPlus ? ' (transport en plus)' : ''}`
    : moyen === 'carte'
      ? `Total à payer par carte${transportEnPlus ? ' (transport en plus)' : ''}`
      : transportEnPlus ? 'Total des articles (transport en plus)' : 'Total à encaisser';
  // Les avertissements à lire avant d'appeler, dans l'ordre : prix, frais, argent.
  const avertissements = [avertissementSansPrix, alerteFrais, alerteArgent].filter((a): a is string => !!a);

  // Le mode entre dans le sujet quand il change le travail : on le voit dès la boîte de réception.
  const etiquettes = [
    r.mode === 'retrait' ? libelleMode(r) : r.mode === 'transport' ? 'Transport à organiser' : '',
    moyen === 'virement' ? 'Virement' : moyen === 'carte' ? 'Carte' : '',
  ].filter(Boolean);
  const sujet = [
    `🛒 Nouvelle commande${r.volumineux ? ' (VOLUMINEUX)' : ''} — ${surUneLigne(nom)}${ville ? `, ${surUneLigne(ville, 40)}` : ''}`,
    `${total}${sansPrix.length ? ' + prix à fixer' : ''}`,
    `n° ${surUneLigne(o.orderNumber, 40)}`,
    ...(etiquettes.length ? [etiquettes.join(' · ')] : []),
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
        ${l.volumineux ? `<p style="margin:4px 0 0"><span style="display:inline-block;background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:900">${MENTION_LIGNE_ROULEAU}</span></p>` : ''}
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${echapperHtml(`${total} · ${mode} · ${nom}${ville ? ` · ${ville}` : ''}${tels[0] ? ` · ${telLisible(tels[0])}` : ''}`)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 12px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="background:${COULEUR.noir};padding:22px 24px;border-radius:18px 18px 0 0">
        <p style="margin:0 0 6px;color:${COULEUR.or};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.22em">Nouvelle commande sur lebtex.ma</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900" dir="auto">${echapperHtml(nom)}${ville ? ` <span style="color:#a8a29e;font-weight:700">· ${echapperHtml(ville)}</span>` : ''}</h1>
        <p style="margin:6px 0 0;color:#a8a29e;font-size:12px">Reçue ${echapperHtml(recue)} · n° ${echapperHtml(o.orderNumber)}</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:22px 24px 18px">
        ${r.volumineux ? `<p style="margin:0 0 10px"><span style="display:inline-block;background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:900;letter-spacing:0.08em">VOLUMINEUX — rouleau entier, pas de colis Sendit</span></p>` : ''}
        <p style="margin:0;color:${COULEUR.gris};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${libelleTotal}</p>
        <p style="margin:4px 0 0;color:${COULEUR.rouge};font-size:34px;font-weight:900;line-height:1.1">${total}</p>
        <p style="margin:6px 0 0;color:${COULEUR.texte};font-size:13px;font-weight:700">${echapperHtml(libelleMode(r))} · ${nbArticles} article${nbArticles > 1 ? 's' : ''}</p>
        <p style="margin:4px 0 0;color:${moyen === 'cod' ? COULEUR.gris : COULEUR.rouge};font-size:12px;font-weight:${moyen === 'cod' ? 600 : 800}">Paiement : ${echapperHtml(paiement)}</p>
        ${avertissements.map(a => `<p style="margin:12px 0 0;padding:10px 12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;color:${COULEUR.rouge};font-size:13px;font-weight:800">⚠ ${echapperHtml(a)}</p>`).join('')}
      </td></tr>
      ${bloc(`${titreBloc('Client')}
        <p style="margin:0 0 12px;font-size:17px;font-weight:800;color:${COULEUR.texte}" dir="auto">${echapperHtml(nom)}</p>
        ${telephonesHtml || `<p style="margin:0;font-size:13px;color:${COULEUR.rouge};font-weight:700">Aucun téléphone valable dans la commande.</p>`}
        ${emailClient ? `<p style="margin:12px 0 0;font-size:12px;color:${COULEUR.gris}">E-mail : ${echapperHtml(emailClient)}</p>` : ''}`)}
      ${bloc(`${titreBloc(echapperHtml(reception.titre))}
        ${reception.lignes.map(l => `<p style="margin:0 0 8px;font-size:14px;color:${COULEUR.texte};font-weight:700;line-height:1.5">${echapperHtml(l)}</p>`).join('')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.5" dir="auto">
          ${reception.lignes.length ? `<span style="color:${COULEUR.gris};font-size:12px">Adresse notée par le client :</span><br>` : ''}${autreDestinataire ? `<strong>${echapperHtml(autreDestinataire)}</strong><br>` : ''}${paragraphe(adresse.address) || '—'}<br>
          <strong>${echapperHtml(villeComplete || '—')}</strong>
        </p>`, r.mode === 'domicile' && !r.volumineux ? '#ffffff' : '#FFFBEB')}
      ${bloc(`${titreBloc('À mettre dans le colis')}
        <table width="100%" cellpadding="0" cellspacing="0">${lignesHtml}</table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
          ${ligneTotal('Sous-total', formatPrice(Number(o.subtotal) || 0))}
          ${ligneTotal(echapperHtml(fraisAffiches.libelle), echapperHtml(fraisAffiches.valeur))}
          ${reduction ? ligneTotal(`Réduction${o.couponCode ? ` (${echapperHtml(o.couponCode)})` : ''}`, `-${formatPrice(reduction)}`) : ''}
          ${ligneTotal(libelleTotal, total, true)}
        </table>
        ${prixDeGros ? `<p style="margin:10px 0 0;font-size:12px;color:${COULEUR.gris};font-style:italic">Prix de gros appliqué : le sous-total fait foi, pas le détail des lignes.</p>` : ''}`)}
      ${o.notes && String(o.notes).trim() ? bloc(`${titreBloc('Note du client')}
        <p style="margin:0;font-size:14px;color:${COULEUR.texte};line-height:1.5" dir="auto">${paragraphe(o.notes)}</p>`, '#FFFBEB') : ''}
      <tr><td style="background:#ffffff;padding:20px 24px 24px;border-top:1px solid ${COULEUR.trait}">
        <a href="${echapperHtml(lienAdmin)}" style="display:block;background:${COULEUR.rouge};color:#ffffff;text-align:center;padding:16px;border-radius:12px;font-size:16px;font-weight:900;text-decoration:none">Ouvrir la commande</a>
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid ${COULEUR.trait};padding:14px 24px;border-radius:0 0 18px 18px">
        <p style="margin:0;font-size:12px;color:${COULEUR.texte};font-weight:800">Promis au client : un appel aujourd'hui pendant les horaires (lundi au samedi, 8h30–18h30), sinon le jour ouvré suivant.</p>
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
    ...(r.volumineux ? ['*** VOLUMINEUX — rouleau entier, pas de colis Sendit ***'] : []),
    `${libelleTotal.toUpperCase()} : ${total} (${libelleMode(r)}, ${nbArticles} article${nbArticles > 1 ? 's' : ''})`,
    `Paiement : ${paiement}`,
    ...avertissements.map(a => `/!\\ ${a}`),
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
    reception.titre.toUpperCase(),
    ...reception.lignes,
    ...(reception.lignes.length ? ['Adresse notée par le client :'] : []),
    ...(autreDestinataire ? [autreDestinataire] : []),
    String(adresse.address ?? '').trim() || '—',
    villeComplete || '—',
    '',
    'À METTRE DANS LE COLIS',
    ...lignes.map(l => {
      const prix = prixUnitaireLigne(l);
      const variante = varianteLisible(l.variant);
      const montant = prix > 0 ? `${formatPrice(prix)} × ${l.quantity} = ${formatPrice(totalLigne(l))}` : 'PRIX À FIXER';
      return `• ${l.quantity} × ${l.productName}${variante ? ` (${variante})` : ''}${l.volumineux ? ` [${MENTION_LIGNE_ROULEAU}]` : ''} — ${montant}`;
    }),
    '',
    `Sous-total : ${formatPrice(Number(o.subtotal) || 0)}`,
    `${fraisAffiches.libelle} : ${fraisAffiches.valeur}`,
    ...(reduction ? [`Réduction${o.couponCode ? ` (${o.couponCode})` : ''} : -${formatPrice(reduction)}`] : []),
    `${libelleTotal} : ${total}`,
    ...(prixDeGros ? ['(Prix de gros appliqué : le sous-total fait foi, pas le détail des lignes.)'] : []),
    ...(o.notes && String(o.notes).trim() ? ['', 'NOTE DU CLIENT', String(o.notes).trim()] : []),
    '',
    `Ouvrir la commande : ${lienAdmin}`,
    '',
    'Promis au client : un appel aujourd’hui pendant les horaires (lundi au samedi, 8h30–18h30), sinon le jour ouvré suivant.',
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
