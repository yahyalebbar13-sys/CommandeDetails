"use client";

// ─── La fiche d'une commande, côté client ─────────────────────────────────────
// Ce que le client ouvre en touchant une de ses commandes : où elle en est
// parmi les six étapes du parcours, avec toutes les dates que l'on connaît ;
// le voyage du conteneur quand la compagnie maritime le publie ; le détail de
// ce qu'il a commandé ; et ce qu'il peut en faire sans téléphoner (recommander,
// organiser la livraison, poser une question, écrire sur WhatsApp, garder la
// fiche en PDF).
//
// Ne reçoit que des données déjà assainies par le serveur
// (cf. lib/portail-client-donnees.ts) : un prix d'achat ou un fournisseur ne
// peut pas s'afficher ici, il n'arrive jamais jusqu'au navigateur. Toutes les
// dates sont des jours 'yyyy-mm-dd', comparés tels quels — jamais convertis
// dans le fuseau du navigateur, qui décalerait une arrivée d'un jour.

import React, { useState } from 'react';
import {
  X,
  Package,
  ClipboardList,
  Factory,
  Ship,
  FileText,
  PackageCheck,
  Truck,
  Check,
  CalendarClock,
  MapPin,
  ExternalLink,
  Repeat,
  MessageCircle,
  MessageCircleQuestion,
  FileDown,
  LoaderCircle,
  ZoomIn,
  Anchor,
  Info,
  Route,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { CommandeClient, ConteneurClient } from '@/lib/portail-client-donnees';
import type { TypeDemande } from '@/lib/demandes-client';
import { ETAPES_CLIENT, dateFr, etapeClient, nombreFr, rangEtape, type EtapeClient } from '@/lib/statut-client';
import { libelleUnite } from '@/lib/unites-pole';

type Etape = NonNullable<NonNullable<ConteneurClient['suivi']>['etapes']>[number];

// ─── Les mots ─────────────────────────────────────────────────────────────────

/** Unités au singulier / au pluriel, comme on les dit à un client. */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'],
  'rolls': ['rouleau', 'rouleaux'],
  'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'],
  'bag': ['sac', 'sacs'],
  'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};

const UNITES_PIECES = ['', 'u', 'unité', 'unités', 'pc', 'pcs', 'pièce', 'pièces', 'piece', 'pieces'];

function motsUnite(unite?: string): [string, string] {
  const u = (unite || '').trim();
  const connue = UNITES_DITES[u] || UNITES_DITES[u.toLowerCase()];
  if (connue) return connue;
  if (UNITES_PIECES.includes(u.toLowerCase())) return ['pièce', 'pièces'];
  const libelle = libelleUnite(u).toLowerCase();
  return [libelle, libelle];
}

/** « 1 000 mètres », « 1 rouleau », « 1,5 mètre » : en français, le pluriel commence à 2. */
function quantiteDite(q: unknown, unite?: string): string {
  const n = Number(q) || 0;
  const [un, plusieurs] = motsUnite(unite);
  return `${nombreFr(n)} ${Math.abs(n) >= 2 ? plusieurs : un}`;
}

/** Le mot de l'unité seule, au singulier : « mètre », « rouleau », « pièce ». */
const uniteSeule = (unite?: string) => motsUnite(unite)[0];

const jours = (n: number) => `${nombreFr(n)} jour${n >= 2 ? 's' : ''}`;

function dansNJours(n: number): string {
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  return `dans ${jours(n)}`;
}

// ─── Les dates ────────────────────────────────────────────────────────────────

/** Aujourd'hui, en jour local 'yyyy-mm-dd' (comparable aux dates des commandes). */
function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le jour d'une date, s'il est lisible ; rien sinon. */
function jour(iso?: string | null): string | undefined {
  const j = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : undefined;
}

/** Nombre de jours de `de` à `a` (négatif si `a` est avant). */
function joursEntre(de: string, a: string): number {
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = a.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Les étapes du voyage qui disent encore quelque chose. La compagnie laisse
 * parfois une escale « prévue » après l'avoir passée : une prévision plus
 * ancienne que la dernière étape franchie est périmée, on ne l'annonce pas.
 */
function etapesDuVoyage(etapes?: Etape[]): Etape[] {
  const liste = Array.isArray(etapes) ? etapes : [];
  const franchie = [...liste].reverse().find(e => e.reel)?.date || '';
  return liste.filter(e => e.reel || e.date >= franchie);
}

type Repere = {
  /** « Arrivée prévue le 12/10/2026 ». */
  texte: string;
  /** Prévision (dans le futur), par opposition à un fait. */
  prevu: boolean;
  /** « dans 12 jours ». */
  relatif?: string;
  /** Date annoncée au départ, quand la compagnie l'a changée depuis. */
  initialement?: string;
};

type Dates = {
  commandee?: string;
  depart?: { jour: string; prevu: boolean };
  arrivee?: { jour: string; prevu: boolean };
  arriveeInitiale?: string;
  entrepot?: { jour: string; prevu: boolean };
};

/** Toutes les dates connues d'une commande, chacune dite fait ou prévision. */
function datesDeLaCommande(c: CommandeClient, k: ConteneurClient | undefined, aujourdhui: string): Dates {
  const etapes = etapesDuVoyage(k?.suivi?.etapes);
  // Départ : le départ réel du navire s'il est connu, sinon la date d'embarquement
  // du dossier, sinon le départ que la compagnie annonce.
  const departReel = etapes.find(e => e.reel && e.code === 'DEPA')?.date;
  const departAnnonce = etapes.find(e => !e.reel && e.code === 'DEPA')?.date;
  const depart = jour(departReel) || jour(k?.embarqueLe) || jour(departAnnonce);
  const arrivee = jour(k?.arriveeLe) || jour(c.arriveeLe);
  const entrepot = jour(c.entrepotLe) || jour(k?.entrepotLe);
  const initiale = jour(k?.arriveeInitiale);
  return {
    commandee: jour(c.commandeeLe),
    depart: depart ? { jour: depart, prevu: !departReel && depart > aujourdhui } : undefined,
    arrivee: arrivee ? { jour: arrivee, prevu: arrivee > aujourdhui } : undefined,
    arriveeInitiale: initiale && arrivee && initiale !== arrivee ? initiale : undefined,
    entrepot: entrepot ? { jour: entrepot, prevu: entrepot > aujourdhui } : undefined,
  };
}

/** Ce que l'on peut dire, date à l'appui, de chaque étape du parcours. */
function reperesDesEtapes(d: Dates, rang: number, aujourdhui: string): Partial<Record<EtapeClient, Repere>> {
  const reperes: Partial<Record<EtapeClient, Repere>> = {};
  if (d.commandee) reperes.enregistree = { texte: `Commandée le ${dateFr(d.commandee)}`, prevu: false };
  if (d.depart) {
    reperes.mer = d.depart.prevu
      ? { texte: `Départ prévu le ${dateFr(d.depart.jour)}`, prevu: true, relatif: dansNJours(joursEntre(aujourdhui, d.depart.jour)) }
      : { texte: `Départ le ${dateFr(d.depart.jour)}`, prevu: false };
  }
  if (d.arrivee) {
    reperes.douane = d.arrivee.prevu
      ? { texte: `Arrivée prévue le ${dateFr(d.arrivee.jour)}`, prevu: true, relatif: dansNJours(joursEntre(aujourdhui, d.arrivee.jour)) }
      : { texte: `Arrivée au port le ${dateFr(d.arrivee.jour)}`, prevu: false };
    // L'ancienne date n'a plus d'intérêt une fois la marchandise chez nous.
    if (d.arriveeInitiale && rang < rangEtape('prete')) reperes.douane.initialement = dateFr(d.arriveeInitiale);
  }
  if (d.entrepot) {
    const rangPrete = rangEtape('prete');
    reperes.prete = d.entrepot.prevu
      ? { texte: `Entrée en entrepôt prévue le ${dateFr(d.entrepot.jour)}`, prevu: true }
      : { texte: `${rang === rangPrete ? 'Dans notre entrepôt depuis le' : 'Entrée en entrepôt le'} ${dateFr(d.entrepot.jour)}`, prevu: false };
  }
  return reperes;
}

/** Une ligne sous l'étape en cours, quand aucune date ne dit mieux. */
const NOTE_EN_COURS: Record<EtapeClient, string> = {
  enregistree: 'Bientôt lancée en fabrication',
  fabrication: 'Chez notre fournisseur',
  mer: 'À bord, en route vers le Maroc',
  douane: 'Dédouanement en cours',
  prete: 'Prête à être livrée ou retirée',
  livree: 'Merci de votre confiance',
};

const ICONE_ETAPE: Record<EtapeClient, LucideIcon> = {
  enregistree: ClipboardList,
  fabrication: Factory,
  mer: Ship,
  douane: FileText,
  prete: PackageCheck,
  livree: Truck,
};

/** L'état du conteneur chez la compagnie, dit au client. */
const ETAT_DU_SUIVI: Record<string, string> = {
  NEW: 'En attente des informations de la compagnie',
  INPROGRESS: 'En attente des informations de la compagnie',
  BOOKED: 'Place réservée à bord',
  LOADED: 'Chargé à bord',
  SAILING: 'En mer',
  ARRIVED: 'Navire arrivé au port',
  DISCHARGED: 'Déchargé au port',
};

/** Message WhatsApp déjà rédigé : le produit, la quantité, le connaissement. */
function messageWhatsApp(c: CommandeClient, k?: ConteneurClient): string {
  const lignes = [
    'Bonjour LEBTEX,',
    `Je vous écris au sujet de ma commande « ${c.nom} »${c.reference ? ` (réf. ${c.reference})` : ''} : ${quantiteDite(c.quantite, c.unite)}.`,
  ];
  if (k?.connaissement) lignes.push(`Connaissement : ${k.connaissement}.`);
  return `${lignes.join('\n')}\n\n`;
}

// ─── La fiche ─────────────────────────────────────────────────────────────────

export function FicheCommande({
  commande,
  conteneur,
  whatsapp,
  ouverte,
  onFermer,
  onDemande,
  onTelechargerPdf,
}: {
  commande: CommandeClient | null;
  conteneur?: ConteneurClient;
  whatsapp?: string;
  ouverte: boolean;
  onFermer: () => void;
  onDemande: (type: TypeDemande, commande: CommandeClient) => void;
  onTelechargerPdf?: (commande: CommandeClient) => void;
}) {
  // La dernière commande affichée reste là pendant que la fiche se referme :
  // sans elle, la fiche se viderait sous les yeux du client pendant l'animation.
  const [affichee, setAffichee] = useState<{ commande: CommandeClient; conteneur?: ConteneurClient } | null>(
    commande ? { commande, conteneur } : null,
  );
  const [photoGrande, setPhotoGrande] = useState(false);
  const [photoKo, setPhotoKo] = useState(false);
  const [pdfEnCours, setPdfEnCours] = useState(false);

  if (commande && (affichee?.commande !== commande || affichee?.conteneur !== conteneur)) {
    if (affichee?.commande.id !== commande.id) {
      setPhotoGrande(false);
      setPhotoKo(false);
    }
    setAffichee({ commande, conteneur });
  }

  if (!affichee) return null;
  const c = affichee.commande;
  const k = affichee.conteneur;

  const aujourdhui = aujourdhuiIso();
  const etape = etapeClient(c.statut);
  const rang = rangEtape(etape);
  const courante = ETAPES_CLIENT[rang];
  const dates = datesDeLaCommande(c, k, aujourdhui);
  const reperes = reperesDesEtapes(dates, rang, aujourdhui);
  const rangPrete = rangEtape('prete');

  // Changement de date d'arrivée annoncé par la compagnie : dit tant que la
  // marchandise n'est pas chez nous ; une fois en entrepôt, il n'apprend plus rien.
  const decalage = dates.arrivee && dates.arriveeInitiale && rang < rangPrete
    ? { jours: joursEntre(dates.arriveeInitiale, dates.arrivee.jour), ...dates.arrivee, initiale: dates.arriveeInitiale }
    : null;

  const chip = repereDuMoment(etape, dates, aujourdhui);
  const photo = c.photo && !photoKo ? c.photo : undefined;
  const numeroWhatsApp = String(whatsapp || '').replace(/\D/g, '');
  const lienWhatsApp = numeroWhatsApp ? `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(messageWhatsApp(c, k))}` : undefined;

  // L'action qui compte à cette étape va en bas de la fiche, toujours visible.
  const principale: TypeDemande = etape === 'prete' ? 'livraison' : etape === 'livree' ? 'recommande' : 'question';
  const actions: { type: TypeDemande; titre: string; texte: string; icone: LucideIcon }[] = [
    { type: 'livraison', titre: 'Organiser la livraison', texte: 'Livraison chez vous ou retrait à notre entrepôt, à la date qui vous convient.', icone: Truck },
    { type: 'recommande', titre: 'Recommander ce produit', texte: 'Le même article, dans la quantité de votre choix.', icone: Repeat },
    { type: 'question', titre: 'Poser une question', texte: 'Sur cette commande : délai, quantité, livraison… Notre équipe vous répond au plus vite.', icone: MessageCircleQuestion },
  ];
  const actionPrincipale = actions.find(a => a.type === principale)!;
  const IconePrincipale = actionPrincipale.icone;
  // « Organiser la livraison » n'a de sens que pour ce qui est prêt, dans notre entrepôt.
  const autresActions = actions.filter(a => a.type !== principale && (a.type !== 'livraison' || etape === 'prete'));

  const telecharger = () => {
    if (!onTelechargerPdf || pdfEnCours) return;
    let resultat: unknown;
    try {
      resultat = onTelechargerPdf(c);
    } catch {
      return;
    }
    // Le téléchargement peut prendre un instant (photo à charger) : on le dit.
    if (resultat && typeof (resultat as Promise<unknown>).then === 'function') {
      setPdfEnCours(true);
      Promise.resolve(resultat).catch(() => undefined).finally(() => setPdfEnCours(false));
    }
  };

  const detailsSimples: { libelle: string; valeur: string }[] = [
    { libelle: 'Quantité commandée', valeur: quantiteDite(c.quantite, c.unite) },
    dates.commandee ? { libelle: 'Commandée le', valeur: dateFr(dates.commandee) } : null,
    c.famille ? { libelle: 'Famille', valeur: c.famille } : null,
    c.qualite ? { libelle: 'Qualité', valeur: c.qualite } : null,
    c.couleur ? { libelle: 'Couleur', valeur: c.couleur } : null,
    c.taille ? { libelle: 'Taille', valeur: c.taille } : null,
    c.fermeture ? { libelle: 'Fermeture', valeur: c.fermeture } : null,
  ].filter((l): l is { libelle: string; valeur: string } => Boolean(l));

  const suivi = k?.suivi;
  const etapesVoyage = etapesDuVoyage(suivi?.etapes);
  const avecVoyage = Boolean(k && (suivi || k.connaissement || k.compagnie));
  const donneesVoyage: { libelle: string; valeur: string }[] = [
    suivi?.statut && ETAT_DU_SUIVI[suivi.statut] ? { libelle: 'Situation', valeur: ETAT_DU_SUIVI[suivi.statut] } : null,
    suivi?.navire ? { libelle: 'Navire', valeur: suivi.navire } : null,
    k?.compagnie ? { libelle: 'Compagnie', valeur: k.compagnie } : null,
    k?.connaissement ? { libelle: 'Connaissement', valeur: k.connaissement } : null,
    // Sans suivi de la compagnie, pas de ligne des ports : les dates viennent ici.
    !suivi && dates.depart ? { libelle: dates.depart.prevu ? 'Départ prévu' : 'Départ', valeur: dateFr(dates.depart.jour) } : null,
    !suivi && dates.arrivee ? { libelle: dates.arrivee.prevu ? 'Arrivée prévue' : 'Arrivée au port', valeur: dateFr(dates.arrivee.jour) } : null,
  ].filter((l): l is { libelle: string; valeur: string } => Boolean(l));

  return (
    <Sheet open={ouverte} onOpenChange={o => { if (!o) onFermer(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 gap-0 bg-[#F9F6F0] border-l border-stone-200 flex flex-col overflow-hidden [&>button:last-child]:hidden"
        onEscapeKeyDown={e => {
          // Échap referme d'abord la photo agrandie, puis la fiche.
          if (photoGrande) { e.preventDefault(); setPhotoGrande(false); }
        }}
      >
        {/* Toujours visible, même quand on fait défiler la fiche. */}
        <SheetClose
          className="absolute right-3 top-3 z-20 w-9 h-9 rounded-full bg-stone-900/70 hover:bg-stone-900 backdrop-blur text-white flex items-center justify-center border border-white/10 shadow-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
          aria-label="Fermer la fiche"
        >
          <X className="w-4 h-4" />
        </SheetClose>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* ─── En-tête : le produit et son étape ─── */}
          <div className="relative bg-stone-900 px-5 pt-6 pb-6 sm:px-6 overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" aria-hidden />
            <div className="relative z-10">
              <div className="flex items-start gap-4 pr-10">
                {photo ? (
                  <button
                    type="button"
                    onClick={() => setPhotoGrande(true)}
                    className="group relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-white/10 shrink-0 bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
                    aria-label="Agrandir la photo"
                  >
                    <img src={photo} alt={c.nom} onError={() => setPhotoKo(true)} className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-stone-900/0 group-hover:bg-stone-900/40 transition-colors">
                      <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </button>
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Package className="w-7 h-7 text-stone-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-1 truncate">
                    {c.famille || 'Votre commande'}
                  </p>
                  <SheetTitle className="text-lg sm:text-xl font-black text-white uppercase tracking-wider leading-tight break-words">
                    {c.nom}
                  </SheetTitle>
                  {c.reference && (
                    <p className="mt-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide break-words">
                      Référence : {c.reference}
                    </p>
                  )}
                  <p className="mt-2 text-sm font-black text-white">{quantiteDite(c.quantite, c.unite)}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-[10px] font-black text-[#c4a062] uppercase tracking-widest">
                  Étape {rang + 1} sur {ETAPES_CLIENT.length}
                </p>
                <p className="mt-1 text-base font-black text-white">{courante.titre}</p>
                <SheetDescription className="mt-1 text-xs font-medium text-stone-400 leading-relaxed">
                  {courante.phrase}
                </SheetDescription>
                <div className="mt-3 flex items-center gap-1" aria-hidden>
                  {ETAPES_CLIENT.map((e, i) => (
                    <div
                      key={e.id}
                      className={`h-1.5 flex-1 rounded-full ${i < rang ? 'bg-[#c4a062]' : i === rang ? 'bg-white' : 'bg-white/10'}`}
                    />
                  ))}
                </div>
                {chip && (
                  <p className="mt-4 inline-flex items-center gap-2 text-[11px] font-black text-[#e3c992] bg-[#c4a062]/10 border border-[#c4a062]/25 px-3 py-2 rounded-xl">
                    <CalendarClock className="w-4 h-4 shrink-0" /> {chip}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-6 space-y-8">
            {/* ─── Arrivée déplacée par la compagnie ─── */}
            {decalage && decalage.jours !== 0 && (
              <div
                className={`rounded-2xl border p-4 flex gap-3 ${decalage.jours > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}
                role="status"
              >
                <CalendarClock className={`w-5 h-5 shrink-0 mt-0.5 ${decalage.jours > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-black ${decalage.jours > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                    {`Arrivée ${decalage.jours > 0 ? 'repoussée' : 'avancée'} de ${jours(Math.abs(decalage.jours))} : ${decalage.prevu ? 'prévue le' : 'le'} ${dateFr(decalage.jour)} au lieu du ${dateFr(decalage.initiale)}`}
                  </p>
                  <p className={`mt-1 text-xs font-medium ${decalage.jours > 0 ? 'text-amber-800/80' : 'text-emerald-800/80'}`}>
                    {decalage.prevu
                      ? decalage.jours > 0
                        ? 'La compagnie maritime a revu la date d’arrivée du navire. Nous suivons le conteneur de près ; la date se met à jour d’elle-même ici.'
                        : 'Bonne nouvelle : la compagnie maritime annonce le navire plus tôt que prévu.'
                      : decalage.jours > 0
                        ? 'Le navire est arrivé plus tard que la date annoncée par la compagnie maritime.'
                        : 'Bonne nouvelle : le navire est arrivé plus tôt que la date annoncée par la compagnie maritime.'}
                  </p>
                </div>
              </div>
            )}

            {/* ─── Le parcours ─── */}
            <section>
              <TitreSection icone={Route}>Le parcours de votre commande</TitreSection>
              <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm">
                <ol>
                  {ETAPES_CLIENT.map((e, i) => {
                    const Icone = ICONE_ETAPE[e.id];
                    const repere = reperes[e.id];
                    const faite = i < rang;
                    const enCours = i === rang;
                    return (
                      <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0" aria-current={enCours ? 'step' : undefined}>
                        {i < ETAPES_CLIENT.length - 1 && (
                          <span
                            className={`absolute left-[17px] top-10 bottom-1 w-0.5 rounded-full ${faite ? 'bg-[#c4a062]' : 'bg-stone-200'}`}
                            aria-hidden
                          />
                        )}
                        <span
                          className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            faite
                              ? 'bg-[#c4a062] text-white'
                              : enCours
                                ? 'bg-stone-900 text-white ring-4 ring-[#c4a062]/25 shadow-md'
                                : 'bg-white border-2 border-stone-200 text-stone-300'
                          }`}
                          aria-hidden
                        >
                          {faite ? <Check className="w-4 h-4" strokeWidth={3} /> : <Icone className="w-4 h-4" />}
                        </span>
                        <div className="min-w-0 flex-1 pt-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-xs font-black uppercase tracking-wider ${enCours ? 'text-stone-900' : faite ? 'text-stone-700' : 'text-stone-400'}`}>
                              {e.titre}
                            </p>
                            {enCours && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#a38042] bg-[#c4a062]/10 border border-[#c4a062]/25 px-2 py-0.5 rounded-full">
                                {etape === 'livree' ? 'Terminé' : 'En cours'}
                              </span>
                            )}
                            <span className="sr-only">{faite ? '(étape franchie)' : enCours ? '(étape en cours)' : '(étape à venir)'}</span>
                          </div>
                          {repere && (
                            <p className={`mt-1 text-[11px] font-bold ${repere.prevu ? 'text-stone-500' : faite || enCours ? 'text-stone-600' : 'text-stone-400'}`}>
                              {repere.texte}
                              {repere.relatif && <span className="text-[#a38042]"> · {repere.relatif}</span>}
                              {repere.initialement && (
                                <span className="block text-[10px] font-semibold text-stone-400">
                                  Initialement annoncée le <s>{repere.initialement}</s>
                                </span>
                              )}
                            </p>
                          )}
                          {enCours && (
                            <p className="mt-1 text-xs font-medium text-stone-500">{NOTE_EN_COURS[e.id]}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>

            {/* ─── Le voyage du conteneur ─── */}
            {avecVoyage && k && (
              <section>
                <TitreSection icone={Ship}>{rang <= rangEtape('douane') ? 'Le voyage' : 'Le transport'}</TitreSection>
                <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm space-y-5">
                  {(suivi?.portDepart || suivi?.portArrivee) && (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Départ</p>
                        <p className="mt-0.5 text-sm font-black text-stone-900 uppercase tracking-wide break-words">{suivi?.portDepart || '—'}</p>
                        {dates.depart && (
                          <p className="text-[11px] font-bold text-stone-500">
                            {dates.depart.prevu ? 'Prévu le ' : 'Le '}{dateFr(dates.depart.jour)}
                          </p>
                        )}
                      </div>
                      <Anchor className="w-4 h-4 text-stone-300 shrink-0 mt-5" aria-hidden />
                      <div className="min-w-0 text-right">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Arrivée</p>
                        <p className="mt-0.5 text-sm font-black text-stone-900 uppercase tracking-wide break-words">{suivi?.portArrivee || '—'}</p>
                        {dates.arrivee && (
                          <p className="text-[11px] font-bold text-stone-500">
                            {dates.arrivee.prevu ? 'Prévue le ' : 'Le '}{dateFr(dates.arrivee.jour)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {typeof suivi?.avancement === 'number' && Number.isFinite(suivi.avancement) && (
                    <div>
                      <div className="relative mx-3.5 py-3">
                        <div
                          className="h-2 rounded-full bg-stone-100 overflow-hidden"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(borne(suivi.avancement))}
                          aria-label="Part du trajet parcourue"
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#c4a062] to-[#a38042]"
                            style={{ width: `${borne(suivi.avancement)}%` }}
                          />
                        </div>
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                          style={{ left: `${borne(suivi.avancement)}%` }}
                          aria-hidden
                        >
                          <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center ring-4 ring-white shadow-md">
                            <Ship className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-[11px] font-black text-stone-600">
                        {nombreFr(Math.round(borne(suivi.avancement)))} % du trajet parcouru
                      </p>
                    </div>
                  )}

                  {donneesVoyage.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {donneesVoyage.map(d => <Donnee key={d.libelle} libelle={d.libelle} valeur={d.valeur} />)}
                    </dl>
                  )}

                  {etapesVoyage.length > 0 && (
                    <div className="pt-4 border-t border-stone-100">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">Les étapes du navire</p>
                      <ol>
                        {etapesVoyage.map((e, i) => {
                          const derniereReelle = e.reel && !etapesVoyage.slice(i + 1).some(x => x.reel);
                          return (
                            <li key={`${e.code}-${e.date}-${i}`} className="relative flex gap-3 pb-3.5 last:pb-0">
                              {i < etapesVoyage.length - 1 && (
                                <span
                                  className={`absolute left-[5px] top-4 bottom-0 w-px ${e.reel && etapesVoyage[i + 1]?.reel ? 'bg-stone-400' : 'bg-stone-200'}`}
                                  aria-hidden
                                />
                              )}
                              <span
                                className={`relative mt-1 w-[11px] h-[11px] rounded-full shrink-0 ${
                                  derniereReelle
                                    ? 'bg-[#c4a062] ring-4 ring-[#c4a062]/20'
                                    : e.reel
                                      ? 'bg-stone-800'
                                      : 'bg-white border-2 border-stone-300'
                                }`}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={`text-xs font-black ${e.reel ? 'text-stone-900' : 'text-stone-400'}`}>
                                    {e.libelle}
                                    {derniereReelle && <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-[#a38042]">Étape la plus récente</span>}
                                  </p>
                                  {(e.lieu || (e.navire && e.navire !== suivi?.navire)) && (
                                    <p className={`text-[11px] font-medium break-words ${e.reel ? 'text-stone-500' : 'text-stone-400'}`}>
                                      {[e.lieu, e.navire && e.navire !== suivi?.navire ? `navire ${e.navire}` : null].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </div>
                                <p className={`text-[11px] font-bold whitespace-nowrap ${e.reel ? 'text-stone-600' : 'text-stone-400'}`}>
                                  {e.reel ? dateFr(e.date) : `prévu le ${dateFr(e.date)}`}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}

                  {suivi?.lienCarte && suivi.statut !== 'UNTRACKED' && (
                    <a
                      href={suivi.lienCarte}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <MapPin className="w-4 h-4" /> Suivre le navire sur la carte <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </a>
                  )}

                  {suivi && (
                    <p className="flex items-start gap-1.5 text-[10px] font-medium text-stone-600 leading-relaxed">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        Informations transmises par la compagnie maritime
                        {suivi.majLe && dateFr(suivi.majLe) ? `, mises à jour le ${dateFr(suivi.majLe)}` : ''}.
                      </span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* ─── Ce qui a été commandé ─── */}
            <section>
              <TitreSection icone={Package}>Votre commande en détail</TitreSection>
              <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm">
                <dl>
                  {detailsSimples.map(l => (
                    <div key={l.libelle} className="flex items-start justify-between gap-4 py-2.5 border-b border-stone-100 first:pt-0 last:border-0 last:pb-0">
                      <dt className="text-[10px] font-black text-stone-400 uppercase tracking-widest pt-0.5 shrink-0">{l.libelle}</dt>
                      <dd className="text-sm font-bold text-stone-900 text-right break-words min-w-0">{l.valeur}</dd>
                    </div>
                  ))}
                </dl>

                {c.caracteristiques && (
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Caractéristiques</p>
                    <p className="text-sm font-medium text-stone-700 leading-relaxed whitespace-pre-line break-words">{c.caracteristiques}</p>
                  </div>
                )}

                {typeof c.prixConvenuMad === 'number' && Number.isFinite(c.prixConvenuMad) && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-emerald-700/70 uppercase tracking-widest">Prix convenu</p>
                      <p className="text-[11px] font-medium text-emerald-800/70">Prix de vente convenu avec vous</p>
                    </div>
                    <p className="text-base font-black text-emerald-800 whitespace-nowrap">
                      {nombreFr(c.prixConvenuMad)} MAD <span className="text-xs font-bold">/ {uniteSeule(c.unite)}</span>
                    </p>
                  </div>
                )}
              </div>

              {(c.couleurs?.length || c.tailles?.length || c.qualites?.length) ? (
                <div className="mt-4 space-y-4">
                  {c.couleurs && c.couleurs.length > 0 && (
                    <Repartition titre="Répartition par couleur" colonne="Couleur" unite={c.unite}
                      lignes={c.couleurs.map(l => ({ libelle: l.code, quantite: l.quantite }))} />
                  )}
                  {c.tailles && c.tailles.length > 0 && (
                    <Repartition titre="Répartition par taille" colonne="Taille" unite={c.unite}
                      lignes={c.tailles.map(l => ({ libelle: l.taille, quantite: l.quantite }))} />
                  )}
                  {c.qualites && c.qualites.length > 0 && (
                    <Repartition titre="Répartition par qualité" colonne="Qualité" unite={c.unite}
                      lignes={c.qualites.map(l => ({ libelle: l.qualite, quantite: l.quantite }))} />
                  )}
                </div>
              ) : null}
            </section>

            {/* ─── Les autres démarches ─── */}
            {(autresActions.length > 0 || onTelechargerPdf) && (
              <section>
                <TitreSection icone={ClipboardList}>Autres démarches</TitreSection>
                <div className="grid gap-3">
                  {autresActions.map(a => (
                    <CarteAction key={a.type} icone={a.icone} titre={a.titre} texte={a.texte} onClick={() => onDemande(a.type, c)} />
                  ))}
                  {onTelechargerPdf && (
                    <CarteAction
                      icone={pdfEnCours ? LoaderCircle : FileDown}
                      tourne={pdfEnCours}
                      titre="Télécharger la fiche (PDF)"
                      texte={pdfEnCours ? 'Préparation de la fiche…' : 'Pour l’imprimer, la garder ou la transmettre à vos équipes.'}
                      onClick={telecharger}
                      desactivee={pdfEnCours}
                    />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ─── L'action du moment, toujours à portée de pouce ─── */}
        <div className="shrink-0 border-t border-stone-200 bg-white/95 backdrop-blur px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
          <button
            type="button"
            onClick={() => onDemande(actionPrincipale.type, c)}
            className="flex-1 min-w-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#c4a062] hover:bg-[#a38042] text-stone-900 text-[11px] font-black uppercase tracking-widest shadow-md shadow-[#c4a062]/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
          >
            <IconePrincipale className="w-4 h-4 shrink-0" />
            <span className="truncate">{actionPrincipale.titre}</span>
          </button>
          {lienWhatsApp && (
            <a
              href={lienWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest shadow-md shadow-emerald-600/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
              aria-label="Écrire sur WhatsApp au sujet de cette commande"
              title="Écrire sur WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden min-[400px]:inline">WhatsApp</span>
            </a>
          )}
        </div>

        {/* ─── La photo en grand ─── */}
        {photoGrande && photo && (
          <div
            className="absolute inset-0 z-30 bg-stone-950/95 flex flex-col items-center justify-center p-4 animate-in fade-in"
            onClick={() => setPhotoGrande(false)}
          >
            <button
              type="button"
              onClick={() => setPhotoGrande(false)}
              className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
              aria-label="Fermer la photo"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={photo} alt={c.nom} className="max-w-full max-h-[80%] rounded-2xl object-contain shadow-2xl" />
            <p className="mt-4 text-[11px] font-black text-white uppercase tracking-widest text-center px-6">{c.nom}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Le repère du moment, sous l'étape en cours ───────────────────────────────

function repereDuMoment(etape: EtapeClient, d: Dates, aujourdhui: string): string | undefined {
  const arrivee = d.arrivee;
  switch (etape) {
    case 'enregistree':
    case 'fabrication':
    case 'mer':
      if (arrivee?.prevu) return `Arrivée prévue le ${dateFr(arrivee.jour)} · ${dansNJours(joursEntre(aujourdhui, arrivee.jour))}`;
      if (arrivee && etape === 'mer') return `Arrivée au port le ${dateFr(arrivee.jour)}`;
      if (etape === 'mer' && d.depart && !d.depart.prevu) return `En mer depuis le ${dateFr(d.depart.jour)}`;
      if (d.depart?.prevu) return `Départ prévu le ${dateFr(d.depart.jour)}`;
      return d.commandee ? `Commandée le ${dateFr(d.commandee)}` : undefined;
    case 'douane':
      if (!arrivee) return undefined;
      return arrivee.prevu
        ? `Arrivée prévue le ${dateFr(arrivee.jour)}`
        : `Au port depuis le ${dateFr(arrivee.jour)}`;
    case 'prete':
      return d.entrepot && !d.entrepot.prevu ? `Dans notre entrepôt depuis le ${dateFr(d.entrepot.jour)}` : undefined;
    default:
      return undefined;
  }
}

const borne = (n: number) => Math.min(100, Math.max(0, n));

// ─── Petites pièces ───────────────────────────────────────────────────────────

function TitreSection({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <Icone className="w-4 h-4 text-[#a38042]" aria-hidden />
      <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{children}</h3>
    </div>
  );
}

function Donnee({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{libelle}</dt>
      <dd className="mt-0.5 text-xs font-black text-stone-900 break-words">{valeur}</dd>
    </div>
  );
}

/** Une répartition (couleurs, tailles, qualités) : chaque ligne, sa part, et le total. */
function Repartition({ titre, colonne, lignes, unite }: {
  titre: string;
  colonne: string;
  lignes: { libelle: string; quantite: number }[];
  unite?: string;
}) {
  const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left">
        <caption className="px-4 pt-3 pb-2 text-left text-[10px] font-black text-stone-500 uppercase tracking-widest">
          {titre}
        </caption>
        <thead>
          <tr className="border-y border-stone-100 bg-stone-50/70">
            <th scope="col" className="px-4 py-2 text-[9px] font-black text-stone-400 uppercase tracking-widest">{colonne}</th>
            <th scope="col" className="px-4 py-2 text-[9px] font-black text-stone-400 uppercase tracking-widest text-right">Quantité</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => {
            const part = total > 0 ? Math.round(((Number(l.quantite) || 0) / total) * 100) : 0;
            return (
              <tr key={`${l.libelle}-${i}`} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-2.5 align-middle">
                  <p className="text-xs font-black text-stone-800 uppercase tracking-wide break-words">{l.libelle}</p>
                  {total > 0 && lignes.length > 1 && (
                    <div className="mt-1.5 h-1 rounded-full bg-stone-100 max-w-[12rem]" aria-hidden>
                      <div className="h-1 rounded-full bg-[#c4a062]" style={{ width: `${part}%` }} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                  <span className="text-xs font-black text-stone-900 tabular-nums">{quantiteDite(l.quantite, unite)}</span>
                  {total > 0 && lignes.length > 1 && (
                    <span className="block text-[10px] font-bold text-stone-400 tabular-nums">{part} %</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {lignes.length > 1 && (
          <tfoot>
            <tr className="bg-stone-50 border-t border-stone-200">
              <th scope="row" className="px-4 py-2.5 text-[10px] font-black text-stone-500 uppercase tracking-widest">Total</th>
              <td className="px-4 py-2.5 text-right text-xs font-black text-stone-900 whitespace-nowrap tabular-nums">{quantiteDite(total, unite)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function CarteAction({ icone: Icone, titre, texte, onClick, desactivee, tourne }: {
  icone: LucideIcon;
  titre: string;
  texte: string;
  onClick: () => void;
  desactivee?: boolean;
  tourne?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivee}
      className="group w-full text-left bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-[#c4a062]/50 hover:shadow-md transition-all disabled:opacity-70 disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a062]"
    >
      <span className="w-11 h-11 rounded-xl bg-[#c4a062]/10 text-[#a38042] flex items-center justify-center shrink-0 group-hover:bg-[#c4a062] group-hover:text-white transition-colors">
        <Icone className={`w-5 h-5 ${tourne ? 'animate-spin' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black text-stone-900 uppercase tracking-widest">{titre}</span>
        <span className="block mt-0.5 text-xs font-medium text-stone-500 leading-snug">{texte}</span>
      </span>
    </button>
  );
}
