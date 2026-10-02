'use client';

// ─── Réception & paiement ────────────────────────────────────────────────────
// Ce que le patron règle lui-même, sans toucher au code : les magasins où l'on
// retire une commande (Derb Omar pour les petits articles, CHRIFA pour les
// rouleaux), le virement (RIB montré au client après sa commande), la camionnette
// (prix d'essai, jours de tournée) et, plus tard, la carte bancaire.
//
// Enregistré dans shop_catalogue_settings/reception par le navigateur de
// l'administrateur (les règles Firestore n'ouvrent l'écriture qu'à lui ; la
// lecture est publique : la boutique, la fiche des commandes et les e-mails la
// lisent). Rien de secret ici : un RIB se donne au client pour qu'il paie.
//
// Écran de l'administrateur seulement : l'espace équipe /staff ne l'a pas.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { AlertCircle, AlertTriangle, Check, CreditCard, Landmark, Loader2, RefreshCw, Save, Store, Truck } from 'lucide-react';
import {
  CHEMIN_REGLAGES_RECEPTION, lireReglagesReception, ribLisible, ribValide, type LieuDeRetrait, type ReglagesReception,
} from '@/lib/reglages-reception';
import type { LieuRetrait } from '@/lib/shop-types';
import { dateHeure, PLAFOND_ESPECES_TOURNEE } from '@/lib/commandes-boutique';
import { formatPrice } from '@/lib/shop-utils';
import { oublierReglagesReception } from '../_commandes/actions-commandes';

const CARTE = 'bg-[#1A1A1A] rounded-2xl border border-white/5 p-4 md:p-6';
const CHAMP = 'mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-[#141414] px-3 text-base text-gray-100 placeholder:text-gray-400 focus:border-white/40 focus:outline-none disabled:opacity-60';
/** Sans réponse du serveur au-delà, on le dit (hors ligne, Firestore garde l'écriture en attente sans fin). */
const DELAI_ENREGISTREMENT_MS = 15_000;

const LIEUX: { cle: LieuRetrait; titre: string; aide: string }[] = [
  { cle: 'derb_omar', titre: 'Magasin de Derb Omar', aide: 'Petits articles : préparés et retirés ici. Sendit y ramasse les colis.' },
  { cle: 'chrifa', titre: 'CHRIFA (le stock)', aide: 'Rouleaux entiers et articles volumineux : préparés et retirés ici.' },
];

/** Le formulaire : les nombres restent du texte tant qu'on tape (« 1 500 », « 50,5 »). */
interface Formulaire {
  lieux: Record<LieuRetrait, LieuDeRetrait>;
  virement: { actif: boolean; titulaire: string; banque: string; rib: string };
  camionnette: { actif: boolean; prixCasablanca: string; prixPeripherie: string; jours: string };
}

function versFormulaire(r: ReglagesReception, virementActifDemande: boolean): Formulaire {
  return {
    lieux: { derb_omar: { ...r.lieux.derb_omar }, chrifa: { ...r.lieux.chrifa } },
    // La case telle que cochée par le patron : lireReglagesReception la décoche si le RIB est incomplet.
    virement: { actif: virementActifDemande, titulaire: r.virement.titulaire, banque: r.virement.banque, rib: ribLisible(r.virement.rib) },
    camionnette: {
      actif: r.camionnette.actif,
      prixCasablanca: String(r.camionnette.prixCasablanca),
      prixPeripherie: String(r.camionnette.prixPeripherie),
      jours: r.camionnette.jours,
    },
  };
}

/** « 1 500 », « 50,5 », « 80 DH » → nombre ; vide ou illisible → null. */
function nombreLu(v: string): number | null {
  const propre = v.replace(/\s|dh|mad/gi, '').replace(',', '.');
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const lienHttps = (v: string) => {
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
};

/** Ce qui empêche d'enregistrer, champ par champ (clé = chemin du champ). */
function problemes(f: Formulaire): Record<string, string> {
  const p: Record<string, string> = {};
  for (const { cle } of LIEUX) {
    const l = f.lieux[cle];
    if (!l.nom.trim()) p[`${cle}.nom`] = 'Le nom est obligatoire.';
    if (!l.adresse.trim()) p[`${cle}.adresse`] = 'L’adresse est obligatoire : c’est elle que le client reçoit.';
    if (l.lienMaps.trim() && !lienHttps(l.lienMaps.trim())) p[`${cle}.lienMaps`] = 'Collez le lien complet, qui commence par https://';
  }
  const rib = f.virement.rib.replace(/\s/g, '');
  if (rib && !ribValide(rib)) p['virement.rib'] = `Un RIB marocain a 24 chiffres (ici : ${rib.replace(/\D/g, '').length}).`;
  if (f.virement.actif) {
    if (!f.virement.titulaire.trim()) p['virement.titulaire'] = 'Le titulaire du compte est obligatoire pour proposer le virement.';
    if (!rib) p['virement.rib'] = 'Le RIB est obligatoire pour proposer le virement.';
  }
  for (const champ of ['prixCasablanca', 'prixPeripherie'] as const) {
    if (nombreLu(f.camionnette[champ]) === null) p[`camionnette.${champ}`] = 'Un montant en DH (0 ou plus).';
  }
  if (f.camionnette.actif && !f.camionnette.jours.trim()) p['camionnette.jours'] = 'Indiquez les jours de tournée (ex. mardi et jeudi).';
  return p;
}

/** Ce qui part dans Firestore : des nombres, un RIB sans espaces, la carte toujours éteinte. */
function versDocument(f: Formulaire) {
  const propre = (l: LieuDeRetrait): LieuDeRetrait => ({
    nom: l.nom.trim(), adresse: l.adresse.trim(), lienMaps: l.lienMaps.trim(), telephone: l.telephone.trim(),
    horaires: l.horaires.trim(), actif: l.actif,
  });
  return {
    lieux: { derb_omar: propre(f.lieux.derb_omar), chrifa: propre(f.lieux.chrifa) },
    virement: {
      actif: f.virement.actif,
      titulaire: f.virement.titulaire.trim(),
      banque: f.virement.banque.trim(),
      rib: f.virement.rib.replace(/\s/g, ''),
    },
    camionnette: {
      actif: f.camionnette.actif,
      prixCasablanca: nombreLu(f.camionnette.prixCasablanca) ?? 0,
      prixPeripherie: nombreLu(f.camionnette.prixPeripherie) ?? 0,
      jours: f.camionnette.jours.trim(),
    },
    // Pas de prestataire de paiement en ligne aujourd'hui : l'écran ne peut pas l'allumer.
    carte: { actif: false },
    majLe: new Date().toISOString(),
  };
}

function messageErreur(err: unknown): string {
  const code = String((err as { code?: string })?.code || '').replace(/^firestore\//, '');
  if (code === 'permission-denied') return 'Accès refusé : seul le compte administrateur peut enregistrer ces réglages. Reconnectez-vous puis réessayez.';
  if (code === 'unavailable') return 'Pas de connexion au serveur : rien n’a été enregistré. Réessayez quand Internet revient.';
  if (code === 'delai') {
    return 'Le serveur n’a pas répondu : l’enregistrement partira peut-être au retour de la connexion. Rechargez la page dans un moment pour vérifier.';
  }
  return `Pas enregistré${code ? ` (code : ${code})` : ''}. Réessayez dans un instant.`;
}

// ─── Petits morceaux ──────────────────────────────────────────────────────────

function Champ({
  libelle, aide, erreur, children,
}: { libelle: string; aide?: string; erreur?: string; children: (id: string, decrit?: string) => ReactNode }) {
  const id = useId();
  const idAide = `${id}-aide`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-200">{libelle}</label>
      {children(id, aide || erreur ? idAide : undefined)}
      {(erreur || aide) && (
        <p id={idAide} className={`mt-1 text-xs ${erreur ? 'text-red-300' : 'text-gray-400'}`}>{erreur || aide}</p>
      )}
    </div>
  );
}

function Case({
  coche, onChange, libelle, aide, desactivee = false,
}: { coche: boolean; onChange?: (v: boolean) => void; libelle: string; aide?: string; desactivee?: boolean }) {
  return (
    <label className={`flex min-h-[44px] items-start gap-3 rounded-xl border border-white/10 px-3 py-2.5 ${desactivee ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-white/5'}`}>
      <input
        type="checkbox"
        checked={coche}
        disabled={desactivee}
        onChange={e => onChange?.(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#C8102E]"
      />
      <span>
        <span className="block text-[15px] font-semibold text-gray-100">{libelle}</span>
        {aide && <span className="mt-0.5 block text-sm text-gray-400">{aide}</span>}
      </span>
    </label>
  );
}

function TitreSection({ icone, titre, sousTitre }: { icone: ReactNode; titre: string; sousTitre?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-gray-200" aria-hidden>{icone}</span>
      <div>
        <h2 className="text-base font-bold text-white">{titre}</h2>
        {sousTitre && <p className="mt-0.5 text-sm text-gray-400">{sousTitre}</p>}
      </div>
    </div>
  );
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export function EcranReception({ db, zoneSendit }: {
  db: Firestore;
  /** Emplacement réservé : l'état de la connexion Sendit, monté par l'intégrateur. */
  zoneSendit?: ReactNode;
}) {
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [erreurLecture, setErreurLecture] = useState('');
  const [initial, setInitial] = useState<Formulaire | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [majLe, setMajLe] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<'repos' | 'envoi' | 'fait' | 'erreur'>('repos');
  const [erreurEnregistrement, setErreurEnregistrement] = useState('');
  const [tenteEnregistrer, setTenteEnregistrer] = useState(false);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  const charger = useCallback(async () => {
    setEtat('chargement');
    setErreurLecture('');
    try {
      const snap = await getDoc(doc(db, CHEMIN_REGLAGES_RECEPTION.collection, CHEMIN_REGLAGES_RECEPTION.document));
      if (!monte.current) return;
      const brut = snap.exists() ? snap.data() : undefined;
      const reglages = lireReglagesReception(brut);
      const f = versFormulaire(reglages, (brut as any)?.virement?.actif === true);
      setInitial(f);
      setForm(f);
      setMajLe(reglages.majLe ?? null);
      setEtat('pret');
    } catch (err) {
      if (!monte.current) return;
      setErreurLecture(messageErreur(err));
      setEtat('erreur');
    }
  }, [db]);

  useEffect(() => { void charger(); }, [charger]);

  const modifie = useMemo(() => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const erreurs = useMemo(() => (form ? problemes(form) : {}), [form]);
  const nbErreurs = Object.keys(erreurs).length;
  // Les erreurs s'affichent après le premier essai d'enregistrement (pas pendant qu'on tape).
  const erreurDe = (cle: string) => (tenteEnregistrer ? erreurs[cle] : undefined);

  // Quitter la page avec des modifications : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return;
    const avantDePartir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avantDePartir);
    return () => window.removeEventListener('beforeunload', avantDePartir);
  }, [modifie]);

  const maj = (change: (f: Formulaire) => Formulaire) => {
    setForm(f => (f ? change(f) : f));
    if (enregistrement === 'fait' || enregistrement === 'erreur') setEnregistrement('repos');
  };
  const majLieu = (cle: LieuRetrait, champ: keyof LieuDeRetrait, valeur: string | boolean) =>
    maj(f => ({ ...f, lieux: { ...f.lieux, [cle]: { ...f.lieux[cle], [champ]: valeur } } }));

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!form || enregistrement === 'envoi') return;
    setTenteEnregistrer(true);
    if (nbErreurs > 0) return;
    setEnregistrement('envoi');
    setErreurEnregistrement('');
    const donnees = versDocument(form);
    try {
      let minuterie: ReturnType<typeof setTimeout> | undefined;
      const delai = new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(() => rejeter(Object.assign(new Error('délai'), { code: 'delai' })), DELAI_ENREGISTREMENT_MS);
      });
      try {
        await Promise.race([
          setDoc(doc(db, CHEMIN_REGLAGES_RECEPTION.collection, CHEMIN_REGLAGES_RECEPTION.document), donnees, { merge: true }),
          delai,
        ]);
      } finally {
        clearTimeout(minuterie);
      }
      // Les fiches des commandes relisent les nouveaux réglages tout de suite.
      oublierReglagesReception();
      if (!monte.current) return;
      setInitial(form);
      setMajLe(donnees.majLe);
      setEnregistrement('fait');
      setTenteEnregistrer(false);
    } catch (err) {
      if (!monte.current) return;
      setErreurEnregistrement(messageErreur(err));
      setEnregistrement('erreur');
    }
  }

  if (etat === 'chargement' && !form) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-3" role="status">
        <Loader2 className="h-7 w-7 animate-spin text-[#C8102E]" aria-hidden />
        <p className="text-sm text-gray-300">Chargement des réglages…</p>
      </div>
    );
  }

  if (etat === 'erreur' || !form) {
    // Jamais un formulaire rempli des valeurs par défaut : il écraserait les vrais réglages.
    return (
      <div role="alert" className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 sm:flex-row sm:items-center">
        <AlertCircle className="h-5 w-5 shrink-0 text-red-300" aria-hidden />
        <div className="flex-1 text-sm text-red-100">
          <p className="font-semibold">Les réglages n’ont pas pu être lus.</p>
          <p className="mt-0.5 text-red-200">{erreurLecture || 'Réessayez dans un instant.'}</p>
        </div>
        <button type="button" onClick={() => void charger()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-500/20 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/30">
          <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
        </button>
      </div>
    );
  }

  const rib = form.virement.rib.replace(/\s/g, '');
  const ribComplet = ribValide(rib);
  const virementPropose = form.virement.actif && ribComplet && !!form.virement.titulaire.trim();

  return (
    <form onSubmit={e => void enregistrer(e)} className="mx-auto max-w-3xl space-y-5 pb-28 md:pb-10" noValidate>
      <p className="text-sm text-gray-300">
        Ce que la boutique montre au client pour recevoir et payer sa commande. Les changements s’appliquent dès l’enregistrement
        (formulaire de commande, fiche des commandes, e-mails, messages WhatsApp).
        {majLe && <span className="text-gray-400"> Dernière mise à jour : {dateHeure(majLe)}.</span>}
      </p>

      {/* ── Magasins de retrait ── */}
      {LIEUX.map(({ cle, titre, aide }) => {
        const l = form.lieux[cle];
        return (
          <section key={cle} className={CARTE} aria-label={titre}>
            <TitreSection icone={<Store className="h-5 w-5" />} titre={titre} sousTitre={aide} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ libelle="Nom affiché au client" erreur={erreurDe(`${cle}.nom`)}>
                {(id, d) => <input id={id} aria-describedby={d} value={l.nom} maxLength={80} onChange={e => majLieu(cle, 'nom', e.target.value)} className={CHAMP} />}
              </Champ>
              <Champ libelle="Téléphone du magasin">
                {(id, d) => <input id={id} aria-describedby={d} type="tel" inputMode="tel" value={l.telephone} maxLength={40} onChange={e => majLieu(cle, 'telephone', e.target.value)} className={CHAMP} />}
              </Champ>
              <div className="sm:col-span-2">
                <Champ libelle="Adresse" aide="Telle que le client la lit dans le message « commande prête »." erreur={erreurDe(`${cle}.adresse`)}>
                  {(id, d) => <input id={id} aria-describedby={d} value={l.adresse} maxLength={300} onChange={e => majLieu(cle, 'adresse', e.target.value)} className={CHAMP} />}
                </Champ>
              </div>
              <div className="sm:col-span-2">
                <Champ libelle="Lien Google Maps" aide="Dans Google Maps : Partager → Copier le lien." erreur={erreurDe(`${cle}.lienMaps`)}>
                  {(id, d) => <input id={id} aria-describedby={d} type="url" inputMode="url" value={l.lienMaps} maxLength={500} onChange={e => majLieu(cle, 'lienMaps', e.target.value)} placeholder="https://maps.app.goo.gl/…" className={CHAMP} />}
                </Champ>
              </div>
              <div className="sm:col-span-2">
                <Champ libelle="Horaires" aide="Ex. Lundi au samedi, 8h30 – 12h30 et 14h – 18h.">
                  {(id, d) => <input id={id} aria-describedby={d} value={l.horaires} maxLength={120} onChange={e => majLieu(cle, 'horaires', e.target.value)} className={CHAMP} />}
                </Champ>
              </div>
              <div className="sm:col-span-2">
                <Case
                  coche={l.actif}
                  onChange={v => majLieu(cle, 'actif', v)}
                  libelle="Retrait proposé au client"
                  aide="Décochez si le magasin est fermé quelques jours : le retrait n’y est plus proposé."
                />
              </div>
            </div>
          </section>
        );
      })}

      {/* ── Virement ── */}
      <section className={CARTE} aria-label="Virement bancaire">
        <TitreSection
          icone={<Landmark className="h-5 w-5" />}
          titre="Virement bancaire"
          sousTitre="Le RIB s’affiche au client sur la page de sa commande, avec le n° de commande comme motif. Jamais envoyé seul par WhatsApp."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Titulaire du compte" erreur={erreurDe('virement.titulaire')}>
            {(id, d) => <input id={id} aria-describedby={d} value={form.virement.titulaire} maxLength={120} placeholder="ex. LEBTEX SARL AU"
              onChange={e => maj(f => ({ ...f, virement: { ...f.virement, titulaire: e.target.value } }))} className={CHAMP} />}
          </Champ>
          <Champ libelle="Banque">
            {(id, d) => <input id={id} aria-describedby={d} value={form.virement.banque} maxLength={120} placeholder="ex. CIH Bank"
              onChange={e => maj(f => ({ ...f, virement: { ...f.virement, banque: e.target.value } }))} className={CHAMP} />}
          </Champ>
          <div className="sm:col-span-2">
            <Champ
              libelle="RIB (24 chiffres)"
              erreur={erreurDe('virement.rib')}
              aide={rib ? (ribComplet ? undefined : `${rib.replace(/\D/g, '').length} chiffres sur 24`) : 'Les espaces sont acceptés.'}
            >
              {(id, d) => <input id={id} aria-describedby={d} value={form.virement.rib} inputMode="numeric" autoComplete="off" maxLength={40}
                onChange={e => maj(f => ({ ...f, virement: { ...f.virement, rib: e.target.value } }))}
                className={`${CHAMP} font-mono tracking-wider`} />}
            </Champ>
            {ribComplet && (
              <p className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-sm text-gray-200">
                <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <span>Tel que le client le lira : <strong className="font-mono tracking-wider text-white">{ribLisible(rib)}</strong></span>
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Case
              coche={form.virement.actif}
              onChange={v => maj(f => ({ ...f, virement: { ...f.virement, actif: v } }))}
              libelle="Proposer le virement aux clients"
              aide="Proposé seulement avec un titulaire et un RIB complet. Le client paie après sa commande ; vous notez « Paiement reçu » dans la fiche une fois l’argent vu sur le compte."
            />
            {form.virement.actif && !virementPropose && (
              <p className="mt-2 flex items-start gap-2 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Tant que le titulaire et le RIB ne sont pas complets, le virement n’est pas proposé.
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400">LEBTEX ne change jamais de RIB par message. Rien ne sort sur une capture d’écran de virement.</p>
      </section>

      {/* ── Camionnette ── */}
      <section className={CARTE} aria-label="Camionnette">
        <TitreSection
          icone={<Truck className="h-5 w-5" />}
          titre="Camionnette LEBTEX"
          sousTitre="Rouleaux livrés à Casablanca et en périphérie (Mohammedia, Bouskoura, Dar Bouazza, Médiouna). Prix annoncé au téléphone, jamais offert."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Prix à Casablanca (DH)" erreur={erreurDe('camionnette.prixCasablanca')}>
            {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.camionnette.prixCasablanca}
              onChange={e => maj(f => ({ ...f, camionnette: { ...f.camionnette, prixCasablanca: e.target.value } }))} className={CHAMP} />}
          </Champ>
          <Champ libelle="Prix en périphérie (DH)" erreur={erreurDe('camionnette.prixPeripherie')}>
            {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.camionnette.prixPeripherie}
              onChange={e => maj(f => ({ ...f, camionnette: { ...f.camionnette, prixPeripherie: e.target.value } }))} className={CHAMP} />}
          </Champ>
          <div className="sm:col-span-2">
            <Champ libelle="Jours de tournée" aide="En clair : c’est ce que dit le message de la veille." erreur={erreurDe('camionnette.jours')}>
              {(id, d) => <input id={id} aria-describedby={d} value={form.camionnette.jours} maxLength={80} placeholder="mardi et jeudi"
                onChange={e => maj(f => ({ ...f, camionnette: { ...f.camionnette, jours: e.target.value } }))} className={CHAMP} />}
            </Champ>
          </div>
          <div className="sm:col-span-2">
            <Case
              coche={form.camionnette.actif}
              onChange={v => maj(f => ({ ...f, camionnette: { ...f.camionnette, actif: v } }))}
              libelle="Camionnette disponible"
              aide="Décochée : l’équipe propose le retrait gratuit à CHRIFA ou un transporteur."
            />
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Espèces au chauffeur : {formatPrice(PLAFOND_ESPECES_TOURNEE)} au plus par tournée. Un chauffeur inconnu n’encaisse jamais.
        </p>
      </section>

      {/* ── Carte bancaire ── */}
      <section className={CARTE} aria-label="Carte bancaire">
        <TitreSection icone={<CreditCard className="h-5 w-5" />} titre="Carte bancaire" />
        <Case
          coche={false}
          desactivee
          libelle="Paiement par carte en ligne"
          aide="Bientôt : il faut un contrat avec un prestataire de paiement en ligne (Attijari Payment, filiale d’Attijariwafa bank, ou un prestataire agréé comme Payzone ; le CMI ne signe plus de nouveaux commerçants). En attendant, l’option reste cachée aux clients."
        />
      </section>

      {/* <!-- Sendit --> : l'intégrateur monte ici l'état de la connexion Sendit (clés posées, dernier essai). */}
      {zoneSendit}

      {/* ── Enregistrer (reste visible en bas sur téléphone) ── */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-white/10 bg-[#141414]/95 p-3 backdrop-blur md:bottom-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm" aria-live="polite">
            {enregistrement === 'fait' && !modifie && <span className="text-emerald-300">Réglages enregistrés. La boutique les utilise dès maintenant.</span>}
            {enregistrement === 'erreur' && <span className="text-red-300">{erreurEnregistrement}</span>}
            {enregistrement !== 'erreur' && tenteEnregistrer && nbErreurs > 0 && (
              <span className="text-red-300">{nbErreurs === 1 ? '1 champ à corriger' : `${nbErreurs} champs à corriger`} avant d’enregistrer.</span>
            )}
            {enregistrement !== 'erreur' && !(tenteEnregistrer && nbErreurs > 0) && modifie && enregistrement !== 'envoi' && (
              <span className="text-amber-200">Modifications pas encore enregistrées.</span>
            )}
            {!modifie && enregistrement === 'repos' && <span className="text-gray-400">Aucune modification.</span>}
          </p>
          <div className="flex gap-2">
            {modifie && (
              <button
                type="button"
                onClick={() => { setForm(initial); setTenteEnregistrer(false); setEnregistrement('repos'); }}
                disabled={enregistrement === 'envoi'}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 disabled:opacity-50 sm:flex-none"
              >
                Annuler
              </button>
            )}
            <button
              type="submit"
              disabled={!modifie || enregistrement === 'envoi'}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-5 text-sm font-bold text-white hover:bg-[#A50D26] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:flex-none"
            >
              {enregistrement === 'envoi' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
