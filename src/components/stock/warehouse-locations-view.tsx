"use client";

import React, { useState, useMemo } from 'react';
import { MapPin, Plus, Save, Trash2, Loader2, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { collection, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import type { Store } from '@/lib/types';
import {
  StorageLocation, normalizeSegment, compareLocationCodes, computeLocationContents,
  normalizeVariantValue, articleVariantDimension, type LocationContentLine, type VariantDimension,
} from '@/lib/warehouse-locations';
import { lieuDeMouvement } from '@/lib/stock-disponible';

interface WarehouseLocationsViewProps {
  stores: Store[];
  locations: StorageLocation[];
  movements: any[];
  /** Articles d'arrivage : leur ventilation dit quelle dimension distingue les variantes. */
  articles?: any[];
  adminUid: string | null;
  readOnly?: boolean;
}

const isVarious = (v: unknown) => normalizeVariantValue(v) === 'various';

const VARIANT_FIELDS = ['quality', 'color', 'size'] as const;

/** Contenu d'un emplacement regroupé par article, chaque article listant ses variantes. */
type ArticleContent = {
  articleId: string;
  name: string;
  quantity: number;
  /** label : « 101 », « CL-5 », « Noir · 20cm »… ('' si la ligne ne porte aucune variante). */
  lines: { label: string; quantity: number }[];
};

/** Nom d'un article d'arrivage connu ('' s'il n'en porte aucun), undefined pour un article inconnu. */
type ArticleNameOf = (articleId: string) => string | undefined;

function groupContentsByArticle(lines: LocationContentLine[], articleNameOf?: ArticleNameOf): ArticleContent[] {
  const byArticle = new Map<string, LocationContentLine[]>();
  for (const l of lines) {
    const list = byArticle.get(l.articleId) || [];
    list.push(l);
    byArticle.set(l.articleId, list);
  }
  return Array.from(byArticle, ([articleId, list]) => {
    // Les lignes d'une qualité portent chacune leur propre nom (« Satin CL-5 », « Satin CL-7 ») :
    // l'article est nommé par leur début commun, pour ne pas le baptiser d'après une seule qualité.
    const names = list.map(l => String(l.productName || '').trim()).filter(Boolean);
    const words = names[0]?.split(/\s+/) || [];
    let common = words.length;
    for (const n of names.slice(1)) {
      const w = n.split(/\s+/);
      let i = 0;
      while (i < common && i < w.length && w[i].toLowerCase() === words[i].toLowerCase()) i++;
      common = i;
    }
    // Aucun début commun (« Doublure satin » / « Crêpe georgette ») : c'est le nom de l'article qui
    // parle pour toutes ses qualités. Le nom d'une seule ligne ne sert que pour un article inconnu.
    const name = words.slice(0, common).join(' ') || articleNameOf?.(articleId) || names[0] || articleId;
    const quantity = Math.round(list.reduce((s, l) => s + l.quantity, 0) * 1000) / 1000;

    // Plusieurs variantes : on ne garde que les champs qui les distinguent (la couleur), pas
    // ceux qu'elles partagent toutes (la taille « 5000Y » de l'article) — « 101 », pas
    // « 101 · 5000Y » répété trente fois. Une seule ligne garde tout ce qui la décrit.
    const shown = (v: unknown) => Boolean(v) && !isVarious(v);
    const fields = VARIANT_FIELDS.filter(f =>
      list.length === 1 || new Set(list.map(l => (shown(l[f]) ? normalizeVariantValue(l[f]) : ''))).size > 1);
    const variantLines = list
      .map(l => ({ label: fields.map(f => l[f]).filter(shown).join(' · '), quantity: l.quantity }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }));
    return { articleId, name, quantity, lines: variantLines };
  });
}

/** Info-bulle native d'une case : court, au-delà d'une douzaine de lignes on résume. */
function contentsTooltip(code: string, groups: ArticleContent[]): string {
  const MAX_LINES = 12;
  const out: string[] = [code];
  let count = 0;
  let hidden = 0;
  for (const g of groups) {
    const variants = g.lines.map(l => ({ label: l.label, qty: l.quantity })).filter(v => v.label);
    const MAX_VARIANTS = 6;
    const text = variants.length > 0
      ? `${g.name} — ${variants.slice(0, MAX_VARIANTS).map(v => `${v.label} : ${v.qty.toLocaleString('fr-FR')}`).join(', ')}` +
        (variants.length > MAX_VARIANTS ? ` +${variants.length - MAX_VARIANTS}` : '')
      : `${g.name} — ${g.quantity.toLocaleString('fr-FR')}`;
    if (count < MAX_LINES) out.push(text);
    else hidden++;
    count++;
  }
  if (hidden > 0) out.push(`… et ${hidden} autre(s) référence(s)`);
  return out.join('\n');
}

/** Solde d'un code dans le lieu affiché, et ce que d'autres lieux ont rattaché au même code. */
type PlaceBalance = { net: number; elsewhere: number };

/**
 * Contenu et solde des emplacements d'UN lieu. Un code n'est unique que dans son entrepôt : deux
 * entrepôts peuvent avoir chacun un « A-01-01 ». Le solde du lieu (`net`) et la part des autres
 * lieux (`elsewhere`) sont sommés dans la même boucle et arrondis de la même façon, pour qu'un
 * code utilisé par un seul lieu n'affiche jamais un reliquat « ailleurs » dû aux arrondis.
 * Sans lieu (storeId vide), tout compte pour le lieu, comme computeLocationContents sans storeId.
 */
function computePlaceLocations(
  locations: StorageLocation[],
  movementsByCode: Record<string, any[]>,
  storeId: string,
  dimensionOf?: (articleId: string) => VariantDimension | null | undefined,
  articleNameOf?: ArticleNameOf,
  lieux: { id: string; type?: string }[] = [],
): { contentsByCode: Record<string, ArticleContent[]>; balanceByCode: Record<string, PlaceBalance> } {
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const contentsByCode: Record<string, ArticleContent[]> = {};
  const balanceByCode: Record<string, PlaceBalance> = {};
  for (const loc of locations) {
    const movs = movementsByCode[loc.code];
    if (!movs) continue;
    let net = 0;
    let elsewhere = 0;
    for (const m of movs) {
      const qty = Number(m.quantity) || 0;
      const signed = m.type === 'OUT' ? -qty : qty;
      // Un transfert entrant est crédité sur toStoreId, tous les autres sur storeId.
      const place = m.type === 'IN' && m.reason === 'TRANSFERT' ? (m.toStoreId || m.storeId) : m.storeId;
      // Un entrepot, c'est le magasin principal : la marchandise entre sous le nom de l'entrepot
      // et en sort sous celui de CHRIFA. Compares tels quels, les sorties passaient en
      // « ailleurs » et l'emplacement affichait eternellement son solde d'arrivage.
      if (!storeId || lieuDeMouvement(place, lieux) === lieuDeMouvement(storeId, lieux)) net += signed;
      else elsewhere += signed;
    }
    balanceByCode[loc.code] = { net: round3(net), elsewhere: round3(elsewhere) };
    const groups = groupContentsByArticle(
      computeLocationContents(movs, loc.code, storeId || undefined, dimensionOf, lieux), articleNameOf);
    if (groups.length > 0) contentsByCode[loc.code] = groups;
  }
  return { contentsByCode, balanceByCode };
}

export default function WarehouseLocationsView({
  stores, locations, movements, articles, adminUid, readOnly,
}: WarehouseLocationsViewProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [activeStoreId, setActiveStoreId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [enEdition, setEnEdition] = useState<{ id?: string; code: string; label: string; ancienCode?: string }>(
    { code: '', label: '' });

  // ── Le lieu affiché ────────────────────────────────────────────────────────
  const sortedStores = useMemo(
    () => [...(stores || [])].sort((a, b) => {
      // Les entrepôts d'abord : c'est là qu'on range.
      if (a.type !== b.type) return a.type === 'WAREHOUSE' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [stores]
  );

  const currentStoreId = activeStoreId || sortedStores[0]?.id || '';
  const currentStore = sortedStores.find(s => s.id === currentStoreId);

  const storeLocations = useMemo(
    () => (locations || [])
      .filter(l => l.storeId === currentStoreId)
      .sort((a, b) => compareLocationCodes(a.code, b.code)),
    [locations, currentStoreId]
  );

  const movementsByCode = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const m of movements || []) {
      if (!m?.locationCode) continue;
      (map[m.locationCode] ||= []).push(m);
    }
    return map;
  }, [movements]);

  const dimensionOf = useMemo(() => {
    const parId = new Map((articles || []).map((a: any) => [String(a.id), a]));
    return (articleId: string) => {
      const a = parId.get(String(articleId));
      return a ? articleVariantDimension(a) : null;
    };
  }, [articles]);

  const articleNameOf = useMemo(() => {
    const parId = new Map((articles || []).map((a: any) => [String(a.id), a]));
    return (articleId: string) => {
      const a = parId.get(String(articleId));
      return a ? String(a.nameFR || a.name || '').trim() || undefined : undefined;
    };
  }, [articles]);

  const { contentsByCode, balanceByCode } = useMemo(
    () => computePlaceLocations(storeLocations, movementsByCode, currentStoreId, dimensionOf, articleNameOf, stores || []),
    [storeLocations, movementsByCode, currentStoreId, dimensionOf, articleNameOf]
  );

  const nombreDEmplacements = storeLocations.length;

  // ── Enregistrer ────────────────────────────────────────────────────────────
  /**
   * Crée ou renomme un emplacement.
   *
   * Renommer touche AUSSI les mouvements. Le rattachement du stock à son emplacement se fait par
   * le code, écrit en dur sur chaque mouvement : changer le nom sans les suivre rendait orphelin
   * tout ce qui y était rangé — l'emplacement se retrouvait vide et la marchandise nulle part.
   */
  const enregistrer = async () => {
    if (!firestore || !adminUid || readOnly) return;
    const code = normalizeSegment(enEdition.code);
    if (!code) {
      toast({ variant: 'destructive', title: 'Nom manquant', description: "Donnez un nom à l'emplacement." });
      return;
    }
    const doublon = storeLocations.find(l => l.code === code && l.id !== enEdition.id);
    if (doublon) {
      toast({ variant: 'destructive', title: 'Nom déjà pris', description: `« ${code} » existe déjà dans ce lieu.` });
      return;
    }

    setBusy(true);
    try {
      const col = collection(firestore, 'users', adminUid, 'storageLocations');
      const ancien = enEdition.ancienCode;

      if (enEdition.id) {
        await updateDoc(doc(col, enEdition.id), {
          code,
          label: enEdition.label.trim() || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(col, {
          storeId: currentStoreId,
          code,
          label: enEdition.label.trim() || null,
          active: true,
          createdAt: serverTimestamp(),
        });
      }

      // Les mouvements suivent le nouveau nom. Un code n'est unique que dans son lieu : on ne
      // touche qu'aux mouvements de CE lieu, entrepôt compris (un entrepôt et son magasin
      // principal partagent leur comptabilité, cf. src/lib/stock-disponible.ts).
      let mouvementsRenommes = 0;
      if (ancien && ancien !== code) {
        const concernes = (movements || []).filter((m: any) => {
          if (m?.locationCode !== ancien) return false;
          const place = m.type === 'IN' && m.reason === 'TRANSFERT' ? (m.toStoreId || m.storeId) : m.storeId;
          return lieuDeMouvement(place, stores || []) === lieuDeMouvement(currentStoreId, stores || []);
        });
        const movsCol = collection(firestore, 'users', adminUid, 'stockMovements');
        for (let i = 0; i < concernes.length; i += 450) {
          const batch = writeBatch(firestore);
          for (const m of concernes.slice(i, i + 450)) {
            batch.update(doc(movsCol, m.id), { locationCode: code });
          }
          await batch.commit();
        }
        mouvementsRenommes = concernes.length;
      }

      toast({
        title: enEdition.id ? 'Emplacement renommé' : 'Emplacement ajouté',
        description: mouvementsRenommes > 0
          ? `${mouvementsRenommes} mouvement(s) suivent le nouveau nom : rien n'est perdu.`
          : undefined,
      });
      setFormOpen(false);
      setEnEdition({ code: '', label: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (loc: StorageLocation) => {
    if (!firestore || !adminUid || readOnly) return;
    const solde = balanceByCode[loc.code]?.net || 0;
    if (solde > 0) {
      toast({
        variant: 'destructive',
        title: 'Emplacement occupé',
        description: `« ${loc.code} » contient encore ${solde.toLocaleString('fr-FR')} unité(s). `
          + 'Videz-le — ou déplacez la marchandise — avant de le supprimer.',
      });
      return;
    }
    const ok = await confirm({
      title: `Supprimer « ${loc.code} » ?`,
      description: "L'historique des mouvements qui le citent reste intact ; c'est seulement "
        + "l'emplacement qui disparaît de la liste.",
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteDoc(doc(firestore, 'users', adminUid, 'storageLocations', loc.id));
      toast({ title: 'Emplacement supprimé' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  // ── Écran ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-stone-900 uppercase tracking-tight">Emplacements</h2>
          <p className="text-[12px] font-medium text-stone-500 mt-1 max-w-2xl leading-snug">
            Un emplacement, c'est un nom : « RÉSERVE », « ÉTAGE », « DÉPÔT 2 ». Deux ou trois par
            lieu suffisent — c'est ce qui permet de dire où est rangée une référence sans y passer
            la journée. À l'entrée en stock, on choisit lequel.
          </p>
        </div>
        {!readOnly && (
          <Button
            onClick={() => { setEnEdition({ code: '', label: '' }); setFormOpen(true); }}
            disabled={!currentStoreId}
            className="h-11 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-[11px] tracking-widest gap-2"
          >
            <Plus className="w-4 h-4" /> Ajouter un emplacement
          </Button>
        )}
      </div>

      {/* Le lieu */}
      <div className="flex gap-2 flex-wrap">
        {sortedStores.map(s => {
          const actif = s.id === currentStoreId;
          const combien = (locations || []).filter(l => l.storeId === s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStoreId(s.id)}
              className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                actif ? 'bg-stone-900 text-white shadow-lg' : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-300'
              }`}
            >
              {s.type === 'WAREHOUSE' ? <Warehouse className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              {s.name}
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${actif ? 'bg-white/15' : 'bg-stone-100 text-stone-500'}`}>
                {combien}
              </span>
            </button>
          );
        })}
      </div>

      {/* La liste */}
      {nombreDEmplacements === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-stone-200 rounded-[2rem] bg-white/60">
          <MapPin className="w-10 h-10 text-stone-200 mx-auto mb-4" />
          <p className="text-stone-400 font-black uppercase tracking-[0.2em] text-[10px]">
            Aucun emplacement dans {currentStore?.name || 'ce lieu'}
          </p>
          <p className="text-stone-400 text-xs mt-2 max-w-md mx-auto leading-snug">
            Sans emplacement, la marchandise entre en stock sans adresse — elle reste comptée, mais
            personne ne sait où elle est posée. Deux ou trois noms suffisent.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {storeLocations.map(loc => {
            const contenu = contentsByCode[loc.code] || [];
            const solde = balanceByCode[loc.code]?.net || 0;
            const ailleurs = balanceByCode[loc.code]?.elsewhere || 0;
            return (
              <div key={loc.id} className="bg-white rounded-[1.5rem] border border-stone-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-stone-50 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-stone-900 uppercase tracking-tight truncate">{loc.code}</h3>
                    {loc.label && <p className="text-[11px] font-bold text-stone-400 truncate mt-0.5">{loc.label}</p>}
                  </div>
                  <span className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-lg ${
                    solde > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}>
                    {solde > 0 ? solde.toLocaleString('fr-FR') : 'vide'}
                  </span>
                </div>

                <div className="flex-1 p-4 space-y-1.5">
                  {contenu.length === 0 ? (
                    <p className="text-[11px] font-medium text-stone-400">Rien de rangé ici pour le moment.</p>
                  ) : (
                    <>
                      {contenu.slice(0, 6).map(g => (
                        <div key={g.articleId} className="flex items-baseline justify-between gap-3">
                          <span className="text-[11px] font-bold text-stone-700 truncate">{g.name}</span>
                          <span className="text-[11px] font-black text-stone-900 shrink-0 tabular-nums">
                            {g.quantity.toLocaleString('fr-FR')}
                          </span>
                        </div>
                      ))}
                      {contenu.length > 6 && (
                        <p className="text-[10px] font-bold text-stone-400 pt-1">
                          … et {contenu.length - 6} autre(s) référence(s)
                        </p>
                      )}
                    </>
                  )}
                  {ailleurs !== 0 && (
                    <p className="text-[10px] font-bold text-amber-600 pt-1">
                      {ailleurs.toLocaleString('fr-FR')} unité(s) portent ce nom dans un autre lieu.
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <div className="p-3 border-t border-stone-50 flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { setEnEdition({ id: loc.id, code: loc.code, label: loc.label || '', ancienCode: loc.code }); setFormOpen(true); }}
                      className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest border-stone-200"
                    >
                      Renommer
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => supprimer(loc)}
                      title="Supprimer cet emplacement"
                      className="h-9 w-9 p-0 rounded-xl text-stone-300 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ajouter / renommer */}
      <Dialog open={formOpen} onOpenChange={o => !o && setFormOpen(false)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight">
              {enEdition.id ? 'Renommer l\'emplacement' : 'Nouvel emplacement'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="emplacement-nom" className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                Nom <span className="text-rose-500">•</span>
              </label>
              <Input
                id="emplacement-nom"
                value={enEdition.code}
                onChange={e => setEnEdition(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="RÉSERVE"
                autoFocus
                className="mt-1 h-11 rounded-xl font-black uppercase"
              />
              <p className="text-[11px] font-medium text-stone-400 mt-1.5 leading-snug">
                Court et parlant : c'est ce que le magasinier lira sur le bon de réception.
              </p>
            </div>

            <div>
              <label htmlFor="emplacement-note" className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                Précision (facultatif)
              </label>
              <Input
                id="emplacement-note"
                value={enEdition.label}
                onChange={e => setEnEdition(p => ({ ...p, label: e.target.value }))}
                placeholder="Au fond à gauche, étagères hautes"
                className="mt-1 h-11 rounded-xl font-bold"
              />
            </div>

            {enEdition.id && enEdition.ancienCode !== normalizeSegment(enEdition.code) && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <p className="text-[11px] font-bold text-amber-900 leading-snug">
                  Tout ce qui est rangé sous « {enEdition.ancienCode} » suivra le nouveau nom. Rien
                  n'est perdu, rien ne devient orphelin.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} className="font-black uppercase text-[10px] rounded-xl">
              Annuler
            </Button>
            <Button
              onClick={enregistrer}
              disabled={busy || !enEdition.code.trim()}
              className="bg-stone-900 hover:bg-stone-800 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
