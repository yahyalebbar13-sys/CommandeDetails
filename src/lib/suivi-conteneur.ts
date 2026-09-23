// ─── Suivi des conteneurs ─────────────────────────────────────────────────────
// La compagnie maritime sait où est le conteneur ; ShipsGo interroge 160+
// compagnies et nous le redit dans un format unique. Ce fichier traduit leur
// réponse en ce que le dossier d'arrivage a besoin de savoir : où en est le
// conteneur, quand il touche le port, et depuis quand on le sait.
//
// Pur : aucun appel réseau, aucun Firestore — testé par
// scripts/test-suivi-conteneur.ts. Les appels vivent dans lib/shipsgo.ts.

import { isArrivalOlderThanOneMonth } from './status-utils';

// ─── Ce que ShipsGo renvoie ───────────────────────────────────────────────────
/** Étape du voyage vue par la compagnie (cf. OceanShipment.status). */
export type StatutSuivi =
  | 'NEW'         // créé, pas encore examiné par ShipsGo
  | 'INPROGRESS'  // la compagnie n'a encore rien publié
  | 'BOOKED'      // réservé, pas encore chargé
  | 'LOADED'      // chargé à bord, pas encore parti
  | 'SAILING'     // en mer
  | 'ARRIVED'     // navire à quai, conteneur pas encore déchargé
  | 'DISCHARGED'  // déchargé au port de destination
  | 'UNTRACKED';  // numéro inconnu de la compagnie

/** Mouvement élémentaire d'un conteneur (cf. OceanMovement.event). */
export type CodeEvenement = 'EMSH' | 'GTIN' | 'LOAD' | 'DEPA' | 'ARRV' | 'DISC' | 'GTOT' | 'EMRT';

// ─── Ce qu'on garde dans le dossier ───────────────────────────────────────────
export type EtapeSuivi = {
  code: CodeEvenement;
  /** Libellé français affichable. */
  libelle: string;
  /** true = c'est arrivé (ACT) ; false = c'est prévu (EST). */
  reel: boolean;
  /** yyyy-mm-dd, dans le fuseau du port — pas celui du navigateur. */
  date: string;
  lieu?: string;
  pays?: string;
  navire?: string;
  voyage?: string;
};

export type SuiviConteneur = {
  /** Identifiant ShipsGo du suivi — à garder, c'est lui qui évite de repayer. */
  shipmentId: number;
  /** Numéro envoyé à ShipsGo (conteneur ou Master BL). */
  reference: string;
  typeReference: TypeReference;
  statut: StatutSuivi;
  compagnie?: string;
  navire?: string;
  voyage?: string;
  portChargement?: string;
  /** yyyy-mm-dd */
  dateChargement?: string;
  portDechargement?: string;
  /**
   * yyyy-mm-dd — arrivée au port final : réelle si le navire y est arrivé (ou le
   * conteneur déchargé), sinon la dernière date annoncée. Le nom est historique :
   * c'est la date d'arrivée du dossier (cf. resumerShipment).
   */
  dateDechargement?: string;
  /** true quand dateDechargement est un fait, false quand c'est une prévision. */
  dateDechargementReelle: boolean;
  /** Prévision propre à ShipsGo, souvent plus juste que l'ETA de la compagnie. */
  dateDechargementPrevue?: string;
  /** 0 à 100 — part du trajet parcourue. */
  avancement?: number;
  /** Durée de transit estimée, en jours. */
  dureeTransit?: number;
  conteneurs: string[];
  /** Du plus ancien au plus récent. */
  etapes: EtapeSuivi[];
  /** Adresses que ShipsGo prévient lui-même à chaque étape de ce conteneur. */
  abonnes: { id: number; email: string }[];
  /** Carte publique ShipsGo — partageable avec un client. */
  lienCarte?: string;
  /** Dernière vérification chez la compagnie (ISO, UTC). */
  verifieLe?: string;
  /** Notre dernière synchronisation (ISO). */
  majLe: string;
  /** Dernière date d'arrivée que NOUS avons inscrite dans le dossier (cf. suivi-sync.ts). */
  dateAppliquee?: string;
  /** Obsolète : la date de la compagnie s'applique toujours. Effacée à chaque synchronisation. */
  dateProposee?: string;
  /** Clés des changements déjà annoncés — évite de prévenir deux fois du même. */
  notifie?: string[];
  /** Rempli quand la dernière synchronisation a échoué — l'ancien suivi reste lisible. */
  erreur?: string | null;
};

export type TypeReference = 'conteneur' | 'bl';

// ─── Libellés ─────────────────────────────────────────────────────────────────
/** `ton` reprend les couleurs de status-utils : même voyage, même code couleur. */
export const LIBELLE_STATUT: Record<StatutSuivi, { label: string; emoji: string; ton: string }> = {
  NEW:        { label: 'Suivi ouvert',        emoji: '🆕', ton: 'bg-stone-100 text-stone-600 border-stone-300' },
  INPROGRESS: { label: 'En attente compagnie', emoji: '⏳', ton: 'bg-stone-100 text-stone-600 border-stone-300' },
  BOOKED:     { label: 'Réservé',             emoji: '📋', ton: 'bg-amber-100 text-amber-700 border-amber-300' },
  LOADED:     { label: 'Chargé à bord',       emoji: '🏗️', ton: 'bg-amber-100 text-amber-700 border-amber-300' },
  SAILING:    { label: 'En mer',              emoji: '🚢', ton: 'bg-blue-100 text-blue-700 border-blue-300' },
  ARRIVED:    { label: 'Navire à quai',       emoji: '⚓', ton: 'bg-violet-100 text-violet-700 border-violet-300' },
  DISCHARGED: { label: 'Déchargé',            emoji: '🛃', ton: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  UNTRACKED:  { label: 'Numéro non reconnu',  emoji: '❓', ton: 'bg-red-100 text-red-700 border-red-300' },
};

export const LIBELLE_EVENEMENT: Record<CodeEvenement, string> = {
  EMSH: 'Conteneur vide remis au fournisseur',
  GTIN: 'Entré au port de départ',
  LOAD: 'Chargé à bord',
  DEPA: 'Départ du port',
  ARRV: 'Arrivée au port',
  DISC: 'Déchargé du navire',
  GTOT: 'Sorti du port',
  EMRT: 'Conteneur vide restitué',
};

/** Statuts qui n'apportent plus rien : inutile de redemander tous les jours. */
export function suiviTermine(suivi?: SuiviConteneur | null): boolean {
  return suivi?.statut === 'DISCHARGED';
}

// ─── Référence de suivi ───────────────────────────────────────────────────────
/**
 * Un numéro de conteneur s'écrit AAAA1234567 (4 lettres + 7 chiffres) ; tout le
 * reste est traité comme un Master BL ou un numéro de booking.
 *
 * Attention : le `noBL` des dossiers est souvent la référence du transitaire
 * (« 26HD1004 »), que la compagnie maritime ne connaît pas. C'est pourquoi la
 * référence de suivi se saisit à part.
 */
const MOTIF_CONTENEUR = /^[A-Z]{4}[0-9]{7}$/;

/** Majuscules, sans espaces ; les tirets ne sautent que pour un conteneur. */
export function normaliserReference(saisie: string): string {
  const brut = (saisie || '').toUpperCase().replace(/\s+/g, '');
  const sansTirets = brut.replace(/[-.]/g, '');
  return MOTIF_CONTENEUR.test(sansTirets) ? sansTirets : brut;
}

export function typeReference(reference: string): TypeReference {
  return MOTIF_CONTENEUR.test(reference) ? 'conteneur' : 'bl';
}

/**
 * Référence acceptable par ShipsGo ? Un conteneur au bon format, ou un booking
 * de 4 caractères minimum en lettres, chiffres, « / » et « - » (leur pattern).
 */
export function referenceValide(reference: string): boolean {
  if (typeReference(reference) === 'conteneur') return true;
  return /^[A-Z0-9/-]{4,64}$/.test(reference);
}

/**
 * Numéro à suivre pour ce dossier, sans rien demander à personne : celui déjà
 * suivi, sinon le n° de BL du dossier.
 *
 * Les dossiers portent de vrais connaissements de compagnie — `MEDUKV285573`
 * (MSC), `COSU9507719430` (COSCO), `ONEYNBOFK9752300` et `NB6IV3256800` (ONE),
 * `NBOZSL585700` (HMM) — que ShipsGo reconnaît comme Master BL. L'identifiant du
 * dossier (« 26MH114136 »), lui, n'est connu que du transitaire et ne sert pas.
 */
export function referenceDepuisDossier(facture: {
  noBL?: string | null;
  suivi?: { reference?: string } | null;
}): string | undefined {
  const deja = (facture?.suivi?.reference || '').trim();
  if (deja) return deja;
  const bl = normaliserReference(facture?.noBL || '');
  return bl && referenceValide(bl) ? bl : undefined;
}

/**
 * Date du jour en yyyy-mm-dd, à Casablanca. Un fuseau fixe : le serveur tourne
 * en UTC, le navigateur à l'heure marocaine, et tous deux doivent être d'accord
 * sur « la date d'arrivée est-elle passée ? » — autour de minuit surtout.
 */
export function aujourdHui(): string {
  try {
    // en-CA formate en yyyy-mm-dd.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** yyyy-mm-dd décalé de N jours (négatif = passé). */
function decalerJour(iso: string, jours: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/**
 * Statuts où la compagnie a vraiment vu le conteneur en chemin. NEW et
 * INPROGRESS n'en font pas partie : ils disent seulement que ShipsGo attend
 * encore la compagnie — rien sur le voyage.
 */
const STATUTS_EN_ROUTE = new Set<string>(['BOOKED', 'LOADED', 'SAILING', 'ARRIVED']);

/** Le suivi ouvert dit-il le conteneur encore en chemin ? */
export function suiviDitEnRoute(suivi?: { shipmentId?: number; statut?: string } | null): boolean {
  return Boolean(suivi?.shipmentId) && STATUTS_EN_ROUTE.has(suivi?.statut || '');
}

/**
 * Délai laissé à la compagnie pour répondre à un suivi tout juste ouvert
 * (NEW / INPROGRESS) quand la date d'arrivée du dossier est déjà passée — le
 * cas d'un dossier créé avec la date du jour par défaut. Au-delà, on referme.
 */
const JOURS_ATTENTE_COMPAGNIE = 7;

/**
 * La marchandise est-elle déjà en stock ? Un dossier réceptionné n'a plus de
 * suivi du tout : ni affiché, ni relu, ni mis à jour, ni annoncé aux clients.
 * `status: 'STOCK'` compte aussi : des dossiers anciens le portent sans date
 * d'entrée en stock.
 */
export function dossierEntreEnStock(facture: {
  stockEntryDate?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  return Boolean(facture?.stockEntryDate) || facture?.status === 'STOCK';
}

type DossierDate = {
  stockEntryDate?: string | null;
  status?: string | null;
  arrivalDate?: string | null;
  suivi?: { shipmentId?: number; statut?: string } | null;
};

/**
 * Le conteneur est-il déjà arrivé ? Le suivi ne concerne que les arrivages
 * attendus : entré en stock, ou date d'arrivée passée, c'est trop tard pour en
 * OUVRIR un (cf. dossierAOuvrir, synchroniserDossier).
 *
 * Exception : un suivi déjà ouvert où la compagnie dit le conteneur en chemin.
 * Un retard fait dépasser la date annoncée sans que rien ne soit arrivé, et
 * c'est justement la compagnie qui donnera la nouvelle date.
 *
 * `status` doit être celui ENREGISTRÉ dans le dossier, pas le statut d'affichage
 * que la liste des arrivages recalcule (« STOCK » dès un mois écoulé).
 */
export function dossierArrive(facture: DossierDate | null | undefined): boolean {
  if (dossierEntreEnStock(facture)) return true;
  if (suiviDitEnRoute(facture?.suivi)) return false;
  const eta = (facture?.arrivalDate || '').slice(0, 10);
  return Boolean(eta) && eta < aujourdHui();
}

/**
 * Le dossier est-il fermé au suivi ? Alors plus rien : ni panneau, ni pastille,
 * ni relecture, ni écriture, ni alerte — un conteneur arrivé n'a plus de suivi.
 * C'est la même règle que dossierArrive, avec un seul délai de grâce : un suivi
 * qui attend encore la première réponse de la compagnie (NEW / INPROGRESS) reste
 * ouvert quelques jours, le temps de savoir où est vraiment le conteneur.
 *
 * Même remarque sur `status` que pour dossierArrive.
 */
export function dossierVerrouille(facture: DossierDate | null | undefined): boolean {
  if (!dossierArrive(facture)) return false;
  if (dossierEntreEnStock(facture)) return true;
  const statut = facture?.suivi?.shipmentId ? facture.suivi.statut : undefined;
  if (statut === 'NEW' || statut === 'INPROGRESS') {
    const eta = (facture?.arrivalDate || '').slice(0, 10);
    return eta < decalerJour(aujourdHui(), -JOURS_ATTENTE_COMPAGNIE);
  }
  return true;
}

/**
 * Le suivi de ce dossier vaut-il un crédit ?
 *
 * Il sert à savoir quand la marchandise arrive — donc uniquement pour ce qui
 * n'est pas encore arrivé. Sont écartés : un dossier déjà suivi, sans numéro
 * exploitable, entré en stock, ou dont la date d'arrivée est passée (le
 * conteneur est alors au port ou en dédouanement, la compagnie n'a plus rien à
 * annoncer). Un dossier sans date, lui, mérite le suivi : c'est justement la
 * compagnie qui donnera l'ETA.
 */
export function dossierAOuvrir(facture: {
  noBL?: string | null;
  stockEntryDate?: string | null;
  status?: string | null;
  arrivalDate?: string | null;
  suivi?: { shipmentId?: number; reference?: string; statut?: string } | null;
}): boolean {
  if (facture?.suivi?.shipmentId) return false;
  if (!referenceDepuisDossier(facture)) return false;
  return !dossierArrive(facture);
}

// ─── Compagnie maritime ───────────────────────────────────────────────────────
// ShipsGo identifie les compagnies par un code de quatre caractères, proche du
// SCAC mais pas toujours identique — Wan Hai vaut « 22AA » chez eux, et PIL se
// dit « PCIU » et non « PILU », qui n'est qu'un préfixe de conteneur. Ces codes
// ont été confrontés un par un à leur catalogue (GET /ocean/carriers, 206
// compagnies) le 21 septembre 2026. Un code inconnu ferait rejeter la demande,
// alors qu'en l'absence de code ShipsGo devine seul : dans le doute, on n'envoie
// rien.
const SCAC_PAR_NOM: { motif: RegExp; scac: string }[] = [
  { motif: /\bMSC\b|MEDITERRANEAN SHIPPING/i, scac: 'MSCU' },
  { motif: /MAERSK/i,                          scac: 'MAEU' },
  { motif: /CMA|CGM/i,                         scac: 'CMDU' },
  { motif: /HAPAG|LLOYD/i,                     scac: 'HLCU' },
  { motif: /\bZIM\b/i,                         scac: 'ZIMU' },
  { motif: /\bONE\b|OCEAN NETWORK/i,           scac: 'ONEY' },
  { motif: /EVERGREEN/i,                       scac: 'EGLV' },
  { motif: /COSCO/i,                           scac: 'COSU' },
  { motif: /OOCL/i,                            scac: 'OOLU' },
  { motif: /YANG ?MING/i,                      scac: 'YMLU' },
  { motif: /\bPIL\b|PACIFIC INTERNATIONAL/i,   scac: 'PCIU' },
  { motif: /HAMBURG/i,                         scac: 'SUDU' },
  { motif: /\bWAN ?HAI\b/i,                    scac: '22AA' },
  { motif: /\bHMM\b|HYUNDAI/i,                 scac: 'HDMU' },
  { motif: /SEALAND/i,                         scac: 'SEJJ' },
  // Lignes méditerranéennes courantes sur Casablanca et Tanger-Med.
  { motif: /ARKAS/i,                           scac: 'ARKU' },
  { motif: /MARFRET/i,                         scac: 'MFTU' },
  { motif: /TARROS/i,                          scac: 'GETU' },
  { motif: /MESSINA/i,                         scac: 'LMCU' },
  { motif: /GRIMALDI/i,                        scac: 'GRIU' },
];

/** Préfixes de conteneur sans ambiguïté sur la compagnie propriétaire. */
const SCAC_PAR_PREFIXE: Record<string, string> = {
  MSCU: 'MSCU', MSDU: 'MSCU', MEDU: 'MSCU',
  MAEU: 'MAEU', MRKU: 'MAEU', MSKU: 'MAEU',
  CMAU: 'CMDU', CGMU: 'CMDU', CMDU: 'CMDU',
  HLCU: 'HLCU', HLXU: 'HLCU',
  ZIMU: 'ZIMU', ONEY: 'ONEY', TLLU: 'ONEY',
  EGLV: 'EGLV', EGHU: 'EGLV',
  COSU: 'COSU', CSNU: 'COSU', OOLU: 'OOLU',
  YMLU: 'YMLU', PILU: 'PCIU', SUDU: 'SUDU',
  WHLU: '22AA', WHSU: '22AA',
};

/** Code SCAC à transmettre à ShipsGo, ou undefined si on n'est pas sûr. */
export function scacDeLaCompagnie(nomCompagnie?: string | null, reference?: string | null): string | undefined {
  const nom = (nomCompagnie || '').trim();
  if (nom) {
    const trouve = SCAC_PAR_NOM.find(c => c.motif.test(nom));
    if (trouve) return trouve.scac;
  }
  const ref = (reference || '').toUpperCase();
  if (typeReference(ref) === 'conteneur') return SCAC_PAR_PREFIXE[ref.slice(0, 4)];
  return undefined;
}

// ─── Lecture de la réponse ShipsGo ────────────────────────────────────────────
/**
 * Garde le jour tel que le port le vit. Les horodatages arrivent en ISO avec
 * leur décalage (« 2026-03-18T12:00:00+02:00 ») : découper la chaîne conserve
 * cette date locale, alors que passer par Date() la décalerait d'un jour selon
 * le fuseau du serveur.
 */
export function jourDe(horodatage?: string | null): string | undefined {
  if (!horodatage) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(horodatage).trim());
  return m ? m[1] : undefined;
}

/**
 * Instant en millisecondes, ou undefined si illisible. ShipsGo date ses
 * vérifications en UTC sans le dire (« 2026-03-10 04:12:00 ») : sans le « Z »,
 * JavaScript lirait l'heure locale du serveur et deux événements pourraient
 * paraître inversés.
 */
export function instantDe(horodatage?: string | null): number | undefined {
  const s = String(horodatage || '').trim();
  if (!s) return undefined;
  const normalise = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
  const t = Date.parse(normalise);
  return Number.isNaN(t) ? undefined : t;
}

type ShipmentBrut = any;

/**
 * Deux libellés de lieu désignent-ils le même port ?
 *
 * ShipsGo n'écrit pas toujours pareil selon qu'il s'agit d'une escale ou de la
 * destination : « CASABLANCA », « Casablanca, Morocco », « TANGER (TANGIER) ».
 * On compare sur les lettres seules, dans un sens ou dans l'autre, et on
 * refuse de conclure sur un libellé trop court.
 */
export function memeLieu(a?: string | null, b?: string | null): boolean {
  const net = (s?: string | null) =>
    (s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z]/g, '');
  const x = net(a);
  const y = net(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Retire les clés dont la valeur est `undefined`, en profondeur.
 *
 * Firestore REFUSE `undefined` : `{ navire: undefined }` fait lever l'écriture
 * entière, alors qu'une clé absente ne pose aucun problème. Comme presque tout
 * est facultatif dans une réponse ShipsGo (pas de navire avant le chargement,
 * pas de voyage sur un mouvement à quai, pas de route sur un suivi qui vient
 * d'être ouvert), un suivi non nettoyé n'est jamais enregistrable.
 */
export function sansIndefinis<T>(valeur: T): T {
  if (Array.isArray(valeur)) return valeur.map(v => sansIndefinis(v)) as unknown as T;
  if (valeur && typeof valeur === 'object' && !(valeur instanceof Date)) {
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      if (v !== undefined) sortie[cle] = sansIndefinis(v);
    }
    return sortie as T;
  }
  return valeur;
}

/**
 * Traduit la réponse `GET /ocean/shipments/{id}` en ce qu'on stocke.
 * Le résultat ne contient aucune clé `undefined` : il part tel quel en base.
 */
export function resumerShipment(shipment: ShipmentBrut, maintenant = new Date()): SuiviConteneur {
  const route = shipment?.route || null;
  const conteneurs: any[] = Array.isArray(shipment?.containers) ? shipment.containers : [];

  // Un Master BL porte plusieurs conteneurs qui voyagent ensemble : leurs
  // mouvements sont identiques et feraient une frise en double, en triple…
  // On les fusionne sur (événement, date, lieu).
  const etapesDu = (c: any): EtapeSuivi[] =>
    (Array.isArray(c?.movements) ? c.movements : [])
      .filter((m: any) => m?.event && m?.timestamp && LIBELLE_EVENEMENT[m.event as CodeEvenement])
      .map((m: any): EtapeSuivi => ({
        code: m.event,
        libelle: LIBELLE_EVENEMENT[m.event as CodeEvenement],
        reel: m.status === 'ACT',
        date: jourDe(m.timestamp) || '',
        lieu: m.location?.name || undefined,
        pays: m.location?.country?.name || undefined,
        navire: m.vessel?.name || undefined,
        voyage: m.voyage || undefined,
      }))
      .filter((e: EtapeSuivi) => Boolean(e.date));
  const vues = new Set<string>();
  const etapes: EtapeSuivi[] = conteneurs
    .flatMap(etapesDu)
    .filter(e => {
      const cle = `${e.code}|${e.date}|${e.lieu || ''}|${e.reel}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Le navire porteur est celui du dernier embarquement RÉELLEMENT effectué :
  // en transbordement, la dernière étape connue est souvent le prochain départ,
  // encore prévisionnel, et annoncer ce navire-là serait faux. Avant le premier
  // chargement, on se rabat sur le navire annoncé — c'est tout ce qu'on a.
  const dernierNavire =
    [...etapes].reverse().find(e => e.navire && e.reel && (e.code === 'LOAD' || e.code === 'DEPA')) ||
    [...etapes].reverse().find(e => e.navire);

  const dechargement = route?.port_of_discharge || null;
  const portFinal = dechargement?.location?.name;

  // Un conteneur pour Casablanca est presque toujours déchargé en route, à
  // Algeciras ou Tanger, pour changer de navire. Ce déchargement-là est un
  // transbordement, pas une arrivée : le prendre pour l'arrivée finale
  // avancerait la date du dossier de plusieurs semaines, déclencherait une
  // fausse alerte et ferait passer en stock une marchandise encore en mer.
  //
  // On ne retient donc un déchargement comme définitif que s'il a lieu au port
  // de destination. Dans le doute — libellés de ports qui ne se ressemblent
  // pas — on garde la date annoncée, quitte à la corriger plus tard.
  //
  // La date d'arrivée du dossier est celle de l'ARRIVÉE AU PORT FINAL, lue dans
  // les étapes de la compagnie — celles de la frise — et affichée telle quelle
  // dans la pastille « Attendu : Arrivée » : un seul chiffre partout, qui bouge
  // à chaque nouvelle annonce. Pour chaque conteneur : arrivée réelle du navire,
  // sinon déchargement réel, sinon la dernière arrivée annoncée, sinon le
  // dernier déchargement annoncé. Le dossier suit le conteneur qui arrive le
  // plus tard, et n'est « arrivé pour de vrai » que quand tous le sont : un BL
  // éclaté sur deux navires n'est pas livré quand le premier accoste.
  const auPortArrivee = (e: EtapeSuivi) => memeLieu(e.lieu, portFinal);
  // Sans escale annoncée, un déchargement réel ne peut être que celui d'arrivée.
  const sansEscale = Boolean(route) && Number(route?.ts_count) === 0;
  const arriveeDuConteneur = (siennes: EtapeSuivi[]): { date: string; reelle: boolean } | undefined => {
    const recentes = [...siennes].sort((a, b) => b.date.localeCompare(a.date));
    const reelle =
      recentes.find(e => e.code === 'ARRV' && e.reel && auPortArrivee(e))
      ?? recentes.find(e => e.code === 'DISC' && e.reel && (auPortArrivee(e) || sansEscale));
    if (reelle) return { date: reelle.date, reelle: true };
    const annoncee = (code: CodeEvenement) =>
      siennes.filter(e => e.code === code && !e.reel && auPortArrivee(e)).map(e => e.date).sort().pop();
    const date = annoncee('ARRV') ?? annoncee('DISC');
    return date ? { date, reelle: false } : undefined;
  };
  const avecEtapes = conteneurs.map(etapesDu).filter(l => l.length > 0);
  const arrivees = avecEtapes.map(arriveeDuConteneur);
  const connues = arrivees.filter((a): a is { date: string; reelle: boolean } => Boolean(a));
  const derniere = connues.map(a => a.date).sort().pop();
  // Un conteneur sans étape au port final n'y est pas encore arrivé pour autant.
  const toutesReelles = connues.length > 0 && connues.length === arrivees.length && connues.every(a => a.reelle);
  const dateReelle = toutesReelles ? derniere : undefined;
  const eta = derniere ?? jourDe(dechargement?.date_of_discharge);

  const reference = shipment?.container_number || shipment?.booking_number || '';

  return sansIndefinis({
    shipmentId: Number(shipment?.id),
    reference,
    typeReference: shipment?.container_number ? 'conteneur' : 'bl',
    statut: (shipment?.status as StatutSuivi) || 'NEW',
    compagnie: shipment?.carrier?.name || undefined,
    navire: dernierNavire?.navire,
    voyage: dernierNavire?.voyage,
    portChargement: route?.port_of_loading?.location?.name || undefined,
    dateChargement: jourDe(route?.port_of_loading?.date_of_loading),
    portDechargement: dechargement?.location?.name || undefined,
    dateDechargement: dateReelle || eta,
    dateDechargementReelle: Boolean(dateReelle),
    dateDechargementPrevue: jourDe(dechargement?.date_of_discharge_predicted),
    avancement: typeof route?.transit_percentage === 'number' ? route.transit_percentage : undefined,
    dureeTransit: typeof route?.transit_time === 'number' ? route.transit_time : undefined,
    conteneurs: conteneurs.map((c: any) => c?.number).filter((n: any) => n && n !== 'NOT_ASSIGNED'),
    etapes,
    abonnes: (Array.isArray(shipment?.followers) ? shipment.followers : [])
      .filter((f: any) => f?.email)
      .map((f: any) => ({ id: Number(f.id) || 0, email: String(f.email) })),
    lienCarte: shipment?.tokens?.map
      ? `https://map.shipsgo.com/ocean/shipments/${shipment.id}?token=${shipment.tokens.map}`
      : undefined,
    verifieLe: shipment?.checked_at || undefined,
    majLe: maintenant.toISOString(),
  });
}

// ─── Ce qu'on en fait dans le dossier ─────────────────────────────────────────
/**
 * Date d'arrivée à inscrire dans le dossier : l'arrivée au port de destination
 * — réelle si elle a eu lieu, la dernière annoncée sinon. C'est la date dont
 * dépend déjà le statut affiché (cf. status-utils.ts), d'où le dédouanement
 * enchaîne.
 */
export function dateArriveeDuSuivi(suivi?: SuiviConteneur | null): string | undefined {
  if (!suivi || suivi.statut === 'UNTRACKED') return undefined;
  return suivi.dateDechargement;
}

/** Dernière étape franchie (la plus récente des étapes réelles). */
export function derniereEtape(suivi?: SuiviConteneur | null): EtapeSuivi | undefined {
  if (!suivi?.etapes?.length) return undefined;
  return [...suivi.etapes].reverse().find(e => e.reel);
}

/**
 * Prochaine étape attendue (la plus proche des étapes prévues). Une prévision
 * antérieure à la dernière étape franchie est périmée — la compagnie laisse
 * parfois l'escale « prévue » après l'avoir passée : on ne l'annonce pas.
 */
export function prochaineEtape(suivi?: SuiviConteneur | null): EtapeSuivi | undefined {
  const franchie = derniereEtape(suivi)?.date || '';
  return suivi?.etapes?.find(e => !e.reel && e.date >= franchie);
}

/** L'étape est-elle au port final (Casablanca), et non une escale ? */
export function auPortFinal(etape: EtapeSuivi | undefined, suivi?: SuiviConteneur | null): boolean {
  return Boolean(etape) && memeLieu(etape?.lieu, suivi?.portDechargement);
}

/**
 * Un dossier mérite-t-il une synchronisation ? On ne redemande pas un conteneur
 * déjà déchargé ni un arrivage clos : chaque appel est gratuit, mais interroger
 * 200 vieux dossiers chaque nuit n'apprend rien.
 */
export function dossierASynchroniser(facture: {
  suivi?: SuiviConteneur | null;
  stockEntryDate?: string | null;
  status?: string | null;
}): boolean {
  if (!facture?.suivi?.shipmentId) return false;
  if (dossierEntreEnStock(facture)) return false;
  return !suiviTermine(facture.suivi);
}
