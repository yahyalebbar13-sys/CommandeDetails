'use client';

// ─── L'écran de travail des commandes boutique ───────────────────────────────
// Celui qu'on garde ouvert toute la journée : les files « à confirmer », « à
// préparer »… avec leurs compteurs, la plus ancienne en haut, une carte par
// commande avec Appeler / WhatsApp, et la fiche à côté (grand écran) ou par-dessus
// (téléphone). Les commandes arrivent déjà écoutées en temps réel par la page.

import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ClavierReact, type ReactNode,
} from 'react';
import {
  AlertTriangle, BellRing, Inbox, Loader2, MousePointerClick, Printer, RefreshCw, Search, Smartphone, Volume2, VolumeX, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ShopOrder } from '@/lib/shop-types';
import {
  commandesDeLaFile, compteParFile, dateDe, enRetard, FILES, type FileCommandes,
} from '@/lib/commandes-boutique';
import { REGLAGES_RECEPTION_DEFAUT, type ReglagesReception } from '@/lib/reglages-reception';
import type { ActionsCommandes } from './actions-commandes';
import { estAppareilMobile, type EtatAlertes } from './use-alerte-nouvelles-commandes';
import { CarteCommande } from './carte-commande';
import { FicheCommande, FicheEnAttente, FicheIntrouvable } from './fiche-commande';
import { BOUTON_SECONDAIRE, FrontiereCommande, Squelettes, useGrandEcran, useMaintenant } from './elements';
import { fileAUnSeulStatut, fileParDefaut, fileParPages, VIDE_PAR_FILE } from './outils-ecran';
import { telechargerBonsLivraison } from './documents-commande';
import { FeuilleDeRouteCamionnette } from './documents-transport';

const TAILLE_PAGE = 50;

/** Bandeau des alertes écarté (« Plus tard » / « Compris ») : date, sur cet appareil. */
const CLE_BANDEAU_ALERTES = 'lebtex_admin_bandeau_alertes';
const PLUS_TARD_MS = 7 * 24 * 3600_000;

export interface EcranCommandesProps {
  /** Toutes les commandes (écoute temps réel), avec id. */
  orders: ShopOrder[];
  /** Premier chargement pas encore arrivé. */
  chargement: boolean;
  /** Lecture impossible : on l'affiche, jamais « aucune commande ». */
  erreur: string | null;
  actions: ActionsCommandes;
  /** Fiche ouverte (lien ?commande=… de l'e-mail, clic du tableau de bord). */
  commandeOuverteId: string | null;
  /** La page marque la commande « vue » et met l'URL à jour. */
  onOuvrir: (id: string | null) => void;
  /** Arrivées et jamais ouvertes : pastille « Nouvelle ». */
  nonVues: Set<string>;
  /** Bouton « Activer les alertes sur cet appareil », son on/off. */
  alertes: EtatAlertes;
  /**
   * Ajout au contrat (facultatif) : une file demandée d'ailleurs (carte « À préparer »
   * du tableau de bord, pastille « N à confirmer »). Le jeton change à chaque demande,
   * même quand c'est la même file.
   */
  fileDemandee?: { file: FileCommandes; jeton: number } | null;
  /** Ajout au contrat (facultatif) : relancer la lecture des commandes, plutôt que recharger la page. */
  onReessayer?: () => void;
  /**
   * La personne connectée reçoit l'e-mail « nouvelle commande » (l'administrateur,
   * par défaut). Faux pour l'espace équipe : le bandeau téléphone ne le promet pas.
   */
  prevenuParEmail?: boolean;
  /**
   * Écran de l'administrateur (/admin-shop) : la fiche montre les frais Sendit facturés
   * à LEBTEX. Faux par défaut, donc dans /staff. Le serveur revérifie chaque action.
   */
  estAdmin?: boolean;
}

/** Cle d'une version de la commande : une frontière d'erreur retente quand elle change. */
const versionDe = (o: ShopOrder) => `${o.id}|${o.status}|${dateDe(o.updatedAt)?.getTime() ?? ''}`;

export function EcranCommandes({
  orders, chargement, erreur, actions, commandeOuverteId, onOuvrir, nonVues, alertes, fileDemandee, onReessayer,
  prevenuParEmail = true, estAdmin = false,
}: EcranCommandesProps) {
  const { toast } = useToast();
  const maintenant = useMaintenant(30_000);
  const grandEcran = useGrandEcran();

  // ─── File et recherche ──────────────────────────────────────────────────────
  // Commandes déjà là (on revient du tableau de bord) : la bonne file dès le premier affichage.
  // Tant que les commandes ne sont pas réellement là (chargement, hors ligne, accès
  // refusé), tous les compteurs valent 0 : on ne choisit pas encore.
  const [file, setFile] = useState<FileCommandes>(() => {
    if (fileDemandee) return fileDemandee.file;
    return chargement || erreur ? 'a_confirmer' : fileParDefaut(compteParFile(orders));
  });
  const fileChoisie = useRef(!!fileDemandee || (!chargement && !erreur));
  const [recherche, setRecherche] = useState('');
  const rechercheDifferee = useDeferredValue(recherche);
  const [limite, setLimite] = useState(TAILLE_PAGE);

  const comptes = useMemo(() => compteParFile(orders), [orders]);
  const nbEnRetard = useMemo(() => orders.filter(o => enRetard(o, maintenant)).length, [orders, maintenant]);

  // À l'arrivée des commandes : la file où il y a du travail (sauf si on a déjà cliqué une file).
  useEffect(() => {
    if (fileChoisie.current || chargement || erreur) return;
    fileChoisie.current = true;
    setFile(fileParDefaut(comptes));
  }, [chargement, erreur, comptes]);

  // Une file demandée d'ailleurs l'emporte, à chaque demande.
  const jetonApplique = useRef(fileDemandee?.jeton ?? null);
  useEffect(() => {
    if (!fileDemandee || fileDemandee.jeton === jetonApplique.current) return;
    jetonApplique.current = fileDemandee.jeton;
    fileChoisie.current = true;
    setFile(fileDemandee.file);
    setRecherche('');
  }, [fileDemandee]);

  const q = rechercheDifferee.trim();
  const enRecherche = q.length > 0;
  const definition = FILES.find(f => f.id === file) ?? FILES[FILES.length - 1];

  // Dès qu'on tape, on cherche partout : le client qui rappelle n'est pas forcément « à confirmer ».
  const liste = useMemo(
    () => commandesDeLaFile(orders, enRecherche ? 'toutes' : file, q, maintenant),
    [orders, file, q, enRecherche, maintenant],
  );

  useEffect(() => { setLimite(TAILLE_PAGE); }, [file, q]);

  const parPages = enRecherche || fileParPages(file);
  const visibles = parPages ? liste.slice(0, limite) : liste;
  const afficherStatut = enRecherche || !fileAUnSeulStatut(file);

  const choisirFile = (f: FileCommandes) => {
    fileChoisie.current = true;
    setFile(f);
    setRecherche('');
  };

  // L'onglet de la file affichée reste visible dans la rangée qui défile (« Toutes » est tout à droite).
  const rangeeFiles = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rangee = rangeeFiles.current;
    const actif = rangee?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rangee || !actif) return;
    const r = actif.getBoundingClientRect();
    const c = rangee.getBoundingClientRect();
    // Défilement horizontal seulement : la page ne doit pas sauter.
    if (r.left < c.left) rangee.scrollBy({ left: r.left - c.left - 12, behavior: 'smooth' });
    else if (r.right > c.right) rangee.scrollBy({ left: r.right - c.right + 12, behavior: 'smooth' });
  }, [file, enRecherche]);

  // ─── Bandeau des alertes (selon l'appareil) ─────────────────────────────────
  const [mobile, setMobile] = useState(false);
  const [bandeauEcarte, setBandeauEcarte] = useState<number | null>(0); // 0 = pas encore lu : rien n'apparaît
  useEffect(() => {
    setMobile(estAppareilMobile());
    try {
      const v = Number(window.localStorage.getItem(CLE_BANDEAU_ALERTES));
      setBandeauEcarte(Number.isFinite(v) && v > 0 ? v : null);
    } catch {
      setBandeauEcarte(null);
    }
  }, []);
  const ecarterBandeau = () => {
    const le = Date.now();
    setBandeauEcarte(le);
    try { window.localStorage.setItem(CLE_BANDEAU_ALERTES, String(le)); } catch { /* gardé pour cette visite */ }
  };
  // Sur téléphone, « Compris » vaut pour toujours ; sur ordinateur, « Plus tard » pour 7 jours.
  const bandeauMobile = mobile && bandeauEcarte === null;
  const bandeauOrdinateur = !mobile && alertes.permission === 'default'
    && (bandeauEcarte === null || (bandeauEcarte > 0 && Date.now() - bandeauEcarte > PLUS_TARD_MS));

  // ─── Magasins de retrait (réglages « Réception & paiement ») ────────────────
  // Le WhatsApp d'une carte cite l'adresse du magasin (« commande prête ») : celle
  // réglée par le patron, pas celle par défaut. Illisibles : les valeurs par défaut.
  const [reglages, setReglages] = useState<ReglagesReception | undefined>(undefined);
  useEffect(() => {
    if (!actions.lireReglagesReception) return;
    let actif = true;
    actions.lireReglagesReception()
      .then(r => { if (actif) setReglages(r); })
      .catch(() => { /* valeurs par défaut */ });
    return () => { actif = false; };
  }, [actions]);

  // ─── Impression des bons de la file « À préparer » ──────────────────────────
  const [impression, setImpression] = useState<{ etat: 'repos' | 'preparation' | 'erreur'; message?: string }>({ etat: 'repos' });
  const aPreparer = useMemo(() => commandesDeLaFile(orders, 'a_preparer', '', maintenant), [orders, maintenant]);

  async function imprimerLesBons() {
    if (impression.etat === 'preparation' || !aPreparer.length) return;
    setImpression({ etat: 'preparation' });
    try {
      // Les adresses des magasins réglées par le patron ; illisibles, le bon prend celles par défaut.
      const lus = await actions.lireReglagesReception?.().catch(() => undefined);
      await telechargerBonsLivraison(aPreparer, { reglages: lus ?? reglages });
      setImpression({ etat: 'repos' });
    } catch (e) {
      setImpression({ etat: 'erreur', message: (e as Error)?.message || 'Les bons n’ont pas pu être préparés.' });
    }
  }

  // ─── Commande ouverte ───────────────────────────────────────────────────────
  const ouverte = useMemo(
    () => (commandeOuverteId ? orders.find(o => o.id === commandeOuverteId) ?? null : null),
    [orders, commandeOuverteId],
  );
  const dejaAffichee = useRef<string | null>(null);

  useEffect(() => {
    if (!commandeOuverteId) return;
    if (ouverte) { dejaAffichee.current = commandeOuverteId; return; }
    // Elle était là et n'y est plus : supprimée ailleurs, on ferme.
    if (!chargement && !erreur && dejaAffichee.current === commandeOuverteId) {
      dejaAffichee.current = null;
      toast({ title: 'Commande supprimée', description: 'Elle n’existe plus : sa fiche a été fermée.', className: 'border-white/15 bg-[#1A1A1A] text-gray-100' });
      onOuvrir(null);
    }
  }, [commandeOuverteId, ouverte, chargement, erreur, onOuvrir, toast]);

  const fermer = useCallback(() => onOuvrir(null), [onOuvrir]);
  const ouvrir = useCallback((id: string) => onOuvrir(id), [onOuvrir]);

  const pleinEcran = !grandEcran;
  let fiche: ReactNode = null;
  if (commandeOuverteId) {
    if (ouverte) {
      fiche = (
        <FrontiereCommande cle={versionDe(ouverte)} numero={ouverte.orderNumber} plein onFermer={fermer}>
          <FicheCommande
            key={ouverte.id}
            commande={ouverte}
            orders={orders}
            actions={actions}
            maintenant={maintenant}
            pleinEcran={pleinEcran}
            onFermer={fermer}
            onOuvrir={ouvrir}
            estAdmin={estAdmin}
          />
        </FrontiereCommande>
      );
    } else if (chargement) {
      fiche = <FicheEnAttente pleinEcran={pleinEcran} onFermer={fermer} />;
    } else {
      fiche = (
        <FicheIntrouvable
          pleinEcran={pleinEcran}
          onFermer={fermer}
          message={erreur
            ? 'Les commandes ne peuvent pas être lues pour l’instant : la fiche s’affichera quand la connexion reviendra.'
            : 'Cette commande est introuvable. Elle a peut-être été supprimée, ou le lien est incomplet.'}
        />
      );
    }
  }

  // Grand écran : la fiche remonte en haut quand on change de commande.
  const panneau = useRef<HTMLElement>(null);
  useEffect(() => { panneau.current?.scrollTo({ top: 0 }); }, [commandeOuverteId]);

  // Échap ferme la fiche du grand écran, sauf en pleine saisie ou dans un menu.
  const echapPanneau = (e: ClavierReact) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !commandeOuverteId) return;
    if (estChampDeSaisie(e.target) || couchesRadixOuvertes()) return;
    fermer();
  };

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  // Liste et fiche côte à côte à partir de 1280 px (« xl ») seulement : en dessous,
  // la barre latérale et la liste ne laissaient pas assez de place à la fiche.
  return (
    <div className="xl:grid xl:h-[calc(100dvh_-_var(--decalage-ecran-commandes,8rem))] xl:min-h-[560px] xl:grid-cols-[440px_minmax(0,1fr)] xl:gap-5">
      {/* ─── Liste ─── */}
      <section aria-label="Commandes à traiter" className="flex min-h-0 flex-col">
        <div className="shrink-0 space-y-3 pb-3">
          {/* Files */}
          <div ref={rangeeFiles} role="group" aria-label="Files de commandes" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILES.map(f => {
              const actif = !enRecherche && file === f.id;
              const urgent = f.id === 'a_confirmer' && nbEnRetard > 0;
              const n = comptes[f.id];
              // Rouleaux à organiser : pastille ambre, c'est un appel à passer.
              const aOrganiser = f.id === 'transport' && n > 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => choisirFile(f.id)}
                  aria-pressed={actif}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
                    actif
                      ? urgent ? 'border-red-600 bg-red-600 text-white' : 'border-[#C8102E] bg-[#C8102E] text-white'
                      : urgent ? 'border-red-500/60 bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'border-white/10 bg-[#1A1A1A] text-gray-200 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {urgent && <AlertTriangle className="h-4 w-4" aria-hidden />}
                  {f.libelle}
                  <span
                    className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                      actif ? 'bg-white/25 text-white' : urgent ? 'bg-red-500 text-white' : aOrganiser ? 'bg-amber-400/25 text-amber-100' : n > 0 && f.id !== 'toutes' && f.id !== 'livrees' && f.id !== 'annulees' ? 'bg-white/15 text-gray-100' : 'bg-white/5 text-gray-300'
                    }`}
                  >
                    {chargement ? '…' : erreur && !orders.length ? '—' : n}
                  </span>
                  {urgent && <span className="sr-only">({nbEnRetard} en retard)</span>}
                </button>
              );
            })}
          </div>

          {/* Consigne + son */}
          <div className="flex items-start justify-between gap-3">
            <p className="pt-1 text-[13px] leading-snug text-gray-400">
              {enRecherche ? 'Recherche dans toutes les commandes.' : definition.consigne}
            </p>
            <button
              type="button"
              onClick={alertes.basculerSon}
              aria-pressed={alertes.sonActif}
              aria-label={alertes.sonActif ? 'Son des alertes activé : couper le son' : 'Son des alertes coupé : remettre le son'}
              title={alertes.sonActif ? 'Couper le son des nouvelles commandes' : 'Remettre le son des nouvelles commandes'}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60 ${
                alertes.sonActif ? 'border-white/10 text-gray-200 hover:bg-white/5' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              {alertes.sonActif ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
              {alertes.sonActif ? 'Son' : 'Muet'}
            </button>
          </div>

          {!enRecherche && file === 'a_confirmer' && nbEnRetard > 0 && (
            <p className="flex items-start gap-2 text-sm font-semibold text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {nbEnRetard === 1
                ? '1 client attend depuis plus de 2 h : l’appel lui a été promis dans la journée.'
                : `${nbEnRetard} clients attendent depuis plus de 2 h : l’appel leur a été promis dans la journée.`}
            </p>
          )}

          {/* Recherche */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && recherche) { e.preventDefault(); setRecherche(''); } }}
              placeholder="Téléphone, nom, n° de commande, ville…"
              aria-label="Rechercher une commande : téléphone, nom, numéro de commande, ville ou produit"
              className="h-12 w-full rounded-xl border border-white/10 bg-[#1A1A1A] pl-11 pr-11 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/30 focus:outline-none xl:text-[15px] [&::-webkit-search-cancel-button]:hidden"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                aria-label="Effacer la recherche"
                className="absolute right-1.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-300 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>

          {/* Alertes sur cet appareil : ce qu'elles font vraiment, selon l'appareil */}
          {bandeauOrdinateur && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-[#1A1A1A] px-3 py-2.5">
              <BellRing className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-[180px] flex-1 text-sm text-gray-200">
                Un son et une notification à chaque nouvelle commande, même si l’onglet est en arrière-plan
                (le navigateur doit rester ouvert).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void alertes.demanderPermission()}
                  className="inline-flex h-10 items-center rounded-lg bg-white/10 px-3 text-sm font-semibold text-gray-100 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  Activer les alertes sur cet appareil
                </button>
                <button
                  type="button"
                  onClick={ecarterBandeau}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-gray-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  Plus tard
                </button>
              </div>
            </div>
          )}
          {bandeauMobile && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-[#1A1A1A] px-3 py-2.5">
              <Smartphone className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-[180px] flex-1 text-sm text-gray-200">
                Sur téléphone, l’alerte ne sonne que si cette page est ouverte et l’écran allumé.
                {prevenuParEmail
                  ? ' Sinon, vous êtes prévenu par e-mail.'
                  : ' Gardez-la ouverte pendant le travail, ou revenez voir la liste régulièrement.'}
              </p>
              <button
                type="button"
                onClick={ecarterBandeau}
                className="inline-flex h-10 items-center rounded-lg bg-white/10 px-3 text-sm font-semibold text-gray-100 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                Compris
              </button>
            </div>
          )}

          {/* Lecture impossible : le message dit la cause (connexion, accès refusé…) et quoi faire */}
          {erreur && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
              <div className="min-w-0 flex-1 text-sm text-red-100">
                <p><strong className="font-semibold">Commandes non lues.</strong> {erreur}</p>
                {orders.length > 0 && <p className="mt-0.5 text-red-200">La liste ci-dessous n’est peut-être plus à jour.</p>}
              </div>
              <button
                type="button"
                onClick={() => (onReessayer ? onReessayer() : window.location.reload())}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-red-400/40 px-3 text-sm font-semibold text-red-100 hover:bg-red-500/20"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
              </button>
            </div>
          )}

          {/* Recherche : où l'on cherche, combien de résultats */}
          {enRecherche && !chargement && (
            <p className="text-sm text-gray-300" aria-live="polite">
              {liste.length === 0 ? 'Aucun résultat' : `${liste.length} résultat${liste.length > 1 ? 's' : ''}`} dans toutes les commandes
            </p>
          )}

          {/* À préparer : les bons de toute la file d'un coup */}
          {!enRecherche && file === 'a_preparer' && aPreparer.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void imprimerLesBons()}
                disabled={impression.etat === 'preparation'}
                className={`${BOUTON_SECONDAIRE} w-full`}
              >
                {impression.etat === 'preparation'
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Préparation des bons…</>
                  : <><Printer className="h-4 w-4" aria-hidden /> Imprimer les bons ({aPreparer.length})</>}
              </button>
              {impression.etat === 'erreur' && (
                <p role="alert" className="text-sm text-red-300">Bons non préparés : {impression.message}</p>
              )}
            </div>
          )}

          {/* Transport à organiser / À préparer : la tournée de la camionnette, pour les commandes cochées */}
          {!enRecherche && (file === 'transport' || file === 'a_preparer') && (
            <FeuilleDeRouteCamionnette orders={orders} actions={actions} reglages={reglages ?? REGLAGES_RECEPTION_DEFAUT} />
          )}
        </div>

        {/* Cartes */}
        <div className="space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pb-4 xl:pr-1">
          {chargement && orders.length === 0 ? (
            <Squelettes nombre={4} />
          ) : erreur && orders.length === 0 ? null : liste.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#1A1A1A] px-6 py-12 text-center">
              <Inbox className="h-8 w-8 text-gray-400" aria-hidden />
              <p className="max-w-xs text-[15px] text-gray-200">
                {enRecherche
                  ? `Aucune commande ne correspond à « ${q} ». Essayez avec le téléphone ou le n° de commande.`
                  : VIDE_PAR_FILE[file]}
              </p>
            </div>
          ) : (
            <>
              {visibles.map(o => (
                // Une commande mal formée ne remplace que sa propre carte.
                <FrontiereCommande key={o.id} cle={versionDe(o)} numero={o.orderNumber}>
                  <CarteCommande
                    commande={o}
                    maintenant={maintenant}
                    nouvelle={!!o.id && nonVues.has(o.id)}
                    selectionnee={!!o.id && o.id === commandeOuverteId}
                    afficherStatut={afficherStatut}
                    onOuvrir={ouvrir}
                    reglages={reglages}
                  />
                </FrontiereCommande>
              ))}
              {visibles.length < liste.length && (
                <button
                  type="button"
                  onClick={() => setLimite(l => l + TAILLE_PAGE)}
                  className={`${BOUTON_SECONDAIRE} w-full`}
                >
                  Afficher plus ({liste.length - visibles.length} de plus)
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* ─── Fiche : à droite sur grand écran ─── */}
      {grandEcran && (
        <section
          ref={panneau}
          aria-label="Fiche de la commande"
          onKeyDown={echapPanneau}
          className="hidden min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] xl:block"
        >
          {fiche ?? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
              <MousePointerClick className="h-8 w-8 text-gray-400" aria-hidden />
              <p className="text-base font-semibold text-gray-200">Choisissez une commande</p>
              <p className="max-w-xs text-sm text-gray-400">
                Cliquez sur une carte pour voir le détail, joindre le client et faire avancer la commande.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ─── Fiche : plein écran sur téléphone ─── */}
      {!grandEcran && commandeOuverteId && (
        <CouchePleinEcran onFermer={fermer} cle={commandeOuverteId}>{fiche}</CouchePleinEcran>
      )}
    </div>
  );
}

// ─── Plein écran (téléphone, tablette) ───────────────────────────────────────

function estChampDeSaisie(cible: EventTarget | null): boolean {
  const el = cible as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Une boîte de confirmation ou un menu Radix est ouvert : Échap est pour eux. */
function couchesRadixOuvertes(): boolean {
  return !!document.querySelector('[role="alertdialog"], [role="menu"]');
}

function CouchePleinEcran({ onFermer, cle, children }: { onFermer: () => void; cle: string; children: ReactNode }) {
  const couche = useRef<HTMLDivElement>(null);
  const onFermerRef = useRef(onFermer);
  useEffect(() => { onFermerRef.current = onFermer; }, [onFermer]);

  // À l'ouverture : le focus va dans la fiche, la page derrière ne défile plus, Échap ferme.
  // À la fermeture : le focus revient là où il était (la carte).
  // Le geste « retour » du téléphone ferme aussi la fiche : la coque lui a donné
  // sa propre entrée dans l'historique du navigateur.
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    couche.current?.focus({ preventScroll: true });
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (estChampDeSaisie(e.target) || couchesRadixOuvertes()) return;
      onFermerRef.current();
    };
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('keydown', auClavier);
      document.body.style.overflow = debordement;
      if (precedent && document.contains(precedent)) precedent.focus({ preventScroll: true });
    };
  }, []);

  // Autre commande ouverte depuis l'historique du client : on repart du haut.
  useEffect(() => { couche.current?.scrollTo({ top: 0 }); }, [cle]);

  return (
    <div
      ref={couche}
      role="dialog"
      aria-modal="true"
      aria-label="Fiche de la commande"
      tabIndex={-1}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-[#141414] focus:outline-none"
    >
      {children}
    </div>
  );
}
