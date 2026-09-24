"use client";

import React, { useMemo, useState } from 'react';
import {
  Send, Plus, Search, X, ClipboardList, Factory, Store as StoreIcon,
  Palette, Ruler, Sparkles, Clock, Printer, PenLine, Trash2, BadgeCheck,
} from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddOrderModal from '@/components/add-order-modal';
import { getArticleFrenchName } from '@/lib/product-name-utils';
import { exportDemandesImportPDF } from '@/lib/pdf-demande-import';
import { etapeDemande, champsEnvoiAuCommercial } from '@/lib/demande-magasin';

/**
 * Demandes de nouveaux produits écrites par les magasins.
 *
 * Une demande est un article `TO_ORDER` créé depuis /stock avec `requestSource: 'STORE'`. Le
 * suivi tient en trois étapes, et c'est le magasin qui déclenche la deuxième :
 *
 *   1. « Brouillon »  — elle n'appartient qu'au magasin. Personne ne la voit dans /gestion.
 *                       C'est le moment où on l'imprime et où le commercial la relit.
 *   2. « Envoyée »    — le magasin a cliqué sur « Envoyer au service commercial ». Elle apparaît
 *                       alors dans les Besoins de /gestion.
 *   3. « Commandée »  — le service import l'a lancée ; elle reste affichée quelques jours, puis
 *                       la suite (transit, arrivage) se suit dans la page Arrivages.
 *
 * Avant, la demande partait à l'import à la seconde où le formulaire était validé : le commercial
 * découvrait des lignes que personne n'avait relues, et le magasin ne pouvait plus rien corriger.
 *
 * Le papier compte autant que l'écran : une demande s'imprime (src/lib/pdf-demande-import.ts) et
 * se fait viser avant d'être envoyée. Aucun prix ni fournisseur n'est affiché ici.
 */

interface StoreImportRequestsViewProps {
  articles: any[];
  factures: any[];
  categories: any[];
  generalCategories: any[];
  stores: any[];
  adminUid: string | null;
  /** Magasin du compte connecté. */
  storeId: string | null;
  /** Vrai quand le compte voit les demandes de tous les magasins. */
  seesAllStores: boolean;
  readOnly?: boolean;
}

type Stage = 'DRAFT' | 'SENT' | 'ORDERED';

/** Durée pendant laquelle une demande commandée reste affichée au magasin. */
const ORDERED_VISIBLE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const STAGES: Record<Stage, { label: string; icon: any; cls: string; bar: string }> = {
  DRAFT:   { label: 'Brouillon',          icon: PenLine,   cls: 'bg-amber-50 text-amber-800 border-amber-200',       bar: 'bg-amber-400' },
  SENT:    { label: 'Envoyée',            icon: Send,      cls: 'bg-stone-100 text-stone-700 border-stone-200',      bar: 'bg-stone-400' },
  ORDERED: { label: 'Commandée',          icon: Factory,   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
};

/**
 * Le parcours réel d'une demande. L'étape du milieu est celle qu'on oubliait : sans document visé
 * par le commercial, le service import reçoit des lignes que personne n'a relues.
 */
const ETAPES_DEMANDE = [
  'Le magasin écrit la demande : elle reste ici, en brouillon.',
  "On l'imprime et le commercial la vérifie ligne à ligne, puis la vise.",
  "Le magasin l'envoie : le service import la reçoit et décide du lancement.",
];

const fmtQty = (n: any) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });

/**
 * Hors ligne, une écriture Firestore ne se résout JAMAIS : elle reste en attente dans le cache
 * local jusqu'au retour du réseau. Sans ce garde-fou, le bouton restait sur « Envoi… » et tout
 * l'écran était gelé — le magasin, lui, croyait sa demande partie.
 */
async function avecDelai<T>(promesse: Promise<T>, secondes = 20): Promise<T> {
  return Promise.race([
    promesse,
    new Promise<T>((_, rejeter) => setTimeout(() => rejeter(new Error('timeout')), secondes * 1000)),
  ]);
}

/** Le message à afficher quand une écriture n'a pas été confirmée. */
const messageEchec = (e: any) => e?.message === 'timeout'
  ? "Pas de réponse du serveur. Vérifiez la connexion, puis regardez l'état de la demande avant de recommencer."
  : (e?.message || 'Réessayez.');

/** Timestamp Firestore, {seconds}, Date ou chaîne YYYY-MM-DD → millisecondes (0 si absent). */
function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

function fmtDate(ms: number): string {
  return ms ? new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
}

/**
 * Moment où l'import a lancé la demande. Chaque chemin de /gestion pose sa propre trace :
 * launchedAt (lancement de commande), validatedAt (validation directe), orderDate (date saisie).
 */
function orderedAtMs(a: any): number {
  return toMs(a.launchedAt) || toMs(a.validatedAt) || toMs(a.orderDate) || toMs(a.updatedAt) || toMs(a.requestedAt) || toMs(a.createdAt);
}

type Filter = 'ALL' | Stage;

export default function StoreImportRequestsView({
  articles, categories, generalCategories, stores, adminUid, storeId, seesAllStores, readOnly,
}: StoreImportRequestsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const storeName = (id?: string | null) => stores.find((s: any) => s.id === id)?.name || id || '';

  const requests = useMemo(() => {
    const now = Date.now();
    return (articles || [])
      .filter((a: any) => a.requestSource === 'STORE' && (seesAllStores || a.requestedByStore === storeId))
      .map((a: any) => {
        // Le statut de l'article ne dit que ce que l'import en a fait ; l'étape du magasin, elle,
        // vit dans son propre champ — un brouillon reste un TO_ORDER que personne n'a encore vu.
        const stage: Stage = etapeDemande(a) === 'DRAFT'
          ? 'DRAFT'
          : (a.status || 'TO_ORDER') === 'TO_ORDER' ? 'SENT' : 'ORDERED';
        const orderedAt = stage === 'ORDERED' ? orderedAtMs(a) : 0;
        const daysLeft = stage === 'ORDERED'
          ? Math.ceil((orderedAt + ORDERED_VISIBLE_DAYS * DAY_MS - now) / DAY_MS)
          : null;
        return {
          a, stage, orderedAt, daysLeft,
          requestedAt: toMs(a.requestedAt) || toMs(a.createdAt),
          frName: getArticleFrenchName(a, categories, generalCategories),
        };
      })
      // Une demande commandée ne reste visible que quelques jours, puis sort de la liste.
      .filter(r => r.stage !== 'ORDERED' || (r.orderedAt > 0 && (r.daysLeft ?? 0) > 0))
      .sort((x, y) => {
        // Les brouillons d'abord : ce sont les seuls sur lesquels le magasin a encore la main.
        const rang: Record<Stage, number> = { DRAFT: 0, SENT: 1, ORDERED: 2 };
        if (x.stage !== y.stage) return rang[x.stage] - rang[y.stage];
        return (y.orderedAt || y.requestedAt) - (x.orderedAt || x.requestedAt);
      });
  }, [articles, seesAllStores, storeId, categories, generalCategories]);

  const counts = useMemo(() => ({
    ALL: requests.length,
    DRAFT: requests.filter(r => r.stage === 'DRAFT').length,
    SENT: requests.filter(r => r.stage === 'SENT').length,
    ORDERED: requests.filter(r => r.stage === 'ORDERED').length,
  }), [requests]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      if (filter !== 'ALL' && r.stage !== filter) return false;
      if (!q) return true;
      return [r.frName, r.a.name, r.a.categoryId, r.a.color, r.a.quality, r.a.requestedByStoreName, r.a.notes]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [requests, filter, search]);

  const canRequest = Boolean(storeId && adminUid && !readOnly);
  /** Les brouillons de la liste AFFICHÉE : c'est exactement ce que le bouton groupé enverra. */
  const brouillonsAffiches = useMemo(() => visible.filter(l => l.stage === 'DRAFT'), [visible]);

  /**
   * Envoie la demande au service commercial. C'est le geste qui la fait sortir du magasin : elle
   * apparaît dès lors dans les Besoins de /gestion, où le commercial la confirme et où le service
   * import décide du lancement. On demande confirmation parce que le retour en arrière n'existe
   * pas de ce côté-ci de l'écran.
   */
  const envoyerAuCommercial = async (ligne: typeof visible[number]) => {
    if (!firestore || !adminUid || enCours) return;
    const ok = await confirm({
      title: 'Envoyer au service commercial ?',
      description: `« ${ligne.frName} » quittera le magasin et apparaîtra dans les besoins de l'import.\n\n`
        + `Imprime-la et fais-la viser avant, si ce n'est pas déjà fait : c'est le document visé qui compte.`,
      confirmLabel: 'Envoyer',
    });
    if (!ok) return;
    setEnCours(ligne.a.id);
    try {
      await avecDelai(updateDoc(
        doc(firestore, 'users', adminUid, 'articles', ligne.a.id),
        champsEnvoiAuCommercial(serverTimestamp()) as any,
      ));
      toast({
        title: 'Demande envoyée',
        description: `« ${ligne.frName} » est partie au service commercial.`,
      });
    } catch (e: any) {
      console.error('[demandes] envoi impossible :', e);
      toast({ variant: 'destructive', title: 'Envoi non confirmé', description: messageEchec(e) });
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Envoie d'un coup tous les brouillons affichés. Une demande ventilée par couleurs s'écrit en
   * plusieurs documents, un par groupe de prix : sans ce bouton, le magasin doit cliquer sur
   * chacun, et il en oublie un.
   */
  const envoyerTousLesBrouillons = async () => {
    if (!firestore || !adminUid || enCours) return;
    const brouillons = brouillonsAffiches;
    if (brouillons.length === 0) return;
    const ok = await confirm({
      title: `Envoyer ${brouillons.length} demande${brouillons.length > 1 ? 's' : ''} au service commercial ?`,
      description: brouillons.map(l => `· ${l.frName}`).join('\n')
        + `\n\nElles quitteront le magasin et apparaîtront dans les besoins de l'import.`,
      confirmLabel: 'Tout envoyer',
    });
    if (!ok) return;
    setEnCours('TOUS');
    try {
      const lot = writeBatch(firestore);
      for (const ligne of brouillons) {
        lot.update(
          doc(firestore, 'users', adminUid, 'articles', ligne.a.id),
          champsEnvoiAuCommercial(serverTimestamp()) as any,
        );
      }
      await avecDelai(lot.commit());
      toast({
        title: `${brouillons.length} demande${brouillons.length > 1 ? 's' : ''} envoyée${brouillons.length > 1 ? 's' : ''}`,
        description: 'Le service commercial les voit maintenant.',
      });
    } catch (e: any) {
      console.error('[demandes] envoi groupé impossible :', e);
      toast({ variant: 'destructive', title: 'Envoi non confirmé', description: messageEchec(e) });
    } finally {
      setEnCours(null);
    }
  };

  /** Supprime un brouillon. Seul un brouillon : une demande envoyée ne s'efface plus d'ici. */
  const supprimerBrouillon = async (ligne: typeof visible[number]) => {
    if (!firestore || !adminUid || enCours) return;
    const ok = await confirm({
      title: 'Supprimer ce brouillon ?',
      description: `« ${ligne.frName} » sera effacée. Personne ne l'a encore vue : rien d'autre ne bouge.`,
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    });
    if (!ok) return;
    setEnCours(ligne.a.id);
    try {
      await avecDelai(deleteDoc(doc(firestore, 'users', adminUid, 'articles', ligne.a.id)));
      toast({ title: 'Brouillon supprimé' });
    } catch (e: any) {
      console.error('[demandes] suppression impossible :', e);
      toast({ variant: 'destructive', title: 'Suppression non confirmée', description: messageEchec(e) });
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Imprime le document que le commercial va viser. On n'envoie que ce qui est déjà à l'écran :
   * le magasin imprime ce qu'il vient de relire, pas une liste qu'il n'a pas vue.
   */
  const imprimer = (lignes: typeof visible, sousTitre: string) => {
    exportDemandesImportPDF(
      lignes.map(({ a, frName, requestedAt }) => ({
        article: a,
        nomProduit: frName,
        magasin: a.requestedByStoreName || storeName(a.requestedByStore) || storeName(storeId),
        demandeeLe: requestedAt || undefined,
        justification: a.notes,
      })),
      { categories, generalCategories, sousTitre },
    ).catch((e: any) => {
      console.error('[demandes] impression impossible :', e);
      toast({ variant: 'destructive', title: 'Impression impossible', description: e?.message || 'Réessayez.' });
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-[11px] font-black text-stone-500 uppercase tracking-[0.3em] mb-2">Service import</p>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Demandes <span className="text-amber-400">d'Import</span>
            </h2>
            <p className="text-stone-400 text-xs mt-2 max-w-lg">
              Un produit manque ou n'existe pas encore ? Écrivez la demande : elle reste en
              <span className="text-amber-400 font-black"> brouillon</span>, le temps de l'imprimer et de
              la faire viser par le commercial. C'est <span className="text-white font-black">vous</span> qui
              l'envoyez ensuite. Une fois commandée par l'import, elle reste affichée
              {' '}{ORDERED_VISIBLE_DAYS} jours.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {visible.length > 0 && (
              <Button
                onClick={() => imprimer(visible, `${visible.length} demande${visible.length > 1 ? 's' : ''} affichée${visible.length > 1 ? 's' : ''} — à vérifier avec le commercial`)}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-black uppercase text-[11px] tracking-widest px-5 h-12 rounded-2xl gap-2"
                title="Imprimer les demandes affichées, pour les faire viser par le commercial"
              >
                <Printer className="w-4 h-4" /> Imprimer la liste
              </Button>
            )}
            {canRequest && brouillonsAffiches.length > 0 && (
              <Button
                onClick={envoyerTousLesBrouillons}
                disabled={enCours !== null}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-black uppercase text-[11px] tracking-widest px-5 h-12 rounded-2xl gap-2 disabled:opacity-50"
                title="Envoyer tous les brouillons affichés au service commercial"
              >
                <BadgeCheck className="w-4 h-4" />
                {enCours === 'TOUS' ? 'Envoi…' : `Envoyer les brouillons (${brouillonsAffiches.length})`}
              </Button>
            )}
            {canRequest && (
              <Button
                onClick={() => setModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black uppercase text-[11px] tracking-widest px-6 h-12 rounded-2xl gap-2 shadow-lg shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" /> Nouvelle demande
              </Button>
            )}
          </div>
        </div>

        {/* Étapes du suivi, et parcours du document */}
        <div className="relative z-10 flex flex-col lg:flex-row gap-3 mt-6">
          <div className="grid grid-cols-3 gap-3 lg:w-96 shrink-0">
            {(['DRAFT', 'SENT', 'ORDERED'] as Stage[]).map(st => {
              const conf = STAGES[st];
              const Icon = conf.icon;
              return (
                <div key={st} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
                    <Icon className="w-3 h-3" /> {conf.label}
                  </p>
                  <p className="text-2xl font-black text-white mt-0.5">{counts[st]}</p>
                </div>
              );
            })}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Parcours d'une demande</p>
            <ol className="mt-1.5 space-y-1">
              {ETAPES_DEMANDE.map((etape, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] font-semibold text-stone-300 leading-snug">
                  <span className="mt-px w-4 h-4 shrink-0 rounded-full bg-white/10 text-[9px] font-black text-amber-400 flex items-center justify-center">
                    {i + 1}
                  </span>
                  {etape}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Filtres + recherche */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {([
            ['ALL', 'Toutes'],
            ['DRAFT', 'Brouillons'],
            ['SENT', 'Envoyées'],
            ['ORDERED', 'Commandées'],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${
                filter === key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >
              {label} <span className="opacity-60 ml-1">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit, une couleur…"
            className="h-10 pl-9 rounded-xl border-stone-200 text-xs font-semibold"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
          <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600 font-black uppercase text-xs tracking-widest">
            {requests.length === 0 ? 'Aucune demande en cours' : 'Aucune demande dans cette vue'}
          </p>
          {requests.length === 0 && canRequest && (
            <p className="text-stone-400 text-[11px] font-medium mt-1">
              Cliquez sur « Nouvelle demande » pour demander un produit au service import.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((ligne) => {
            const { a, stage, frName, orderedAt, daysLeft, requestedAt } = ligne;
            const conf = STAGES[stage];
            const Icon = conf.icon;
            const colors = Array.isArray(a.colorBreakdown) ? a.colorBreakdown.length : 0;
            const sizes = Array.isArray(a.sizeBreakdown) ? a.sizeBreakdown.length : 0;
            const qualities = Array.isArray(a.qualityBreakdown) ? a.qualityBreakdown.length : 0;

            return (
              <div key={a.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-stone-900 uppercase leading-tight">{frName}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {a.quality && <Chip>{a.quality}</Chip>}
                      {a.color && String(a.color).toLowerCase() !== 'various' && <Chip>{a.color}</Chip>}
                      {a.size && String(a.size).toLowerCase() !== 'various' && <Chip>{a.size}</Chip>}
                      {qualities > 1 && <Chip icon={Sparkles}>{qualities} qualités</Chip>}
                      {colors > 0 && <Chip icon={Palette}>{colors} couleur{colors > 1 ? 's' : ''}</Chip>}
                      {sizes > 0 && <Chip icon={Ruler}>{sizes} taille{sizes > 1 ? 's' : ''}</Chip>}
                      {seesAllStores && a.requestedByStore && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-900 text-white">
                          <StoreIcon className="w-3 h-3" /> {a.requestedByStoreName || storeName(a.requestedByStore)}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-stone-400">
                        Demandée le {fmtDate(requestedAt)}
                        {stage === 'ORDERED' && ` · commandée le ${fmtDate(orderedAt)}`}
                      </span>
                    </div>
                    {a.notes && <p className="text-[11px] text-stone-500 mt-1.5 italic">« {a.notes} »</p>}
                  </div>

                  <div className="flex items-center gap-4 md:gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-xl font-black text-stone-900 leading-none">{fmtQty(a.quantity)}</p>
                      <p className="text-[10px] font-black text-stone-400 uppercase mt-1">{a.unitOfMeasure || 'pcs'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-3 py-1.5 rounded-full border whitespace-nowrap ${conf.cls}`}>
                        <Icon className="w-3.5 h-3.5" /> {conf.label}
                      </span>
                      {stage === 'ORDERED' && daysLeft !== null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-400">
                          <Clock className="w-3 h-3" />
                          {daysLeft <= 1 ? "Disparaît aujourd'hui" : `Visible encore ${daysLeft} j`}
                        </span>
                      )}
                    </div>
                    {/* Le document à faire viser par le commercial avant l'envoi. */}
                    <button
                      onClick={() => imprimer([ligne], `Demande du ${fmtDate(requestedAt)} — ${frName}`)}
                      title="Imprimer cette demande pour la faire viser par le commercial"
                      className="h-10 px-3 rounded-xl border-2 border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0"
                    >
                      <Printer className="w-4 h-4" />
                      <span className="hidden lg:inline">Imprimer</span>
                    </button>
                    {/* Un brouillon appartient encore au magasin : il peut l'envoyer ou l'effacer. */}
                    {stage === 'DRAFT' && canRequest && (
                      <>
                        <button
                          onClick={() => envoyerAuCommercial(ligne)}
                          disabled={enCours !== null}
                          title="Envoyer cette demande au service commercial"
                          className="h-10 px-4 rounded-xl bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0"
                        >
                          <BadgeCheck className="w-4 h-4" />
                          <span className="hidden lg:inline">
                            {enCours === a.id ? 'Envoi…' : 'Envoyer au commercial'}
                          </span>
                        </button>
                        <button
                          onClick={() => supprimerBrouillon(ligne)}
                          disabled={enCours !== null}
                          title="Supprimer ce brouillon"
                          className="h-10 w-10 rounded-xl border-2 border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-colors inline-flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Avancement : brouillon, envoyée, commandée */}
                <div className="flex gap-1 mt-3">
                  <div className={`h-1.5 flex-1 rounded-full ${conf.bar}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${stage === 'DRAFT' ? 'bg-stone-100' : conf.bar}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${stage === 'ORDERED' ? conf.bar : 'bg-stone-100'}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canRequest && (
        <AddOrderModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          adminUid={adminUid}
          activeStore={storeId || undefined}
          storeRequest={{ storeId: storeId!, storeName: storeName(storeId) }}
        />
      )}
    </div>
  );
}

function Chip({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border bg-stone-50 text-stone-600 border-stone-200">
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
