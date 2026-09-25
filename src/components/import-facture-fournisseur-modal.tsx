"use client";

/**
 * Importer la facture du fournisseur dans un dossier déjà créé : on lit
 * l'Excel (onglets INV et PL) ou un tableau collé, on rapproche chaque ligne
 * d'un article en production, l'utilisateur vérifie, puis tout passe en
 * transit d'un coup — quantités, prix, poids net et volume compris.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUser, useFirestore } from '@/firebase';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { sendStatusNotification } from '@/lib/send-status-notification';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { lireClasseurFacture, lireTexteColle, type LectureFacture, type LigneFacture } from '@/lib/facture-fournisseur';
import {
  articlesCandidats, changePrix, construirePlan, ecritures, evaluer, fournisseurSansArticle, proposer,
  type Confiance, type ModePassage, type PlanArticle, type Proposition,
} from '@/lib/rapprochement-facture';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileSpreadsheet, Loader2, RotateCcw, Ship, Upload } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le dossier (facture) déjà créé qui reçoit la marchandise. */
  dossier: any;
  articles: any[];
}

// ── Mise en forme ────────────────────────────────────────────────────────────

const formats = new Map<number, Intl.NumberFormat>();
const nf = (n: number | null | undefined, d = 2) => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (!formats.has(d)) formats.set(d, new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }));
  return formats.get(d)!.format(n);
};
const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

const LIBELLE_CONFIANCE: Record<Confiance, { texte: string; classe: string }> = {
  sure: { texte: 'Sûr', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  probable: { texte: 'Probable', classe: 'bg-sky-50 text-sky-700 border-sky-200' },
  'a-verifier': { texte: 'À choisir', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
  aucune: { texte: 'Aucun article', classe: 'bg-stone-100 text-stone-500 border-stone-200' },
};

/** Firestore refuse les `undefined` : on les retire avant d'écrire. */
function sansIndefinis(v: any): any {
  if (Array.isArray(v)) return v.map(sansIndefinis);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, sansIndefinis(x)]));
  }
  return v;
}

const codeModele = (a: any) => [a.designRef, a.quality].map(v => String(v || '').match(/\d{3,4}-\d{3,4}[A-Z]{0,2}/)?.[0]).find(Boolean);

function libelleArticle(a: any, dossierId: string, avecFournisseur: boolean) {
  return [
    a.name,
    a.size && a.size !== 'various' ? a.size : '',
    a.color && a.color !== 'various' ? a.color : '',
    codeModele(a) ? `modèle ${codeModele(a)}` : '',
    `${nf(Number(a.quantity), 3)} ${a.unitOfMeasure || ''}`,
    `${nf(Number(a.purchasePricePerUnit), 5)} $`,
    a.clientName ? `client ${a.clientName}` : '',
    avecFournisseur && a.supplierId ? `(${a.supplierId})` : '',
    a.factureId === dossierId ? 'déjà au dossier' : '',
  ].filter(Boolean).join(' · ');
}

/** Un nom de client qui désigne quelqu'un (pas « X », pas vide). */
const clientReel = (nom: unknown) => {
  const n = String(nom || '').trim();
  return n.length >= 3 ? n : '';
};

// ── Fenêtre ──────────────────────────────────────────────────────────────────

export default function ImportFactureFournisseurModal({ open, onOpenChange, dossier, articles }: Props) {
  // Pendant l'écriture, on ne ferme pas. Le contenu est démonté à la fermeture :
  // chaque ouverture repart de zéro.
  const [envoi, setEnvoi] = useState(false);
  return (
    <Dialog open={open} onOpenChange={o => { if (!envoi) onOpenChange(o); }}>
      {open && dossier && (
        <Contenu dossier={dossier} articles={articles} fermer={() => onOpenChange(false)} envoi={envoi} setEnvoi={setEnvoi} />
      )}
    </Dialog>
  );
}

function Contenu({ dossier, articles, fermer, envoi, setEnvoi }: {
  dossier: any;
  articles: any[];
  fermer: () => void;
  envoi: boolean;
  setEnvoi: (v: boolean) => void;
}) {
  const { user } = useUser();
  const firestore = useFirestore();

  const [lecture, setLecture] = useState<LectureFacture | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [collage, setCollage] = useState('');
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [choix, setChoix] = useState<Record<number, string | null>>({});
  const [manuels, setManuels] = useState<Set<number>>(new Set());
  const [modes, setModes] = useState<Record<string, ModePassage>>({});
  const [forces, setForces] = useState<Record<string, boolean>>({});
  // Les prix sont saisis à la commande : on n'y touche que si on le demande.
  const [appliquerPrix, setAppliquerPrix] = useState(false);
  const [majFret, setMajFret] = useState(false);
  const [prevenir, setPrevenir] = useState(true);
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [survol, setSurvol] = useState(false);

  // Les propositions automatiques restent chez le fournisseur du dossier ; la
  // liste à la main s'élargit à tous les fournisseurs si son nom ne retrouve rien.
  const candidatsFournisseur = useMemo(() => articlesCandidats(articles, dossier), [articles, dossier]);
  const candidats = useMemo(() => articlesCandidats(articles, dossier, true), [articles, dossier]);
  const repliFournisseur = useMemo(() => fournisseurSansArticle(articles, dossier), [articles, dossier]);
  const parId = useMemo(() => new Map(candidats.map(a => [a.id, a])), [candidats]);
  const libelles = useMemo(
    () => new Map(candidats.map(a => [a.id, libelleArticle(a, dossier.id, repliFournisseur)])),
    [candidats, dossier.id, repliFournisseur],
  );
  const candidatsTries = useMemo(
    () => [...candidats].sort((x, y) => (libelles.get(x.id) || '').localeCompare(libelles.get(y.id) || '')),
    [candidats, libelles],
  );

  const demarrer = (l: LectureFacture, nom: string) => {
    if (!l.lignes.length) {
      setErreur(l.avertissements[0] || 'Aucune ligne de marchandise trouvée dans ce document.');
      return;
    }
    const props = proposer(l, candidatsFournisseur, dossier.id);
    setLecture(l);
    setNomFichier(nom);
    setErreur(null);
    setPropositions(props);
    // Seuls les rapprochements sûrs ou probables sont cochés d'avance ; les
    // ex-æquo attendent un choix.
    setChoix(Object.fromEntries(props.map(p => [p.index, p.confiance === 'sure' || p.confiance === 'probable' ? p.articleId : null])));
    setManuels(new Set());
    setModes({});
    setForces({});
    setConfirmations({});
    setMajFret(l.fret != null && l.frets.length === 1 && !(Number(dossier.freightCost) > 0));
  };

  const lireFichier = async (f: File) => {
    if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
      setErreur(/\.pdf$/i.test(f.name)
        ? "Les PDF ne se lisent pas encore : prends l'Excel du fournisseur (…+INV.xlsx), ou colle le tableau ci-dessous."
        : "Ce fichier n'est pas un classeur Excel : prends l'Excel du fournisseur (…+INV.xlsx), ou colle le tableau ci-dessous.");
      return;
    }
    setChargement(true);
    setErreur(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      demarrer(lireClasseurFacture(wb, XLSX.utils), f.name);
    } catch (e: any) {
      setErreur(`Lecture impossible : ${e?.message || e}`);
    } finally {
      setChargement(false);
    }
  };

  // Lignes dont le rapprochement fait foi : sûr, probable, ou choisi à la main.
  const fiables = useMemo(() => new Set(
    propositions
      .filter(p => manuels.has(p.index) || ((p.confiance === 'sure' || p.confiance === 'probable') && choix[p.index] === p.articleId))
      .map(p => p.index),
  ), [propositions, manuels, choix]);

  const plan = useMemo(
    () => (lecture ? construirePlan(lecture, choix, candidats, dossier.id, { appliquerPrix, modes, forces, fiables }) : null),
    [lecture, choix, candidats, dossier.id, appliquerPrix, modes, forces, fiables],
  );
  const planParArticle = useMemo(() => new Map((plan?.articles || []).map(p => [p.article.id, p])), [plan]);

  // Qui a choisi quel article : un article pris par une autre ligne se voit dans la liste.
  const lignesParArticle = useMemo(() => {
    const m = new Map<string, number[]>();
    Object.entries(choix).forEach(([i, id]) => { if (id) m.set(id, [...(m.get(id) || []), Number(i) + 1]); });
    return m;
  }, [choix]);
  const optionsTous = useMemo(() => candidatsTries.map(a => {
    const pris = lignesParArticle.get(a.id);
    return <option key={a.id} value={a.id}>{libelles.get(a.id)}{pris ? ` — choisi ligne ${pris.join(', ')}` : ''}</option>;
  }), [candidatsTries, libelles, lignesParArticle]);

  // ── Chiffres de contrôle ────────────────────────────────────────────────────
  const bilan = useMemo(() => {
    if (!plan) return null;
    const retenus = plan.articles.filter(p => !p.bloque);
    const enTransit = retenus.filter(p => p.mode !== 'maj');
    const bloques = plan.articles.filter(p => p.bloque).length;
    const partiels = enTransit.filter(p => p.mode === 'partiel').length;
    const majs = retenus.filter(p => p.mode === 'maj').length;
    const prixModifies = retenus.filter(p => changePrix(p, true)).length;
    const clientsParCle = new Map<string, string>();
    const aPrevenir = enTransit.filter(p => clientReel(p.article.clientName));
    for (const p of aPrevenir) {
      const nom = clientReel(p.article.clientName);
      if (!clientsParCle.has(nom.toLowerCase())) clientsParCle.set(nom.toLowerCase(), nom);
    }
    // Le dossier une fois l'import fait : ses articles (corrigés), plus ceux qui entrent.
    let poids = 0;
    let volume = 0;
    for (const a of articles) {
      if (a.factureId !== dossier.id) continue;
      const p = planParArticle.get(a.id);
      if (p && p.mode !== 'maj' && !p.bloque) continue; // compté avec les entrées
      poids += p && p.mode === 'maj' && p.majPoidsNet ? p.poidsNet! : Number(a.netWeight) || 0;
      volume += p && p.mode === 'maj' && p.majVolume ? p.volume! : Number(a.cubicMeasurement) || 0;
    }
    for (const p of enTransit) {
      const qa = Number(p.article.quantity) || 0;
      const part = p.mode === 'partiel' && qa > 0 && p.quantite != null ? p.quantite / qa : 1;
      poids += p.majPoidsNet ? p.poidsNet! : (Number(p.article.netWeight) || 0) * part;
      volume += p.majVolume ? p.volume! : (Number(p.article.cubicMeasurement) || 0) * part;
    }
    return { enTransit: enTransit.length, partiels, majs, bloques, prixModifies, clients: [...clientsParCle.values()], notifies: aPrevenir.length, poids, volume };
  }, [plan, articles, dossier.id, planParArticle]);

  // Ce que l'utilisateur doit confirmer avant d'enregistrer.
  const aConfirmer = useMemo(() => {
    if (!lecture) return [];
    const liste: { cle: string; texte: string }[] = [];
    if (lecture.numeroFacture && lecture.numeroFacture !== String(dossier.id).toUpperCase()) {
      liste.push({ cle: 'autre', texte: `Ce fichier est la facture ${lecture.numeroFacture}, pas le dossier ${dossier.id}. C'est bien la marchandise de ce dossier.` });
    } else if (!lecture.numeroFacture) {
      liste.push({ cle: 'sansNumero', texte: `Le document ne porte pas de n° de facture. C'est bien la marchandise du dossier ${dossier.id}.` });
    }
    if (lecture.totauxIncoherents) {
      liste.push({ cle: 'totaux', texte: 'Les lignes ne retombent pas sur le total du packing list (voir plus haut). J’ai vérifié.' });
    }
    return liste;
  }, [lecture, dossier.id]);

  const retenus = plan ? plan.articles.filter(p => !p.bloque).length : 0;
  const raisonBlocage = !plan || !retenus
    ? 'Aucun article à passer : choisis au moins un article.'
    : aConfirmer.some(c => !confirmations[c.cle]) ? 'Coche les confirmations ci-dessus.' : '';
  const peutConfirmer = !raisonBlocage && !envoi;

  const choisir = useCallback((index: number, articleId: string | null) => {
    setChoix(c => ({ ...c, [index]: articleId }));
    setManuels(m => new Set(m).add(index));
  }, []);
  const changerMode = useCallback((id: string, m: ModePassage) => setModes(x => ({ ...x, [id]: m })), []);
  const forcer = useCallback((id: string, v: boolean) => setForces(x => ({ ...x, [id]: v })), []);

  // ── Confirmation : un seul lot d'écritures, puis les clients ────────────────
  const confirmer = async () => {
    if (!user || !firestore || !plan || !lecture || !peutConfirmer) return;
    setEnvoi(true);
    let resume: ReturnType<typeof toast> | null = null;
    const passes = plan.articles.filter(p => !p.bloque && p.mode !== 'maj');
    try {
      const ops = ecritures(plan.articles, {
        dossier: { id: dossier.id, arrivalDate: dossier.arrivalDate || '' },
        maintenant: serverTimestamp(),
        nouvelId: () => crypto.randomUUID(),
        appliquerPrix,
        lecture,
        nomFichier,
        majFret,
      });
      for (let i = 0; i < ops.length; i += 450) {
        const lot = writeBatch(firestore);
        for (const o of ops.slice(i, i + 450)) {
          const ref = doc(firestore, 'users', user.uid, o.collection, o.id);
          if (o.op === 'set') lot.set(ref, sansIndefinis(o.data));
          else lot.update(ref, sansIndefinis(o.data));
        }
        await lot.commit();
      }
      const n = passes.length;
      const m = plan.articles.filter(p => !p.bloque && p.mode === 'maj').length;
      resume = toast({
        title: 'Facture importée',
        description: [
          n ? `${n} ${pl(n, 'article passé', 'articles passés')} en transit` : '',
          m ? `${m} ${pl(m, 'article du dossier mis', 'articles du dossier mis')} à jour` : '',
        ].filter(Boolean).join(', ') + ` — dossier ${dossier.id}.`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Import non enregistré', description: e?.message || String(e) });
      setEnvoi(false);
      return;
    }
    setEnvoi(false);
    fermer();
    if (prevenir) await prevenirClients(passes, resume);
  };

  const prevenirClients = async (passes: PlanArticle[], resume: ReturnType<typeof toast> | null) => {
    if (!user || !firestore) return;
    const aPrevenir = passes.filter(p => clientReel(p.article.clientName));
    if (!aPrevenir.length) return;
    let transitDuration: string | undefined;
    if (dossier.arrivalDate) {
      const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
      const eta = new Date(dossier.arrivalDate); eta.setHours(0, 0, 0, 0);
      const jours = Math.round((eta.getTime() - aujourdhui.getTime()) / 86400000);
      transitDuration = jours > 1 ? `${jours} jours` : jours === 1 ? '1 jour' : jours === 0 ? "aujourd'hui" : undefined;
    }
    // Le statut que le client verra : celui du dossier (en mer, en douane…).
    const effectif = computeEffectiveStatus({ status: 'SHIPPED', arrivalDate: dossier.arrivalDate, stockEntryDate: dossier.stockEntryDate });
    const newStatus = effectif === 'TRANSIT' ? 'SHIPPED' : effectif;
    let envoyes = 0;
    const echecs: string[] = [];
    for (const p of aPrevenir) {
      const a = p.article;
      const couleur = Array.isArray(a.colorBreakdown) && a.colorBreakdown.length === 1 ? a.colorBreakdown[0]?.colorCode : a.color;
      const r = await sendStatusNotification({
        firestore,
        adminUid: user.uid,
        clientName: clientReel(a.clientName),
        articleName: a.categoryId || a.name,
        oldStatus: 'PI',
        newStatus,
        quantity: p.majQuantite && p.quantite != null ? p.quantite : Number(a.quantity),
        unitOfMeasure: a.unitOfMeasure,
        specs: a.specs,
        color: couleur,
        size: a.size,
        estimatedProductionDelay: a.estimatedProductionDelay,
        imageUrl: a.imageUrl || undefined,
        transitArrivalDate: dossier.arrivalDate || undefined,
        transitDuration,
        noBL: dossier.noBL || null,
        // Un envoi groupé ne peut pas ouvrir une fenêtre WhatsApp par article.
        channel: 'email',
      }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }) as { ok: boolean; error?: string });
      if (r?.ok) envoyes++;
      else echecs.push(`${a.clientName} : ${r?.error || 'pas d’e-mail'}`);
    }
    const texte = `${envoyes} ${pl(envoyes, 'e-mail envoyé', 'e-mails envoyés')} aux clients${echecs.length ? ` — non envoyés : ${echecs.slice(0, 3).join(' ; ')}${echecs.length > 3 ? '…' : ''}` : ''}.`;
    // Le premier message a pu se fermer pendant les envois : on le rouvre.
    if (resume) resume.update({ id: resume.id, open: true, title: 'Facture importée', description: texte, variant: echecs.length ? 'destructive' : 'default' });
    else toast({ title: 'Clients prévenus', description: texte });
  };

  const arreterFichier = (e: React.DragEvent) => { e.preventDefault(); };

  return (
    <DialogContent
      onEscapeKeyDown={e => { if (lecture || envoi) e.preventDefault(); }}
      onInteractOutside={e => { if (lecture || envoi) e.preventDefault(); }}
      onDragOver={arreterFichier}
      onDrop={arreterFichier}
      className="max-w-[min(1280px,96vw)] w-[96vw] h-[92vh] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden border-stone-200 rounded-2xl"
    >
      {/* En-tête */}
      <div className="bg-stone-900 p-5 flex items-center gap-3 text-white shrink-0">
        <div className="p-2 bg-white/10 rounded-lg"><FileSpreadsheet className="w-6 h-6" /></div>
        <div className="min-w-0">
          <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">Importer la facture fournisseur</DialogTitle>
          <DialogDescription className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
            Dossier {dossier.id}{dossier.supplierId ? ` · ${dossier.supplierId}` : ''} · les lignes passent en transit avec leur poids net et leur volume
          </DialogDescription>
        </div>
        {lecture && !envoi && (
          <Button
            variant="ghost"
            onClick={() => { setLecture(null); setPropositions([]); }}
            className="ml-auto mr-8 text-stone-300 hover:text-white hover:bg-white/10 text-[10px] font-black uppercase tracking-widest gap-2 h-9"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Autre fichier
          </Button>
        )}
      </div>

      {!lecture ? (
        // ── Étape 1 : le document ─────────────────────────────────────────────
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-2">
              <ClipboardPaste className="w-3.5 h-3.5" /> Colle le packing list (PL) copié depuis Excel
            </p>
            <Textarea
              value={collage}
              onChange={e => setCollage(e.target.value)}
              placeholder={'Dans l’onglet PL, sélectionne depuis « INVOICE NO. » (pour le n° de facture) jusqu’à la ligne TOTAL, copie, colle ici.'}
              className="min-h-[220px] font-mono text-[11px]"
              autoFocus
            />
            <div className="flex justify-end">
              <Button
                onClick={() => demarrer(lireTexteColle(collage), 'tableau collé')}
                disabled={!collage.trim()}
                className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-10 rounded-xl px-6"
              >
                Lire le tableau
              </Button>
            </div>
          </div>

          <label
            htmlFor="fichier-facture-fournisseur"
            onDragOver={e => { e.preventDefault(); setSurvol(true); }}
            onDragLeave={() => setSurvol(false)}
            onDrop={e => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) lireFichier(f); }}
            className={`block cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-colors focus-within:ring-2 focus-within:ring-amber-400 ${survol ? 'border-amber-500 bg-amber-50' : 'border-stone-300 bg-stone-50 hover:bg-stone-100'}`}
          >
            {chargement
              ? <Loader2 className="w-8 h-8 mx-auto text-stone-400 animate-spin" />
              : <Upload className="w-8 h-8 mx-auto text-stone-400" />}
            <span className="mt-2 block text-xs font-black text-stone-800 uppercase tracking-tight">Ou dépose l'Excel du fournisseur, ou clique pour le choisir</span>
            <span className="mt-1 block text-[11px] text-stone-500">
              Le classeur « {dossier.id}+INV.xlsx » : l'onglet INV donne les prix, l'onglet PL les poids et volumes.
            </span>
            <input
              id="fichier-facture-fournisseur"
              type="file"
              accept=".xlsx,.xls,.xlsm"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) lireFichier(f); e.target.value = ''; }}
            />
          </label>

          {erreur && (
            <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {erreur}
            </div>
          )}
        </div>
      ) : (
        // ── Étape 2 : vérifier les rapprochements ────────────────────────────
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-2 border-b border-stone-100 bg-[#F9F6F0]">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-black text-stone-800">{nomFichier}</span>
                {lecture.numeroFacture && <Chip>Facture {lecture.numeroFacture}</Chip>}
                {lecture.numeroCommande && <Chip>Commande {lecture.numeroCommande}</Chip>}
                {lecture.dateFacture && <Chip>{lecture.dateFacture}</Chip>}
                <Chip ton={lecture.aLesPrix ? 'ok' : 'attention'}>{lecture.aLesPrix ? 'Prix lus (INV)' : 'Sans prix : rapprochement moins sûr'}</Chip>
                <Chip ton={lecture.aLesPoids ? 'ok' : 'attention'}>{lecture.aLesPoids ? 'Poids et volumes lus (PL)' : 'Sans packing list : poids et volumes des fiches gardés'}</Chip>
                <span className="text-stone-500">{lecture.lignes.length} {pl(lecture.lignes.length, 'ligne', 'lignes')}</span>
              </div>
              {repliFournisseur && (
                <p className="text-[11px] font-bold text-amber-700">
                  Aucun article en attente chez « {dossier.supplierId} » (fournisseur du dossier) : seuls les articles déjà au dossier sont proposés d’office ; la liste de chaque ligne montre ceux de tous les fournisseurs.
                </p>
              )}
              {!dossier.supplierId && (
                <p className="text-[11px] font-bold text-amber-700">Dossier sans fournisseur : tous les articles en production sont proposés.</p>
              )}
              {lecture.avertissements.map((a, i) => (
                <p key={i} className="text-[11px] font-bold text-amber-700 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {a}</p>
              ))}
            </div>

            <fieldset disabled={envoi} className="contents">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e7e5e4]">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                    <th className="text-left px-3 py-2 w-[28%]">Ligne de la facture</th>
                    <th className="text-right px-2 py-2">Quantité</th>
                    <th className="text-right px-2 py-2">N.W. / CBM</th>
                    <th className="text-left px-3 py-2 w-[34%]">Article</th>
                    <th className="text-left px-3 py-2 w-[22%]">Ce qui sera fait</th>
                  </tr>
                </thead>
                <tbody>
                  {lecture.lignes.map((l, i) => {
                    const titreNouveau = i === 0 || l.ref !== lecture.lignes[i - 1].ref || l.titre !== lecture.lignes[i - 1].titre;
                    const choisi = choix[l.index] ?? null;
                    return (
                      <React.Fragment key={l.index}>
                        {titreNouveau && (
                          <tr className="bg-stone-50 border-t border-stone-200">
                            <td colSpan={5} className="px-3 py-1.5 font-black text-stone-700">
                              {l.ref && <span className="text-amber-700 mr-2">{l.ref}</span>}{l.titre}
                            </td>
                          </tr>
                        )}
                        <LigneTableau
                          ligne={l}
                          proposition={propositions[l.index]}
                          choisi={choisi}
                          manuel={manuels.has(l.index)}
                          article={choisi ? parId.get(choisi) : undefined}
                          optionsTous={optionsTous}
                          libelles={libelles}
                          plan={choisi ? planParArticle.get(choisi) : undefined}
                          dossierId={dossier.id}
                          appliquerPrix={appliquerPrix}
                          choisir={choisir}
                          changerMode={changerMode}
                          forcer={forcer}
                        />
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </fieldset>
          </div>

          {/* Pied : contrôles, options, confirmation */}
          {bilan && (
            <div className="shrink-0 border-t border-stone-200 bg-stone-50 p-4 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-bold text-stone-600">
                <span><b className="text-stone-900">{bilan.enTransit}</b> {pl(bilan.enTransit, 'article passe', 'articles passent')} en transit{bilan.partiels ? ` (dont ${bilan.partiels} ${pl(bilan.partiels, 'partiel', 'partiels')})` : ''}</span>
                {bilan.majs > 0 && <span><b className="text-stone-900">{bilan.majs}</b> déjà au dossier, mis à jour</span>}
                {bilan.bloques > 0 && <span className="text-red-700"><b>{bilan.bloques}</b> à fractionner à la main (hors import)</span>}
                <span><b className="text-stone-900">{plan!.ignorees.length}</b> {pl(plan!.ignorees.length, 'ligne sans article (ignorée)', 'lignes sans article (ignorées)')}</span>
                <span>
                  Dossier après import : <b className="text-stone-900">{nf(bilan.poids)} kg</b> · <b className="text-stone-900">{nf(bilan.volume, 3)} m³</b>
                  {lecture.totaux.poidsNet != null && <> (document : {nf(lecture.totaux.poidsNet)} kg · {nf(lecture.totaux.volume, 3)} m³)</>}
                </span>
              </div>
              {aConfirmer.length > 0 && (
                <div className="space-y-1">
                  {aConfirmer.map(c => (
                    <label key={c.cle} className="flex items-start gap-2 p-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-[11px] font-bold cursor-pointer">
                      <input type="checkbox" className="mt-0.5" checked={Boolean(confirmations[c.cle])} onChange={e => setConfirmations(x => ({ ...x, [c.cle]: e.target.checked }))} />
                      <span>{c.texte}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-bold text-stone-700">
                {lecture.aLesPrix && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={appliquerPrix} onChange={e => setAppliquerPrix(e.target.checked)} />
                    Prix d'achat au prix de la facture ({bilan.prixModifies} {pl(bilan.prixModifies, 'changement', 'changements')})
                  </label>
                )}
                {lecture.fret != null && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={majFret} onChange={e => setMajFret(e.target.checked)} />
                    Fret de la facture{lecture.frets.length > 1 ? ` (${lecture.frets.length} lignes)` : ''} : {nf(lecture.fret)} $ (dossier : {nf(Number(dossier.freightCost) || 0)} $)
                  </label>
                )}
                {bilan.notifies > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={prevenir} onChange={e => setPrevenir(e.target.checked)} />
                    Prévenir les clients par e-mail : {bilan.notifies} {pl(bilan.notifies, 'message', 'messages')} (un par article) à {bilan.clients.join(', ')}
                  </label>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {raisonBlocage && <span className="text-[10px] font-bold text-stone-500">{raisonBlocage}</span>}
                  <Button variant="ghost" onClick={fermer} disabled={envoi} className="text-[10px] font-black uppercase tracking-widest h-11">Annuler</Button>
                  <Button
                    onClick={confirmer}
                    disabled={!peutConfirmer}
                    className="bg-stone-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-11 rounded-xl gap-2 px-6"
                  >
                    {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
                    {bilan.enTransit
                      ? `Passer ${bilan.enTransit} ${pl(bilan.enTransit, 'article', 'articles')} en transit`
                      : 'Mettre à jour le dossier'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DialogContent>
  );
}

function Chip({ children, ton }: { children: React.ReactNode; ton?: 'ok' | 'attention' }) {
  const classe = ton === 'ok'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : ton === 'attention'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-white text-stone-600 border-stone-200';
  return <span className={`px-2 py-0.5 rounded-full border font-bold ${classe}`}>{children}</span>;
}

// ── Une ligne de la facture ─────────────────────────────────────────────────

const LigneTableau = memo(function LigneTableau({
  ligne, proposition, choisi, manuel, article, optionsTous, libelles, plan, dossierId, appliquerPrix, choisir, changerMode, forcer,
}: {
  ligne: LigneFacture;
  proposition: Proposition | undefined;
  choisi: string | null;
  manuel: boolean;
  article: any;
  /** Les options « tous les articles », rendues une fois pour toutes les lignes. */
  optionsTous: React.ReactNode[];
  libelles: Map<string, string>;
  plan: PlanArticle | undefined;
  dossierId: string;
  appliquerPrix: boolean;
  choisir: (index: number, id: string | null) => void;
  changerMode: (articleId: string, mode: ModePassage) => void;
  forcer: (articleId: string, v: boolean) => void;
}) {
  const classement = proposition?.classement || [];
  // Les plus proches : les 8 premiers, plus tous les ex-æquo du dernier retenu.
  const retenus = classement.filter(e => e.score >= 30);
  const seuil = retenus[Math.min(7, retenus.length - 1)]?.score ?? Infinity;
  const suggestions = retenus.filter((e, i) => i < 8 || e.score >= seuil);
  // Pour un choix hors du classement, on évalue quand même : ses écarts s'affichent.
  const evaluation = useMemo(() => {
    if (!choisi || !article) return null;
    return classement.find(e => e.articleId === choisi) ?? evaluer(ligne, article, dossierId);
  }, [choisi, article, classement, ligne, dossierId]);
  const confiance: Confiance = choisi
    ? (proposition?.articleId === choisi ? proposition.confiance : 'probable')
    : (proposition?.articleId ? 'a-verifier' : 'aucune');
  const premiere = plan ? plan.lignes[0].index === ligne.index : false;
  const avec = plan && plan.lignes.length > 1 ? plan.lignes.filter(l => l.index !== ligne.index) : [];

  return (
    <tr className={`border-t border-stone-100 align-top ${choisi ? '' : 'bg-amber-50/30'}`}>
      <td className="px-3 py-2">
        <div className="font-mono font-bold text-stone-800"><span className="text-stone-400 mr-1">{ligne.index + 1}.</span>{ligne.code || '—'}</div>
        {ligne.spec && <div className="text-stone-500">{ligne.spec}</div>}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <div className="font-black text-stone-900">{nf(ligne.quantite, 3)} <span className="font-normal text-stone-400">{ligne.unite}</span></div>
        {ligne.prixUnitaire != null && <div className="text-amber-700 font-bold">{nf(ligne.prixUnitaire, 5)} $</div>}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <div className="font-bold text-stone-700">{nf(ligne.poidsNet)} kg</div>
        <div className="text-emerald-700 font-bold">{nf(ligne.volume, 3)} m³</div>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`Article pour la ligne ${ligne.index + 1}`}
          value={choisi || ''}
          onChange={e => choisir(ligne.index, e.target.value || null)}
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">{proposition?.articleId && !choisi ? '— À choisir : plusieurs articles possibles —' : '— Aucun : ignorer la ligne —'}</option>
          {suggestions.length > 0 && (
            <optgroup label="Les plus proches">
              {suggestions.map(e => <option key={`s-${e.articleId}`} value={e.articleId}>{libelles.get(e.articleId)}</option>)}
            </optgroup>
          )}
          <optgroup label="Tous les articles en attente">{optionsTous}</optgroup>
        </select>
        {article && (
          <div className="mt-1 text-[10px] text-stone-500 truncate" title={libelles.get(article.id)}>
            {[
              codeModele(article) ? `modèle ${codeModele(article)}` : '',
              `${nf(Number(article.purchasePricePerUnit), 5)} $`,
              `${nf(Number(article.quantity), 3)} ${article.unitOfMeasure || ''}`,
              article.color && article.color !== 'various' ? article.color : '',
              article.clientName ? `client ${article.clientName}` : '',
            ].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`px-1.5 py-px rounded border text-[9px] font-black uppercase tracking-wide ${LIBELLE_CONFIANCE[confiance].classe}`}>
            {manuel && choisi ? 'Choisi' : LIBELLE_CONFIANCE[confiance].texte}
          </span>
          {avec.length > 0 && (
            <span className="text-[10px] text-stone-500">avec la ligne {avec.map(x => x.index + 1).join(', ')}</span>
          )}
          {evaluation?.raisons.map((r, i) => <span key={i} className="text-[10px] font-bold text-red-600">{r}</span>)}
        </div>
      </td>
      <td className="px-3 py-2">
        {!plan ? (
          <span className="text-stone-400 font-bold">{proposition?.articleId && !choisi ? 'En attente d’un choix' : 'Ignorée'}</span>
        ) : !premiere ? (
          <div className="space-y-1">
            <span className="text-stone-400">↳ regroupée avec la ligne {plan.lignes[0].index + 1}</span>
            {plan.avertissements.map((w, i) => <div key={i} className="text-amber-700 font-bold">{w}</div>)}
          </div>
        ) : (
          <Effet plan={plan} appliquerPrix={appliquerPrix} changerMode={changerMode} forcer={forcer} />
        )}
      </td>
    </tr>
  );
});

function Effet({ plan: p, appliquerPrix, changerMode, forcer }: {
  plan: PlanArticle;
  appliquerPrix: boolean;
  changerMode: (id: string, m: ModePassage) => void;
  forcer: (id: string, v: boolean) => void;
}) {
  const a = p.article;
  const u = a.unitOfMeasure || '';
  const qa = Number(a.quantity) || 0;
  const changements: string[] = [];
  if (p.majQuantite && p.quantite != null && p.mode !== 'partiel') changements.push(`qté ${nf(qa, 3)} → ${nf(p.quantite, 3)} ${u}`);
  if (changePrix(p, appliquerPrix)) changements.push(`prix ${nf(Number(a.purchasePricePerUnit), 5)} → ${nf(p.prix, 5)} $`);
  if (p.majPoidsNet && Number(a.netWeight) !== p.poidsNet) changements.push(`N.W. ${nf(Number(a.netWeight) || 0)} → ${nf(p.poidsNet)} kg`);
  if (p.majVolume && Number(a.cubicMeasurement) !== p.volume) changements.push(`CBM ${nf(Number(a.cubicMeasurement) || 0, 3)} → ${nf(p.volume, 3)}`);
  const abandonne = p.quantite != null && p.quantite < qa ? qa - p.quantite : 0;
  const forcable = p.partielReparti;

  return (
    <div className="space-y-1">
      {p.bloque ? (
        <div className="font-black text-red-700">Hors import : à fractionner</div>
      ) : p.mode === 'maj' ? (
        <div className="font-black text-sky-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Déjà au dossier{changements.length ? '' : ' · à jour'}</div>
      ) : p.mode === 'partiel' ? (
        <div className="font-black text-violet-700">
          Partiel : {nf(p.quantite, 3)} {u} en transit, {nf(p.reste, 3)} restent en production
        </div>
      ) : (
        <div className="font-black text-blue-700 flex items-center gap-1"><Ship className="w-3.5 h-3.5" /> En transit</div>
      )}
      {!p.bloque && p.modesPossibles.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {p.modesPossibles.map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={p.mode === m}
              onClick={() => changerMode(a.id, m)}
              className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wide ${p.mode === m ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
            >
              {m === 'solde' ? (abandonne ? `Solder (${nf(abandonne, 3)} abandonnés)` : 'Tout passer') : 'Garder le reste en production'}
            </button>
          ))}
        </div>
      )}
      {forcable && (
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-stone-700 cursor-pointer">
          <input type="checkbox" checked={!p.bloque} onChange={e => forcer(a.id, e.target.checked)} />
          Passer quand même tout l'article
        </label>
      )}
      {changements.map((c, i) => <div key={i} className="text-stone-600">{c}</div>)}
      {p.conversion && p.conversion.libelle && p.conversion.nature !== 'brute' && (
        <div className="text-stone-400">{p.conversion.libelle}</div>
      )}
      {p.avertissements.map((w, i) => <div key={i} className="text-amber-700 font-bold">{w}</div>)}
    </div>
  );
}
