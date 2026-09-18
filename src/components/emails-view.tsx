'use client';

// ─── Emails ───────────────────────────────────────────────────────────────────
// Les boîtes LEBTEX et ROBE IN BOX, lues directement dans Gmail depuis le
// navigateur (cf. lib/gmail-browser.ts) : aucun mot de passe sur le serveur.
// En tête : les avis d'arrivée reçus dans les boîtes connectées, rattachés à
// leur dossier d'arrivage quand il est reconnaissable.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Inbox, RefreshCw, Mail, Paperclip, ChevronLeft, AlertCircle, Loader2, Search,
  Anchor, Ship, CalendarClock, Container, LogOut, ShieldCheck, CheckCircle2, HelpCircle, ImageIcon,
} from 'lucide-react';
import type { Facture } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  MAILBOXES, GOOGLE_CLIENT_ID, SessionGmailExpiree,
  connecterBoite, oublierJeton, jetonsEnregistres, preparerGoogle,
  listerEmails, lireEmail, lireEmails, ouvrirPieceJointe, htmlAvecImages,
  type Jeton, type MailboxKey,
} from '@/lib/gmail-browser';
import type { EmailComplet, EmailResume } from '@/lib/gmail-message';
import { detecterAvisArrivee, RECHERCHE_GMAIL_AVIS, type AvisArrivee } from '@/lib/avis-arrivee';
import { matchEmailToArrivages, type ArrivageMatch, type SupplierHint } from '@/lib/email-arrivage-match';

type AvisTrouve = { box: MailboxKey; email: EmailComplet; avis: AvisArrivee };
type Ouvert = { box: MailboxKey; email: EmailComplet };
type EtatAvis = { enCours: boolean; trouves: AvisTrouve[]; erreur: string };

const BOITE_PAR_DEFAUT = 'in:inbox -category:promotions -category:social';
// Les deux boîtes appartiennent à la société : ce que l'une envoie à l'autre
// (« avez-vous reçu l'avis d'arrivée ? ») n'est pas un avis.
const RECHERCHE_AVIS = `${RECHERCHE_GMAIL_AVIS} ${MAILBOXES.map(b => `-from:${b.email}`).join(' ')}`;
const envoyeParLaSociete = (from: string) => MAILBOXES.some(b => from.toLowerCase().includes(b.email));

const CONFIANCE: Record<ArrivageMatch['confidence'], { chip: string; label: string }> = {
  sure:     { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Sûr' },
  probable: { chip: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Probable' },
  faible:   { chip: 'bg-stone-100 text-stone-500 border-stone-200',      label: 'Incertain' },
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 24 * 7) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** yyyy-mm-dd → « 12 sept. 2026 », sans décalage de fuseau. */
function formatJour(iso: string | undefined) {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !j) return iso;
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fromName(from: string) {
  const i = from.indexOf('<');
  const nom = i > 0 ? from.slice(0, i).replace(/"/g, '').trim() : '';
  return nom || from.replace(/[<>]/g, '').split('@')[0];
}

const labelBoite = (box: MailboxKey) => MAILBOXES.find(b => b.key === box)!.label;

// Images hébergées ailleurs : les charger prévient l'expéditeur que le message
// a été lu (et lui donne l'adresse IP du bureau). Bloquées tant qu'on ne les demande pas.
const A_IMAGES_DISTANTES = /\b(?:src|background|srcset)\s*=\s*["']?(?:https?:)?\/\/|url\((?:["']|&quot;|&#39;)?(?:https?:)?\/\//i;

function cadreEmail(html: string, imagesDistantes: boolean) {
  const csp = imagesDistantes
    ? "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline' https:; font-src data: https:"
    : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
  // Une redirection automatique emmènerait le cadre vers une autre page.
  const corps = html.replace(/<meta\b[^<>]*http-equiv\s*=\s*["']?refresh[^<>]*>/gi, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:#44403c;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${corps}</body></html>`;
}

const puce = 'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest';

/** Navire, date, BL, conteneurs : ce que l'avis annonce. */
function DetailsAvis({ avis }: { avis: AvisArrivee }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {avis.navire && <span className={`${puce} bg-sky-50 text-sky-700 border-sky-200`}><Ship className="w-3 h-3" />{avis.navire}</span>}
      {avis.dateArrivee && <span className={`${puce} bg-rose-50 text-rose-700 border-rose-200`}><CalendarClock className="w-3 h-3" />Arrivée {formatJour(avis.dateArrivee)}</span>}
      {avis.bl && <span className={`${puce} bg-white text-stone-600 border-stone-200`}>BL {avis.bl}</span>}
      {avis.conteneurs.length > 0 && (
        <span title={avis.conteneurs.join(', ')} className={`${puce} bg-white text-stone-600 border-stone-200`}>
          <Container className="w-3 h-3" />{avis.conteneurs.length === 1 ? avis.conteneurs[0] : `${avis.conteneurs.length} conteneurs`}
        </span>
      )}
    </div>
  );
}

/** Dossier d'arrivage reconnu, et écart éventuel avec la date annoncée. */
function DossierAvis({ match, avis }: { match: ArrivageMatch; avis: AvisArrivee }) {
  const style = CONFIANCE[match.confidence];
  const dateDossier = (match.arrivalDate || '').slice(0, 10);
  const ecart = !!avis.dateArrivee && !!dateDossier && dateDossier !== avis.dateArrivee;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span title={match.reasons.map(r => r.label).join(' · ')} className={`${puce} ${style.chip}`}>
        <Anchor className="w-3 h-3" />Dossier {match.noBL || '—'}{match.supplierId ? ` · ${match.supplierId}` : ''} · {style.label}
      </span>
      {ecart && (
        <span className={`${puce} bg-amber-50 text-amber-800 border-amber-300`}>
          <AlertCircle className="w-3 h-3" />Date du dossier : {formatJour(dateDossier)}
        </span>
      )}
    </div>
  );
}

export default function EmailsView({
  factures = [],
  supplierHints,
}: {
  /** Dossiers d'arrivage, pour rattacher chaque avis au bon dossier. */
  factures?: Facture[];
  /** Emails connus par fournisseur (supplierProfiles) — améliore le rattachement. */
  supplierHints?: Record<string, SupplierHint>;
} = {}) {
  const { toast } = useToast();
  const [jetons, setJetons] = useState<Partial<Record<MailboxKey, Jeton>>>({});
  const [boite, setBoite] = useState<MailboxKey>('lebtex');
  const [connexion, setConnexion] = useState<MailboxKey | null>(null);
  const [rafraichir, setRafraichir] = useState(0);

  const [avisParBoite, setAvisParBoite] = useState<Partial<Record<MailboxKey, EtatAvis>>>({});

  const [liste, setListe] = useState<EmailResume[]>([]);
  const [listeEnCours, setListeEnCours] = useState(false);
  const [listeErreur, setListeErreur] = useState('');
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');

  const [ouvert, setOuvert] = useState<Ouvert | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);
  const [htmlAffiche, setHtmlAffiche] = useState<{ id: string; html: string } | null>(null);
  // Email pour lequel l'utilisateur a demandé les images distantes.
  const [imagesDistantesPour, setImagesDistantesPour] = useState<string | null>(null);

  // ── Jetons ─────────────────────────────────────────────────────────────────
  // Après montage seulement : sessionStorage n'existe pas au rendu serveur.
  useEffect(() => {
    setJetons(jetonsEnregistres());
    if (GOOGLE_CLIENT_ID) preparerGoogle().catch(() => {});
  }, []);

  const oublier = useCallback((box: MailboxKey) => {
    oublierJeton(box);
    setJetons(prev => {
      if (!prev[box]) return prev;
      const n = { ...prev };
      delete n[box];
      return n;
    });
  }, []);

  // Déconnexion de l'application : les boîtes ne restent pas ouvertes dans l'onglet.
  useEffect(() => onAuthStateChanged(getAuth(), user => {
    if (!user) for (const b of MAILBOXES) oublier(b.key);
  }), [oublier]);

  // Un jeton expiré disparaît à l'heure dite : le bouton « Connecter » revient
  // au lieu d'une liste qui ne répond plus.
  useEffect(() => {
    const echeances = Object.values(jetons).map(j => j!.expiresAt);
    if (!echeances.length) return;
    const t = setTimeout(() => {
      for (const b of MAILBOXES) {
        const j = jetons[b.key];
        if (j && j.expiresAt <= Date.now()) oublier(b.key);
      }
    }, Math.max(0, Math.min(...echeances) - Date.now()) + 500);
    return () => clearTimeout(t);
  }, [jetons, oublier]);

  const jetonDe = useCallback((box: MailboxKey) => {
    const j = jetons[box];
    return j && j.expiresAt > Date.now() ? j : null;
  }, [jetons]);

  /** Jeton refusé par Gmail : on l'oublie, le bouton « Connecter » revient. */
  const gererErreur = useCallback((box: MailboxKey, err: unknown): string => {
    if (err instanceof SessionGmailExpiree) oublier(box);
    return err instanceof Error ? err.message : 'Erreur inattendue.';
  }, [oublier]);

  const sessionExpiree = (box: MailboxKey) => {
    oublier(box);
    toast({ variant: 'destructive', title: 'Session Gmail expirée', description: `Reconnectez la boîte ${labelBoite(box)}.` });
  };

  const connecter = async (box: MailboxKey) => {
    setConnexion(box);
    try {
      const j = await connecterBoite(box);
      setJetons(prev => ({ ...prev, [box]: j }));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Connexion Gmail', description: err instanceof Error ? err.message : 'Réessayez.' });
    } finally {
      setConnexion(null);
    }
  };

  const deconnecter = (box: MailboxKey) => {
    oublier(box);
    if (ouvert?.box === box) setOuvert(null);
  };

  // ── Avis d'arrivée : chaque boîte connectée, chargée une fois par jeton ────
  const chargements = useRef<Partial<Record<MailboxKey, string>>>({});

  useEffect(() => {
    for (const { key: box } of MAILBOXES) {
      const j = jetons[box];
      if (!j) {
        delete chargements.current[box];
        setAvisParBoite(prev => {
          if (!prev[box]) return prev;
          const n = { ...prev };
          delete n[box];
          return n;
        });
        continue;
      }
      const cle = `${j.token}:${rafraichir}`;
      if (chargements.current[box] === cle) continue;
      chargements.current[box] = cle;
      setAvisParBoite(prev => ({ ...prev, [box]: { enCours: true, trouves: prev[box]?.trouves || [], erreur: '' } }));

      lireEmails(j.token, RECHERCHE_AVIS, 40)
        .then(
          async emails => {
            const trouves: AvisTrouve[] = [];
            for (const email of emails) {
              if (chargements.current[box] !== cle) break;
              if (envoyeParLaSociete(email.from)) continue;
              const avis = detecterAvisArrivee(email);
              if (avis) trouves.push({ box, email, avis });
              // Rendre la main au navigateur entre deux messages : la page reste fluide.
              await new Promise(r => setTimeout(r, 0));
            }
            return { trouves, erreur: '' };
          },
          err => ({ trouves: [] as AvisTrouve[], erreur: `${labelBoite(box)} : ${gererErreur(box, err)}` })
        )
        .then(r => {
          if (chargements.current[box] !== cle) return;
          setAvisParBoite(prev => ({ ...prev, [box]: { enCours: false, ...r } }));
        });
    }
  }, [jetons, rafraichir, gererErreur]);

  const etatsAvis = Object.values(avisParBoite) as EtatAvis[];
  const avisEnCours = etatsAvis.some(e => e.enCours);
  const avisErreur = etatsAvis.map(e => e.erreur).filter(Boolean).join(' · ');
  const avis = useMemo(
    () => (Object.values(avisParBoite) as EtatAvis[])
      .flatMap(e => e.trouves)
      .sort((a, b) => b.email.date.localeCompare(a.email.date)),
    [avisParBoite]
  );

  const dossiers = useMemo(() => {
    const map = new Map<string, ArrivageMatch | null>();
    for (const a of avis) {
      const best = factures.length
        ? matchEmailToArrivages(a.email, factures, { accountKey: a.box, suppliers: supplierHints, limit: 1 })[0]
        : undefined;
      map.set(`${a.box}:${a.email.id}`, best || null);
    }
    return map;
  }, [avis, factures, supplierHints]);

  // ── Liste de la boîte choisie ──────────────────────────────────────────────
  const jetonBoite = jetonDe(boite);
  const requeteListe = useRef(0);
  const boiteCourante = useRef(boite);
  useEffect(() => { boiteCourante.current = boite; }, [boite]);

  useEffect(() => {
    const n = ++requeteListe.current;
    setOuvert(null);
    setListe([]);
    setListeErreur('');
    if (!jetonBoite) { setListeEnCours(false); return; }
    setListeEnCours(true);
    listerEmails(jetonBoite.token, recherche.trim() || BOITE_PAR_DEFAUT, 30)
      .then(emails => { if (n === requeteListe.current) setListe(emails); })
      .catch(err => { if (n === requeteListe.current) setListeErreur(gererErreur(boite, err)); })
      .finally(() => { if (n === requeteListe.current) setListeEnCours(false); });
    // jetonBoite change d'identité à chaque rendu : seul le jeton lui-même compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boite, jetonBoite?.token, recherche, rafraichir, gererErreur]);

  const avisDansListe = useMemo(
    () => new Set(liste.filter(e => detecterAvisArrivee({ subject: e.subject, text: e.snippet })).map(e => e.id)),
    [liste]
  );

  const ouvrir = async (box: MailboxKey, id: string) => {
    const j = jetonDe(box);
    if (!j) { sessionExpiree(box); return; }
    setOuverture(id);
    try {
      const email = await lireEmail(j.token, id);
      // Entre-temps, l'utilisateur a pu changer de boîte.
      if (boiteCourante.current === box) setOuvert({ box, email });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Email illisible', description: gererErreur(box, err) });
    } finally {
      setOuverture(null);
    }
  };

  // Ouvrir un avis depuis le bandeau bascule sur sa boîte : l'effet de liste ne
  // doit pas refermer aussitôt le message.
  const avisOuvert = useRef<Ouvert | null>(null);
  const ouvrirAvis = (a: AvisTrouve) => {
    if (a.box === boite) { setOuvert({ box: a.box, email: a.email }); return; }
    avisOuvert.current = { box: a.box, email: a.email };
    setBoite(a.box);
  };
  useEffect(() => {
    if (avisOuvert.current && avisOuvert.current.box === boite) {
      setOuvert(avisOuvert.current);
      avisOuvert.current = null;
    }
  }, [boite]);

  // Images collées dans le message : chargées à l'ouverture.
  useEffect(() => {
    if (!ouvert) { setHtmlAffiche(null); return; }
    const { box, email } = ouvert;
    setHtmlAffiche({ id: email.id, html: email.html });
    const j = jetonDe(box);
    if (!email.images.length || !j) return;
    let annule = false;
    htmlAvecImages(j.token, email)
      .then(html => { if (!annule) setHtmlAffiche({ id: email.id, html }); })
      .catch(err => { if (!annule) gererErreur(box, err); });
    return () => { annule = true; };
    // Le message ouvert suffit : un nouveau jeton ne change pas ses images.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const pieceJointe = (o: Ouvert, index: number) => {
    const j = jetonDe(o.box);
    if (!j) { sessionExpiree(o.box); return; }
    ouvrirPieceJointe(j.token, o.email.id, o.email.attachments[index])
      .catch(err => toast({ variant: 'destructive', title: 'Pièce jointe inaccessible', description: gererErreur(o.box, err) }));
  };

  const boiteInfo = MAILBOXES.find(b => b.key === boite)!;
  const avisDuMessage = useMemo(() => (ouvert ? detecterAvisArrivee(ouvert.email) : null), [ouvert]);
  const dossierDuMessage = useMemo(
    () => (ouvert && avisDuMessage && factures.length
      ? matchEmailToArrivages(ouvert.email, factures, { accountKey: ouvert.box, suppliers: supplierHints, limit: 1 })[0]
      : undefined),
    [ouvert, avisDuMessage, factures, supplierHints]
  );
  const htmlOuvert = ouvert && htmlAffiche?.id === ouvert.email.id ? htmlAffiche.html : ouvert?.email.html || '';
  const imagesDistantes = !!ouvert && imagesDistantesPour === ouvert.email.id;
  const srcDocOuvert = useMemo(() => cadreEmail(htmlOuvert, imagesDistantes), [htmlOuvert, imagesDistantes]);
  const aImagesDistantes = useMemo(() => A_IMAGES_DISTANTES.test(htmlOuvert), [htmlOuvert]);
  const boitesConnectees = MAILBOXES.filter(b => jetonDe(b.key));

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="space-y-4">
        <EnTete />
        <div className="bg-white rounded-2xl border border-amber-200 p-6 space-y-3 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-sm font-black uppercase tracking-widest">Connexion Google à configurer</h2>
          </div>
          <p className="text-sm text-stone-600">
            Les emails se lisent maintenant directement dans Gmail, en lecture seule, sans mot de passe
            sur le serveur. Il manque l&apos;identifiant OAuth du projet Google Cloud
            (<code className="text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EnTete />
        <Button
          onClick={() => setRafraichir(n => n + 1)}
          disabled={!boitesConnectees.length || listeEnCours || avisEnCours}
          variant="outline"
          className="h-9 gap-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-stone-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${listeEnCours || avisEnCours ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Boîtes : choix + connexion */}
      <div className="flex gap-2 flex-wrap">
        {MAILBOXES.map(b => {
          const connectee = !!jetonDe(b.key);
          return (
            <div
              key={b.key}
              className={`flex items-center gap-1 rounded-xl border transition-all ${
                boite === b.key ? 'bg-stone-900 border-stone-900 shadow-lg' : 'bg-white border-stone-200'
              }`}
            >
              <button
                onClick={() => setBoite(b.key)}
                className={`flex items-center gap-2 pl-4 pr-2 py-2 text-[11px] font-black uppercase tracking-widest ${
                  boite === b.key ? 'text-white' : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${connectee ? b.color : 'bg-stone-300'}`} />
                {b.label}
              </button>
              {connectee ? (
                <button
                  key="deconnecter"
                  onClick={() => deconnecter(b.key)}
                  title={`Déconnecter ${b.email} de ce navigateur`}
                  className={`p-2 pr-3 ${boite === b.key ? 'text-stone-400 hover:text-white' : 'text-stone-300 hover:text-stone-700'}`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  key="connecter"
                  // Le 2e clic d'un double-clic sur « Déconnecter » tombe ici : on l'ignore.
                  onClick={e => { if (e.detail <= 1) connecter(b.key); }}
                  disabled={connexion !== null}
                  className="mr-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50"
                >
                  {connexion === b.key ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connecter'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Avis d'arrivée */}
      {boitesConnectees.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100">
            <Ship className="w-4 h-4 text-stone-900" />
            <h2 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">Avis d&apos;arrivée reçus</h2>
            {avisEnCours
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
              : <span className="text-[10px] font-bold text-stone-400">{avis.length}</span>}
          </div>
          {avisErreur && <p className="px-5 pt-3 text-[11px] font-bold text-red-600">{avisErreur}</p>}
          {!avisEnCours && avis.length === 0 ? (
            !avisErreur && <p className="px-5 py-4 text-[11px] font-bold text-stone-400">Aucun avis d&apos;arrivée trouvé.</p>
          ) : (
            <div className="divide-y divide-stone-50 max-h-[420px] overflow-auto">
              {avis.map(a => {
                const dossier = dossiers.get(`${a.box}:${a.email.id}`);
                const b = MAILBOXES.find(x => x.key === a.box)!;
                return (
                  <button
                    key={`${a.box}:${a.email.id}`}
                    onClick={() => ouvrirAvis(a)}
                    className="w-full text-left px-5 py-3 hover:bg-stone-50 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.color}`} title={b.label} />
                        <span className="text-sm font-black text-stone-900 truncate">{a.email.subject}</span>
                      </span>
                      <span className="text-[10px] text-stone-400 font-medium shrink-0">{formatDate(a.email.date)}</span>
                    </div>
                    <p className="text-[11px] text-stone-500 truncate">{fromName(a.email.from)}</p>
                    <DetailsAvis avis={a.avis} />
                    {dossier ? <DossierAvis match={dossier} avis={a.avis} /> : factures.length > 0 && (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400">
                        <HelpCircle className="w-3 h-3" />Aucun dossier reconnu
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Boîte choisie */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden" style={{ minHeight: 480 }}>
        {!jetonBoite ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 px-6 text-center">
            <ShieldCheck className="w-9 h-9 text-stone-300" />
            <div className="space-y-1">
              <p className="text-sm font-black text-stone-900">Connecter la boîte {boiteInfo.label}</p>
              <p className="text-[11px] text-stone-400 font-medium">{boiteInfo.email}</p>
            </div>
            <Button
              onClick={() => connecter(boite)}
              disabled={connexion !== null}
              className="h-10 gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-black uppercase tracking-widest"
            >
              {connexion === boite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Se connecter avec Google
            </Button>
            <p className="text-[10px] text-stone-400 max-w-sm">
              Lecture seule : l&apos;application ne peut ni envoyer, ni modifier, ni supprimer un email.
              L&apos;accès reste dans ce navigateur et expire au bout d&apos;une heure.
            </p>
          </div>
        ) : ouvert ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-stone-100">
              <button onClick={() => setOuvert(null)} className="text-stone-400 hover:text-stone-900 transition-colors" title="Retour à la liste">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-black text-stone-900 truncate">{ouvert.email.subject}</p>
                <p className="text-[11px] text-stone-400 mt-0.5 truncate">{ouvert.email.from} · {formatDate(ouvert.email.date)}</p>
              </div>
            </div>

            {avisDuMessage && (
              <div className="mx-6 mt-4 p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Ship className="w-4 h-4 text-rose-700" />
                  <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-widest">Avis d&apos;arrivée</h4>
                  <span className="text-[10px] text-stone-400 font-medium">reconnu sur « {avisDuMessage.preuve} »</span>
                </div>
                <DetailsAvis avis={avisDuMessage} />
                {dossierDuMessage ? (
                  <div className="space-y-1">
                    <DossierAvis match={dossierDuMessage} avis={avisDuMessage} />
                    <ul className="space-y-0.5">
                      {dossierDuMessage.reasons.filter(r => r.points > 0).map(r => (
                        <li key={r.code} className="flex items-center gap-1.5 text-[10px] text-stone-500 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{r.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : factures.length > 0 && (
                  <p className="text-[10px] font-bold text-stone-400">Aucun dossier d&apos;arrivage reconnu dans cet email.</p>
                )}
              </div>
            )}

            {ouvert.email.attachments.length > 0 && (
              <div className="flex gap-2 px-6 py-3 mt-4 bg-stone-50 border-y border-stone-100 flex-wrap">
                {ouvert.email.attachments.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pieceJointe(ouvert, i)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-stone-200 text-[10px] font-bold text-stone-600 hover:border-violet-300 hover:text-violet-700 transition-colors"
                  >
                    <Paperclip className="w-3 h-3" />
                    {a.filename}
                    {a.size > 0 && <span className="text-stone-400">· {Math.max(1, Math.round(a.size / 1024))} Ko</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6 space-y-3">
              {htmlOuvert ? (
                <>
                  {!imagesDistantes && aImagesDistantes && (
                    <button
                      onClick={() => setImagesDistantesPour(ouvert.email.id)}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-900"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Afficher les images
                    </button>
                  )}
                  <iframe
                    // Un cadre neuf à chaque version du contenu : Chrome ne recharge pas
                    // toujours un cadre isolé dont on remplace seulement le srcdoc.
                    key={`${ouvert.email.id}:${htmlOuvert.length}:${imagesDistantes ? 1 : 0}`}
                    title={ouvert.email.subject || 'Email'}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={srcDocOuvert}
                    className="w-full h-[65vh] border-0 bg-white rounded-lg"
                  />
                </>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700 leading-relaxed">
                  {ouvert.email.text || '(Contenu vide)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div>
            <form
              onSubmit={e => { e.preventDefault(); setRecherche(saisie); }}
              className="px-4 py-3 border-b border-stone-100"
            >
              <div className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2">
                <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <input
                  value={saisie}
                  onChange={e => { setSaisie(e.target.value); if (!e.target.value) setRecherche(''); }}
                  placeholder="Rechercher dans toute la boîte (n° de dossier, BL, expéditeur…) puis Entrée"
                  className="bg-transparent text-sm text-stone-700 placeholder-stone-400 outline-none flex-1 font-medium"
                />
              </div>
            </form>

            {listeEnCours ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Lecture de {boiteInfo.label}…</p>
              </div>
            ) : listeErreur ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm font-bold text-red-600 max-w-sm text-center">{listeErreur}</p>
              </div>
            ) : liste.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Mail className="w-8 h-8 text-stone-200" />
                <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest">Aucun email</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {liste.map(email => (
                  <button
                    key={email.id}
                    onClick={() => ouvrir(boite, email.id)}
                    disabled={ouverture !== null}
                    className={`w-full text-left px-5 py-3.5 hover:bg-stone-50 transition-colors flex items-start gap-3 ${email.unread ? 'bg-amber-50/40' : ''}`}
                  >
                    <div className="flex-shrink-0 mt-1.5">
                      {ouverture === email.id
                        ? <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                        : <div className={`w-2 h-2 rounded-full ${email.unread ? 'bg-amber-500' : 'bg-transparent'}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${email.unread ? 'font-black text-stone-900' : 'font-semibold text-stone-600'}`}>
                          {fromName(email.from)}
                        </span>
                        <span className="text-[10px] text-stone-400 font-medium shrink-0">{formatDate(email.date)}</span>
                      </div>
                      <p className={`text-[12px] truncate mt-0.5 ${email.unread ? 'font-bold text-stone-800' : 'text-stone-500 font-medium'}`}>
                        {email.subject}
                      </p>
                      {avisDansListe.has(email.id) && (
                        <span className={`${puce} mt-1 bg-rose-50 text-rose-700 border-rose-200`}>
                          <Ship className="w-2.5 h-2.5" />Avis d&apos;arrivée
                        </span>
                      )}
                      <p className="text-[11px] text-stone-400 truncate mt-0.5 font-normal">{email.snippet}</p>
                    </div>
                    {email.hasAttachments && <Paperclip className="w-3.5 h-3.5 text-stone-300 mt-1 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EnTete() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-stone-900 flex items-center justify-center">
        <Inbox className="w-5 h-5 text-amber-400" />
      </div>
      <div>
        <h1 className="text-xl font-black tracking-tight text-stone-900 uppercase">Emails</h1>
        <p className="text-[11px] text-stone-400 font-medium uppercase tracking-widest">Gmail · lecture seule</p>
      </div>
    </div>
  );
}
