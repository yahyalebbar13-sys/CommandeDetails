// ─── Suivi des conteneurs ─────────────────────────────────────────────────────
// La compagnie maritime sait où est le conteneur ; ShipsGo interroge 160+
// compagnies et nous le redit dans un format unique. Ce fichier traduit leur
// réponse en ce que le dossier d'arrivage a besoin de savoir : où en est le
// conteneur, quand il touche le port, et depuis quand on le sait.
//
// Pur : aucun appel réseau, aucun Firestore — testé par
// scripts/test-suivi-conteneur.ts. Les appels vivent dans lib/shipsgo.ts.

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
  /** yyyy-mm-dd — date réelle si le conteneur est déchargé, sinon l'ETA annoncée. */
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
  /**
   * Dernière date d'arrivée que NOUS avons inscrite dans le dossier. Si la date
   * du dossier s'en écarte, c'est qu'une main humaine est passée après nous :
   * on cesse alors de l'écraser (cf. suivi-sync.ts).
   */
  dateAppliquee?: string;
  /** Date annoncée par la compagnie mais non appliquée, parce qu'elle contredit une saisie manuelle. */
  dateProposee?: string;
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

// ─── Compagnie maritime ───────────────────────────────────────────────────────
// ShipsGo identifie les compagnies par leur code SCAC (4 lettres). Le dossier,
// lui, garde un nom saisi à la main (« MSC », « CMA CGM »…). La table couvre les
// compagnies rencontrées sur nos lignes ; le préfixe du numéro de conteneur sert
// de secours. Sans correspondance on n'envoie rien : ShipsGo devine seul.
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
  { motif: /\bPIL\b|PACIFIC INTERNATIONAL/i,   scac: 'PILU' },
  { motif: /HAMBURG/i,                         scac: 'SUDU' },
  { motif: /ARKAS/i,                           scac: 'ARKU' },
  { motif: /\bWAN ?HAI\b/i,                    scac: 'WHLC' },
  { motif: /\bHMM\b|HYUNDAI/i,                 scac: 'HDMU' },
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
  YMLU: 'YMLU', PILU: 'PILU', SUDU: 'SUDU',
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
  const vues = new Set<string>();
  const etapes: EtapeSuivi[] = conteneurs
    .flatMap((c: any) => (Array.isArray(c?.movements) ? c.movements : []))
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
    .filter(e => {
      if (!e.date) return false;
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
  // Dernier déchargement réel : sous un Master BL, la marchandise n'est à terre
  // que quand le dernier conteneur est descendu, pas le premier.
  const dateReelle = [...etapes].reverse().find(e => e.code === 'DISC' && e.reel)?.date;
  const eta = jourDe(dechargement?.date_of_discharge);

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
 * Date d'arrivée à inscrire dans le dossier : le déchargement au port de
 * destination — réel s'il a eu lieu, annoncé sinon. C'est la date dont dépend
 * déjà le statut affiché (cf. status-utils.ts), d'où le dédouanement enchaîne.
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

/** Prochaine étape attendue (la plus proche des étapes prévues). */
export function prochaineEtape(suivi?: SuiviConteneur | null): EtapeSuivi | undefined {
  return suivi?.etapes?.find(e => !e.reel);
}

/**
 * Un dossier mérite-t-il une synchronisation ? On ne redemande pas un conteneur
 * déjà déchargé ni un arrivage clos : chaque appel est gratuit, mais interroger
 * 200 vieux dossiers chaque nuit n'apprend rien.
 */
export function dossierASynchroniser(facture: {
  suivi?: SuiviConteneur | null;
  stockEntryDate?: string | null;
}): boolean {
  if (!facture?.suivi?.shipmentId) return false;
  if (facture.stockEntryDate) return false;
  return !suiviTermine(facture.suivi);
}
