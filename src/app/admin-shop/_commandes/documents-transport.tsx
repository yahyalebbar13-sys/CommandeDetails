'use client';

// ─── Papiers des rouleaux, du retrait et de la tournée ───────────────────────
// Dans la fiche d'une commande : le devis de transport (rouleau, prix annoncé au
// téléphone), le bon de retrait (le client vient au magasin) et le bon de remise
// au transporteur de Derb Omar. Dans l'écran des commandes : la feuille de route
// de la camionnette LEBTEX pour les commandes cochées.
//
// Ce qu'on tape ici (prix, transporteur, poids…) ne sert qu'au papier : rien ne
// s'enregistre dans la commande, que le client peut lire. Ce qui est convenu au
// téléphone se note dans la note interne.
//
// Les modules PDF ne se chargent qu'au clic (documents-commande.ts). Même écran
// pour l'administrateur et l'équipe /staff : le RIB imprimé sur le devis est celui
// que le client voit déjà sur la page de sa commande.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, FileDown, Loader2, Route } from 'lucide-react';
import type { ShopOrder } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import {
  moyenPaiementDe, NOMS_LIEUX, PLAFOND_ESPECES_TOURNEE, prixCamionnette, receptionDe, transportPrevu,
} from '@/lib/commandes-boutique';
import type { ReglagesReception } from '@/lib/reglages-reception';
import type { PaiementTransport } from '@/lib/pdf-livraison-docs';
import type { ActionsCommandes } from './actions-commandes';
import { BOUTON_SECONDAIRE } from './elements';
import { aEncaisserParDefaut, commandesCamionnette, nombreSaisi, STATUTS_COCHES } from './outils-ecran';
import {
  telechargerBonRemiseTransporteur, telechargerBonRetrait, telechargerDevisTransport, telechargerFeuilleDeRoute,
} from './documents-commande';

// ─── Petits outils ────────────────────────────────────────────────────────────

/** Entier positif (nombre de colis) ; vide ou illisible → undefined (la case s'imprime vide). */
function entierSaisi(v: string): number | undefined {
  const n = nombreSaisi(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Nombre positif ou undefined (poids). */
function positifSaisi(v: string): number | undefined {
  const n = nombreSaisi(v);
  return n !== null && n > 0 ? n : undefined;
}

const texteOuRien = (v: string) => v.trim() || undefined;

/** Aujourd'hui au Maroc, « AAAA-MM-JJ » (valeur d'un champ date). */
function aujourdhuiMaroc(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 16 px dans les champs : en dessous, le téléphone zoome sur la page. 44 px de haut. */
const CHAMP = 'mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#1A1A1A] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none';

function Champ({
  libelle, valeur, onChange, exemple, requis = false, type = 'text', inputMode, erreur, aide,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  exemple?: string;
  requis?: boolean;
  type?: 'text' | 'tel' | 'date';
  inputMode?: 'decimal' | 'numeric' | 'tel' | 'text';
  erreur?: string;
  aide?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-gray-200">
        {libelle}{requis && <span className="text-red-300" aria-hidden> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        placeholder={exemple}
        inputMode={inputMode}
        maxLength={120}
        aria-invalid={!!erreur}
        aria-describedby={erreur || aide ? `${id}-aide` : undefined}
        className={`${CHAMP} ${erreur ? 'border-red-400/70' : ''}`}
      />
      {(erreur || aide) && (
        <p id={`${id}-aide`} className={`mt-1 text-sm ${erreur ? 'text-red-300' : 'text-gray-400'}`}>{erreur || aide}</p>
      )}
    </div>
  );
}

function Choix<T extends string>({ legende, valeur, options, onChange }: {
  legende: string;
  valeur: T;
  options: { valeur: T; libelle: string }[];
  onChange: (v: T) => void;
}) {
  const nom = useId();
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-200">{legende}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(o => (
          <label
            key={o.valeur}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${
              valeur === o.valeur ? 'border-sky-400/60 bg-sky-400/10 text-gray-100' : 'border-white/15 text-gray-300 hover:bg-white/5'
            }`}
          >
            <input type="radio" name={nom} checked={valeur === o.valeur} onChange={() => onChange(o.valeur)} className="h-4 w-4 accent-sky-400" />
            {o.libelle}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Un bouton qui télécharge, avec son état (préparation, erreur) juste en dessous. */
function useTelechargement() {
  const [etat, setEtat] = useState<{ en: string | null; erreur: string | null; pour: string | null }>({ en: null, erreur: null, pour: null });
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);
  async function lancer(cle: string, travail: () => Promise<void>) {
    if (etat.en) return;
    setEtat({ en: cle, erreur: null, pour: null });
    try {
      await travail();
      if (monte.current) setEtat({ en: null, erreur: null, pour: null });
    } catch (e) {
      if (monte.current) setEtat({ en: null, erreur: (e as Error)?.message || 'Le document n’a pas pu être préparé.', pour: cle });
    }
  }
  return { etat, lancer };
}

function BoutonDocument({ enCours, onClick, children, disabled = false }: { enCours: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={enCours || disabled} className={BOUTON_SECONDAIRE}>
      {enCours ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Préparation…</> : <><FileDown className="h-4 w-4" aria-hidden /> {children}</>}
    </button>
  );
}

// ─── Dans la fiche : devis, bon de retrait, bon de remise ─────────────────────

type Boite = 'devis' | 'remise' | null;

/**
 * Les papiers qui vont avec le mode de réception de la commande. Rien pour un colis
 * Sendit ordinaire (le bon de livraison et l'étiquette Sendit suffisent).
 */
export function DocumentsReception({ commande: o, reglages, paiementRecu }: {
  commande: ShopOrder;
  reglages: ReglagesReception;
  /** « Paiement reçu » noté par l'administrateur : le bon de retrait dit « rien à encaisser ». */
  paiementRecu: boolean;
}) {
  const r = receptionDe(o);
  const prevu = transportPrevu(o);
  // Un rouleau commandé « à domicile » ne part pas par Sendit : il se traite comme un transport.
  const transport = r.mode === 'transport' || (r.mode === 'domicile' && r.volumineux);
  const avecDevis = r.volumineux || r.mode === 'transport';
  const avecRetrait = r.mode === 'retrait';
  const { etat, lancer } = useTelechargement();
  const [boite, setBoite] = useState<Boite>(null);
  const idBoite = useId();

  // Ce qui sert au devis et au bon de remise : tapé une fois, gardé tant que la fiche est ouverte.
  const prixCam = prixCamionnette(o, reglages);
  const [modeTransport, setModeTransport] = useState<'camionnette' | 'transporteur'>(prevu);
  const [prix, setPrixBrut] = useState(prevu === 'camionnette' && prixCam !== null ? String(prixCam) : '');
  // Tapé à la main : on n'y touche plus. Sinon, le prix suit les réglages, qui arrivent
  // après le premier affichage (valeurs par défaut d'abord, 50 / 80 DH).
  const [prixTouche, setPrixTouche] = useState(false);
  const setPrix = (v: string) => { setPrixTouche(true); setPrixBrut(v); };
  useEffect(() => {
    if (prixTouche) return;
    setPrixBrut(modeTransport === 'camionnette' && prixCam !== null ? String(prixCam) : '');
  }, [prixCam, modeTransport, prixTouche]);
  const [paiementTransport, setPaiementTransport] = useState<PaiementTransport>('avec_la_commande');
  // Ce que le transporteur HABITUEL encaisse pour LEBTEX : le total si le client paie en espèces
  // et que rien n'est encore reçu, sinon rien. Un chauffeur inconnu n'encaisse jamais (laisser vide).
  const aEncaisserDefaut = moyenPaiementDe(o) === 'cod' && !paiementRecu && prevu === 'transporteur' ? String(Number(o.total) || 0) : '';
  const [aEncaisserRemise, setAEncaisserRemise] = useState(aEncaisserDefaut);
  const [aEncaisserTouche, setAEncaisserTouche] = useState(false);
  useEffect(() => { if (!aEncaisserTouche) setAEncaisserRemise(aEncaisserDefaut); }, [aEncaisserDefaut, aEncaisserTouche]);
  const [transporteur, setTransporteur] = useState('');
  const [telTransporteur, setTelTransporteur] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [plaque, setPlaque] = useState('');
  const [ville, setVille] = useState(String(o.shippingAddress?.city ?? ''));
  const [depot, setDepot] = useState('');
  const [poids, setPoids] = useState('');
  const [colis, setColis] = useState('');
  const [delai, setDelai] = useState('');
  const [numeroEnvoi, setNumeroEnvoi] = useState('');
  const [tente, setTente] = useState<Boite>(null);

  if (!avecDevis && !avecRetrait && !transport) return null;

  const prixLu = nombreSaisi(prix);
  const erreurPrix = tente && (boite === 'devis' || (boite === 'remise' && paiementTransport === 'a_l_arrivee')) && prixLu === null
    ? 'Le prix annoncé au client, en DH (0 si offert).'
    : undefined;
  const erreurTransporteur = tente === 'remise' && !transporteur.trim() ? 'Le nom du transporteur est obligatoire sur le bon de remise.' : undefined;
  const aEncaisserLu = aEncaisserRemise.trim() ? nombreSaisi(aEncaisserRemise) : 0;
  const erreurAEncaisser = tente === 'remise' && aEncaisserLu === null ? 'Un montant en DH (laissez vide si le transporteur n’encaisse rien).' : undefined;

  const ouvrir = (b: Exclude<Boite, null>) => { setBoite(v => (v === b ? null : b)); setTente(null); };

  function devis() {
    setTente('devis');
    if (prixLu === null) return;
    const estTransporteur = modeTransport === 'transporteur';
    void lancer('devis', () => telechargerDevisTransport(o, {
      reglages,
      mode: modeTransport,
      prixTransport: prixLu,
      ...(estTransporteur ? {
        paiementTransport,
        transporteur: texteOuRien(transporteur),
        villeDestination: texteOuRien(ville),
        depot: texteOuRien(depot),
      } : {}),
      poidsEstimeKg: positifSaisi(poids),
      nbColis: entierSaisi(colis),
      delai: texteOuRien(delai),
    }));
  }

  function remise() {
    setTente('remise');
    if (!transporteur.trim()) return;
    if (paiementTransport === 'a_l_arrivee' && prixLu === null) return;
    if (aEncaisserLu === null) return;
    void lancer('remise', () => telechargerBonRemiseTransporteur(o, {
      transporteur: transporteur.trim(),
      telephoneTransporteur: texteOuRien(telTransporteur),
      chauffeur: texteOuRien(chauffeur),
      plaque: texteOuRien(plaque),
      villeDestination: texteOuRien(ville),
      depot: texteOuRien(depot),
      nbColis: entierSaisi(colis),
      poidsKg: positifSaisi(poids),
      numeroEnvoi: texteOuRien(numeroEnvoi),
      paiementTransport,
      ...(paiementTransport === 'a_l_arrivee' && prixLu !== null ? { prixTransport: prixLu } : {}),
      ...(aEncaisserLu && aEncaisserLu > 0 ? { aEncaisser: aEncaisserLu } : {}),
    }));
  }

  const champsTransporteur = (
    <>
      <Champ libelle="Transporteur" valeur={transporteur} onChange={setTransporteur} exemple="ex. Transports Atlas (Derb Omar)" requis={boite === 'remise'} erreur={boite === 'remise' ? erreurTransporteur : undefined} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Ville de destination" valeur={ville} onChange={setVille} exemple="ex. Agadir" />
        <Champ libelle="Dépôt du transporteur (où le client récupère)" valeur={depot} onChange={setDepot} exemple="adresse du dépôt" />
      </div>
      <Choix<PaiementTransport>
        legende="Le transport se paie"
        valeur={paiementTransport}
        onChange={setPaiementTransport}
        options={[
          { valeur: 'avec_la_commande', libelle: 'avec la commande (à LEBTEX)' },
          { valeur: 'a_l_arrivee', libelle: 'au transporteur, à l’arrivée' },
        ]}
      />
    </>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap gap-2">
        {avecRetrait && (
          <BoutonDocument
            enCours={etat.en === 'retrait'}
            disabled={!!etat.en}
            onClick={() => void lancer('retrait', () => telechargerBonRetrait(o, reglages, { paiementRecu }))}
          >
            Bon de retrait ({NOMS_LIEUX[r.lieu]})
          </BoutonDocument>
        )}
        {avecDevis && (
          <button type="button" onClick={() => ouvrir('devis')} aria-expanded={boite === 'devis'} aria-controls={idBoite} className={BOUTON_SECONDAIRE}>
            <FileDown className="h-4 w-4" aria-hidden /> Devis de transport
            <ChevronDown className={`h-4 w-4 transition-transform ${boite === 'devis' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
        {transport && (
          <button type="button" onClick={() => ouvrir('remise')} aria-expanded={boite === 'remise'} aria-controls={idBoite} className={BOUTON_SECONDAIRE}>
            <FileDown className="h-4 w-4" aria-hidden /> Bon de remise au transporteur
            <ChevronDown className={`h-4 w-4 transition-transform ${boite === 'remise' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      {etat.erreur && etat.pour === 'retrait' && <p role="alert" className="text-sm text-red-300">Bon non préparé : {etat.erreur}</p>}

      {boite === 'devis' && (
        <div id={idBoite} className="space-y-3 rounded-xl border border-white/10 bg-[#141414] p-3">
          <p className="text-sm text-gray-300">
            Le prix convenu au téléphone, valable 48 h. Le RIB n’apparaît que si le virement est actif dans « Réception & paiement ».
          </p>
          <Choix<'camionnette' | 'transporteur'>
            legende="Transport"
            valeur={modeTransport}
            // Le prix de la camionnette des réglages suit, tant que rien n'a été tapé à la main (effet plus haut).
            onChange={m => setModeTransport(m)}
            options={[
              { valeur: 'camionnette', libelle: 'Camionnette LEBTEX (Casablanca et environs)' },
              { valeur: 'transporteur', libelle: 'Transporteur jusqu’à son dépôt' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ
              libelle="Prix du transport (DH)"
              valeur={prix}
              onChange={setPrix}
              exemple="ex. 80 (0 = offert)"
              inputMode="decimal"
              requis
              erreur={erreurPrix}
              aide={modeTransport === 'camionnette' && prixCam !== null ? `Réglages : ${prixCam === 0 ? 'offerte pour cette commande' : `${prixCam} DH`}.` : undefined}
            />
            <Champ libelle="Poids estimé (kg)" valeur={poids} onChange={setPoids} exemple="facultatif" inputMode="decimal" />
            <Champ libelle="Nombre de colis" valeur={colis} onChange={setColis} exemple="facultatif" inputMode="numeric" />
            <Champ libelle="Quand" valeur={delai} onChange={setDelai} exemple={modeTransport === 'camionnette' ? `tournée du ${reglages.camionnette.jours}` : 'départ demain, 1 à 2 jours'} />
          </div>
          {modeTransport === 'transporteur' && champsTransporteur}
          <BoutonDocument enCours={etat.en === 'devis'} disabled={!!etat.en} onClick={devis}>Télécharger le devis</BoutonDocument>
          {etat.erreur && etat.pour === 'devis' && <p role="alert" className="text-sm text-red-300">Devis non préparé : {etat.erreur}</p>}
        </div>
      )}

      {boite === 'remise' && (
        <div id={idBoite} className="space-y-3 rounded-xl border border-white/10 bg-[#141414] p-3">
          <p className="text-sm text-gray-300">
            À signer par le chauffeur du transporteur au chargement. Il livre jusqu’à son dépôt ; le client y récupère la marchandise.
            Seul un transporteur habituel peut encaisser pour LEBTEX (le montant s’imprime sur le bon) ; un chauffeur inconnu
            n’encaisse jamais : laissez alors le montant vide, le bon dit « rien à encaisser ».
          </p>
          {champsTransporteur}
          <Champ
            libelle="À encaisser auprès du client pour LEBTEX (DH) — transporteur habituel seulement"
            valeur={aEncaisserRemise}
            onChange={v => { setAEncaisserTouche(true); setAEncaisserRemise(v); }}
            exemple="vide = rien à encaisser"
            inputMode="decimal"
            erreur={erreurAEncaisser}
            aide={paiementRecu
              ? 'Paiement déjà reçu : rien à encaisser.'
              : moyenPaiementDe(o) === 'cod' ? 'Client en espèces : prérempli avec le total de la commande, comme convenu au téléphone.' : 'Virement choisi : rien à encaisser, sauf arrangement.'}
          />
          {paiementTransport === 'a_l_arrivee' && (
            <Champ libelle="Prix du transport (DH), payé par le client à l’arrivée" valeur={prix} onChange={setPrix} exemple="ex. 150" inputMode="decimal" requis erreur={erreurPrix} />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle="Téléphone du transporteur" valeur={telTransporteur} onChange={setTelTransporteur} type="tel" inputMode="tel" exemple="facultatif" />
            <Champ libelle="Chauffeur" valeur={chauffeur} onChange={setChauffeur} exemple="facultatif" />
            <Champ libelle="Plaque du camion" valeur={plaque} onChange={setPlaque} exemple="facultatif" />
            <Champ libelle="N° d’envoi (bordereau)" valeur={numeroEnvoi} onChange={setNumeroEnvoi} exemple="facultatif" />
            <Champ libelle="Nombre de colis" valeur={colis} onChange={setColis} exemple="facultatif" inputMode="numeric" />
            <Champ libelle="Poids (kg)" valeur={poids} onChange={setPoids} exemple="facultatif" inputMode="decimal" />
          </div>
          <BoutonDocument enCours={etat.en === 'remise'} disabled={!!etat.en} onClick={remise}>Télécharger le bon de remise</BoutonDocument>
          {etat.erreur && etat.pour === 'remise' && <p role="alert" className="text-sm text-red-300">Bon non préparé : {etat.erreur}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Dans l'écran des commandes : feuille de route de la camionnette ──────────

/** `touche` : montant corrigé à la main, que l'arrivée des réglages ne doit plus écraser. */
interface ArretSaisi { coche: boolean; aEncaisser: string; colis: string; touche: boolean }

export function FeuilleDeRouteCamionnette({ orders, actions, reglages }: {
  orders: ShopOrder[];
  actions: ActionsCommandes;
  reglages: ReglagesReception;
}) {
  const candidates = useMemo(() => commandesCamionnette(orders), [orders]);
  const [ouverte, setOuverte] = useState(false);
  const [saisies, setSaisies] = useState<Record<string, ArretSaisi>>({});
  const [jour, setJour] = useState(aujourdhuiMaroc);
  const [chauffeur, setChauffeur] = useState('');
  const [vehicule, setVehicule] = useState('');
  const { etat, lancer } = useTelechargement();
  const idBoite = useId();

  // Une commande arrivée dans la liste prend ses valeurs par défaut ; ce qui a été tapé reste.
  // Un montant jamais corrigé suit les réglages (ils arrivent après le premier affichage).
  useEffect(() => {
    setSaisies(avant => {
      const suite: Record<string, ArretSaisi> = {};
      for (const o of candidates) {
        const id = o.id as string;
        const defaut = String(aEncaisserParDefaut(o, reglages));
        const deja = avant[id];
        suite[id] = deja
          ? (deja.touche ? deja : { ...deja, aEncaisser: defaut })
          : { coche: STATUTS_COCHES.includes(o.status), aEncaisser: defaut, colis: '', touche: false };
      }
      return suite;
    });
  }, [candidates, reglages]);

  if (!candidates.length) return null;

  const cochees = candidates.filter(o => saisies[o.id as string]?.coche);
  const montantDe = (o: ShopOrder) => nombreSaisi(saisies[o.id as string]?.aEncaisser ?? '') ?? 0;
  const especes = cochees.reduce((s, o) => s + montantDe(o), 0);
  // Virements (ou cartes) annoncés, pas encore vérifiés : comptés au pire cas, et dits à part.
  const nonVus = cochees.filter(o => moyenPaiementDe(o) !== 'cod').reduce((s, o) => s + montantDe(o), 0);
  const especesSures = especes - nonVus;
  const maj = (id: string, champ: Partial<ArretSaisi>) => setSaisies(s => ({ ...s, [id]: { ...s[id], ...champ } }));

  function telecharger() {
    if (!cochees.length) return;
    void lancer('feuille', async () => {
      // Le chauffeur n'encaisse pas ce qui est déjà payé : l'état du paiement noté par
      // l'administrateur, relu pour chaque arrêt. Illisible : on le traite comme non payé
      // (la feuille le signale « à vérifier » pour un virement), c'est le plus prudent.
      const arrets = await Promise.all(cochees.map(async o => {
        const s = saisies[o.id as string];
        let paiementRecu = false;
        if (actions.lireInterne) {
          try { paiementRecu = (await actions.lireInterne(o)).paiement?.recu === true; } catch { /* non payé */ }
        }
        const montant = nombreSaisi(s?.aEncaisser ?? '');
        return {
          commande: o,
          paiementRecu,
          nbColis: entierSaisi(s?.colis ?? ''),
          ...(montant !== null ? { aEncaisser: montant } : {}),
        };
      }));
      await telechargerFeuilleDeRoute(arrets, {
        date: new Date(`${jour || aujourdhuiMaroc()}T12:00:00Z`),
        chauffeur: texteOuRien(chauffeur),
        vehicule: texteOuRien(vehicule),
      });
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1A1A]">
      <button
        type="button"
        onClick={() => setOuverte(v => !v)}
        aria-expanded={ouverte}
        aria-controls={idBoite}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
      >
        <span className="flex items-center gap-2">
          <Route className="h-4 w-4 text-gray-400" aria-hidden /> Feuille de route camionnette ({candidates.length})
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${ouverte ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {ouverte && (
        <div id={idBoite} className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3">
          <p className="text-sm text-gray-300">
            Rouleaux livrés par la camionnette LEBTEX. Cochées d’office : en préparation ou déjà remises au chauffeur.
            « À encaisser » : le total, plus la camionnette si elle n’y est pas ; corrigez selon ce qui a été convenu.
          </p>
          <ul className="space-y-2">
            {candidates.map(o => {
              const id = o.id as string;
              const s = saisies[id];
              if (!s) return null;
              const moyen = moyenPaiementDe(o);
              return (
                <li key={id} className="rounded-xl border border-white/10 bg-[#141414] p-2.5">
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={s.coche} onChange={e => maj(id, { coche: e.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-[#C8102E]" />
                    <span className="min-w-0 text-sm">
                      <span className="block font-semibold text-gray-100">
                        {o.orderNumber} · {o.customerName || o.shippingAddress?.fullName || 'Client sans nom'}
                      </span>
                      <span className="block text-gray-400">
                        {[
                          o.shippingAddress?.city,
                          o.status === 'confirmed' ? 'confirmée, pas encore préparée' : null,
                          moyen === 'virement' ? 'virement : vérifié à l’impression' : moyen === 'carte' ? 'carte : vérifiée à l’impression' : null,
                        ]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                  {s.coche && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-8">
                      <Champ libelle="À encaisser (DH)" valeur={s.aEncaisser} onChange={v => maj(id, { aEncaisser: v, touche: true })} inputMode="decimal" />
                      <Champ libelle="Colis" valeur={s.colis} onChange={v => maj(id, { colis: v })} inputMode="numeric" exemple="facultatif" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ libelle="Jour de la tournée" valeur={jour} onChange={setJour} type="date" />
            <Champ libelle="Chauffeur LEBTEX" valeur={chauffeur} onChange={setChauffeur} exemple="lui seul encaisse" />
            <Champ libelle="Véhicule" valeur={vehicule} onChange={setVehicule} exemple="facultatif" />
          </div>
          <p className="text-sm text-gray-300">
            {cochees.length} arrêt{cochees.length > 1 ? 's' : ''} · espèces attendues au plus : <strong className="text-gray-100">{formatPrice(especes)}</strong>
            {nonVus > 0 && <> (dont {formatPrice(nonVus)} de virements ou cartes annoncés, pas encore vérifiés)</>}
          </p>
          {especesSures > PLAFOND_ESPECES_TOURNEE ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Plus de {formatPrice(PLAFOND_ESPECES_TOURNEE)} d’espèces pour une tournée : proposez le virement aux clients qui paient en espèces, ou partagez la tournée.
            </p>
          ) : especes > PLAFOND_ESPECES_TOURNEE ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Plus de {formatPrice(PLAFOND_ESPECES_TOURNEE)} d’espèces si les virements annoncés n’arrivent pas : vérifiez-les avant le départ
              (la feuille imprimée dit « déjà payé » pour ceux qui sont reçus).
            </p>
          ) : null}
          <BoutonDocument enCours={etat.en === 'feuille'} disabled={!!etat.en || !cochees.length} onClick={telecharger}>
            Télécharger la feuille de route
          </BoutonDocument>
          {!cochees.length && <p className="text-sm text-gray-400">Cochez au moins une commande.</p>}
          {etat.erreur && <p role="alert" className="text-sm text-red-300">Feuille non préparée : {etat.erreur}</p>}
        </div>
      )}
    </div>
  );
}
