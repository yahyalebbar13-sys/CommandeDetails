"use client";

import React, { useState, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, History, Search, X, EyeOff, Minus, Plus, Equal, Flag, Layers, Warehouse } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ProductPicker } from './stock-movement-modal';
import {
  SectionFormulaire, Champ, Encadre, LigneResume, Recapitulatif, BoutonValider, CLASSE_CHAMP,
} from './ui-formulaire';
import type { StockItem, StockMovement, Store, TransferOrder } from '@/lib/types';
import { MAGASIN_PRINCIPAL } from '@/lib/stock-disponible';
import { suggestInboundLocation, stockItemVariant } from '@/lib/warehouse-locations';
import { transfertsAReceptionner, numeroBonTransfert } from '@/lib/transferts';
import { lignesDeReserve, magasinDesEtageres, LIBELLE_ETAGERES, LIBELLE_RESERVE } from '@/lib/etageres';
import ComptageEtageres, { type CompteEtagere } from './comptage-etageres';

interface CountedLine {
  articleId: string;
  realArticleId: string;
  productName: string;
  color?: string;
  size?: string;
  quality?: string;
  categoryId: string;
  unitOfMeasure: string;
  theoretical: number;
  counted: number;
  /** Comptage des étagères de CHRIFA (sans couleur, en unité de vente), pas de la réserve. */
  etagere?: boolean;
  /** Première installation sur les étagères : la réserve de ce produit est à recompter. */
  reserveARecompter?: boolean;
}

interface BlindInventoryProps {
  /**
   * Les lignes de stock de la vue active. Au magasin principal, elles comprennent les lignes
   * « Étagères » (src/lib/etageres.ts) : le mode Réserve les écarte, le mode Étagères ne compte
   * qu'elles.
   */
  stockItems: StockItem[];
  categories: any[];
  generalCategories: any[];
  activeStore: string;
  stores: Store[];
  /** Mouvements, pour rattacher l'ajustement à l'emplacement où le produit se trouve. */
  movements?: any[];
  /** Rend false quand l'écriture a échoué (message déjà affiché). */
  onAddMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<boolean | void>;
  onFinalizeSession?: (storeId: string, itemCount: number, varianceCount: number) => Promise<void>;
  adminUid: string | null;
  /**
   * Les bons de transfert : de la marchandise « en route » vers ce lieu n'est pas encore dans son
   * stock. Comptée avant la réception, l'inventaire écrirait +N, puis la réception +N encore.
   */
  transferOrders?: TransferOrder[];
}

export default function BlindInventory({
  stockItems, categories, generalCategories, activeStore, stores, movements = [],
  onAddMovement, onFinalizeSession, transferOrders = [],
}: BlindInventoryProps) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [countedValue, setCountedValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [session, setSession] = useState<CountedLine[]>([]);

  const currentStore = stores.find(s => s.id === activeStore);
  const isRealStore = activeStore !== 'ALL' && activeStore !== 'ALL_MAIN';

  // ── Deux comptages au magasin principal (src/lib/etageres.ts) ──
  // La RÉSERVE (le magasin et ses entrepôts, couleur par couleur, dans l'unité de la réserve) et
  // les ÉTAGÈRES (le détail, sans couleur, en unité de vente). Seul le magasin principal a des
  // étagères. Les deux ne se comptent jamais ensemble : sacs et pièces ne s'additionnent pas.
  const magasinEtageres = magasinDesEtageres(stores);
  const etageresPossibles = isRealStore && activeStore === magasinEtageres;
  const [modeChoisi, setModeChoisi] = useState<'reserve' | 'etageres'>('reserve');
  const mode: 'reserve' | 'etageres' = etageresPossibles ? modeChoisi : 'reserve';
  const lignesReserve = useMemo(() => lignesDeReserve(stockItems), [stockItems]);
  /** La case « je ne l'ai pas comptée » pour le produit choisi, quand il est dans un transfert en route. */
  const [horsTransfertConfirme, setHorsTransfertConfirme] = useState(false);

  /**
   * Les transferts en route vers CE lieu, pas encore réceptionnés. Leur marchandise peut déjà être
   * physiquement là : comptée maintenant, elle entrerait deux fois — par l'inventaire, puis par la
   * réception. Les ANCIENS bons en attente (d'avant le 15/09) sont écartés, comme du badge : leur
   * marchandise est arrivée et a été recomptée depuis longtemps ; pousser à les réceptionner ici la
   * ferait entrer une seconde fois. L'administrateur les clôt depuis l'écran Transferts.
   */
  const transfertsEnAttente = useMemo(
    () => isRealStore ? transfertsAReceptionner(transferOrders, activeStore, { avecAnciens: false }) : [],
    [transferOrders, activeStore, isRealStore]
  );
  /** Les bons en route qui contiennent la variante choisie. */
  const bonsDuProduit = (item: StockItem | null) => {
    if (!item) return [];
    const realId = (item as any)._realArticleId || item.articleId;
    const norm = (v: any) => String(v ?? '').trim().toLowerCase();
    return transfertsEnAttente.filter(b => (b.items || []).some(l =>
      (l.articleId === item.articleId)
      || ((l.realArticleId || l.articleId) === realId
        && norm(l.color) === norm(item.color) && norm(l.size) === norm(item.size) && norm(l.quality) === norm(item.quality))));
  };
  const bonsSelection = bonsDuProduit(selected);
  const raisonTransfertEnRoute = bonsSelection.length > 0 && !horsTransfertConfirme
    ? 'Ce produit est dans un transfert en route vers ce lieu : réceptionnez d\'abord le transfert, ou cochez la case ci-dessus si sa marchandise n\'a pas été comptée.'
    : null;

  /**
   * Le stock que le logiciel croit avoir dans CE lieu.
   *
   * Le magasin principal est un cas a part : c'est lui PLUS ses entrepots
   * (src/lib/stock-disponible.ts). Sa ligne brute est structurellement negative — une vente
   * puisee en entrepot s'ecrit sous son nom sans debiter l'entrepot. Comparer un comptage a ce
   * nombre-la donnait un ecart egal a tout ce qui avait ete vendu depuis les entrepots, et
   * l'inventaire ecrivait un ajustement qui RESSUSCITAIT cette marchandise. Chaque comptage
   * regonflait le stock. On prend donc le meme perimetre que la caisse et les transferts :
   * currentQty, deja calcule par computeStockItems pour la vue active.
   */
  const theoreticalQty = (item: StockItem): number => {
    if (!isRealStore) return item.currentQty;
    if (activeStore === MAGASIN_PRINCIPAL) return item.currentQty;
    return item.qtyByStore ? ((item.qtyByStore as any)[activeStore] || 0) : 0;
  };

  // Le comptage porte sur ce qui est physiquement dans CE magasin. Le sélecteur de produits, lui,
  // affichait currentQty : pour CHRIFA il additionne les entrepôts. Le magasinier voyait 700,
  // comptait 700, et la fiche annonçait un théorique de 400 : l'écran écrivait un ajustement de
  // +300 qui créait de la marchandise. Les deux regardent désormais le même nombre.
  // Les lignes Étagères n'y figurent jamais : elles ont leur propre comptage (mode « Étagères »).
  const stockDuPerimetre = useMemo(
    () => lignesReserve.map(i => ({ ...i, currentQty: theoreticalQty(i) })),
    [lignesReserve, activeStore, isRealStore]
  );

  const handlePick = (articleId: string) => {
    const item = stockDuPerimetre.find(i => i.articleId === articleId);
    if (!item) return;
    setSelected(item);
    setHorsTransfertConfirme(false);
    setCountedValue('');
    setPicking(false);
  };

  const ecart = useMemo(() => {
    if (!selected || countedValue === '') return null;
    return (Number(countedValue) || 0) - theoreticalQty(selected);
  }, [selected, countedValue, activeStore]);

  const handleConfirmCount = async () => {
    if (!selected || countedValue === '' || saving) return;
    // La touche Entrée passe à côté du bouton grisé : même garde ici.
    if (raisonTransfertEnRoute) return;
    const theoretical = theoreticalQty(selected);
    const counted = Number(countedValue) || 0;
    const diff = counted - theoretical;

    setSaving(true);
    try {
      if (diff !== 0) {
        const invStore = isRealStore ? (activeStore as any) : (currentStore?.id as any) || 'CHRIFA';
        const realId = (selected as any)._realArticleId || selected.articleId;
        // Un comptage porte sur le magasin entier : on ne rattache l'écart à un emplacement
        // que si le produit n'est rangé qu'à un seul endroit — sinon on ne devine pas. Pour un
        // article éclaté, on compte une variante : seuls les racks de cette variante comptent.
        const spot = suggestInboundLocation(movements, invStore, realId, stockItemVariant(selected));
        // Écriture refusée : le comptage n'est pas noté fait (la saisie reste pour recommencer).
        const ok = await onAddMovement({
          articleId: (selected as any)._realArticleId || selected.articleId,
          categoryId: selected.categoryId,
          productName: selected.nameFR || selected.productName,
          nameFR: selected.nameFR,
          color: selected.color,
          size: selected.size,
          quality: selected.quality,
          unitOfMeasure: selected.unitOfMeasure || 'unité',
          type: 'ADJUSTMENT',
          reason: 'INVENTAIRE',
          storeId: invStore,
          ...(spot ? { locationCode: spot.locationCode, locationId: spot.locationId } : {}),
          quantity: diff,
          date: new Date().toISOString().split('T')[0],
          notes: `Inventaire physique : théorique ${theoretical}, compté ${counted}`,
        });
        if (ok === false) return;
      }
      setSession(prev => [{
        articleId: selected.articleId,
        realArticleId: (selected as any)._realArticleId || selected.articleId,
        productName: selected.nameFR || selected.productName,
        color: selected.color,
        size: selected.size,
        quality: selected.quality,
        categoryId: selected.categoryId,
        unitOfMeasure: selected.unitOfMeasure || 'unité',
        theoretical,
        counted,
      }, ...prev]);
      setSelected(null);
      setCountedValue('');
    } finally {
      setSaving(false);
    }
  };

  /** Un comptage des étagères validé : il rejoint la liste de la session, marqué « Étagères ». */
  const handleCompteEtagere = (l: CompteEtagere) => {
    setSession(prev => [{
      articleId: l.cle,
      realArticleId: l.cle,
      productName: l.productName,
      size: l.size,
      quality: l.quality,
      categoryId: '',
      unitOfMeasure: l.unite,
      theoretical: l.theorique,
      counted: l.compte,
      etagere: true,
      ...(l.reserveARecompter ? { reserveARecompter: true } : {}),
    }, ...prev]);
  };

  /** Passer de la réserve aux étagères (ou l'inverse) : le produit en cours est relâché. */
  const changerDeMode = (m: 'reserve' | 'etageres') => {
    setModeChoisi(m);
    setSelected(null);
    setPicking(false);
    setCountedValue('');
    setHorsTransfertConfirme(false);
  };

  const ecartArrondi = (l: CountedLine) => Math.round((l.counted - l.theoretical) * 1000) / 1000;
  const varianceCount = session.filter(l => ecartArrondi(l) !== 0).length;

  const handleFinalize = async () => {
    if (!onFinalizeSession || !isRealStore || session.length === 0 || finalizing) return;
    setFinalizing(true);
    try {
      await onFinalizeSession(activeStore, session.length, varianceCount);
      setSession([]);
    } finally {
      setFinalizing(false);
    }
  };

  // Libellés d'affichage seulement — aucun calcul métier ici.
  const nomDuLieu = currentStore?.name || 'ce lieu';
  const unite = selected?.unitOfMeasure || 'unité';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-32">
      {/* Bandeau */}
      <div className="bg-gradient-to-br from-amber-900 to-amber-700 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-400/10 rounded-full translate-y-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ClipboardCheck className="w-6 h-6 text-amber-300" />
              <p className="text-[11px] font-black text-amber-300 uppercase tracking-[0.3em]">Inventaire physique</p>
            </div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              {mode === 'etageres' ? 'Comptage des étagères' : "Comptage à l'aveugle"}
            </h1>
            <p className="text-[13px] font-bold text-amber-100/90 leading-snug mt-2 max-w-xl">
              {isRealStore
                ? <>Lieu compté : <span className="text-white">{nomDuLieu}</span>{etageresPossibles
                    ? <> · <span className="text-white">{mode === 'etageres' ? LIBELLE_ETAGERES : `${LIBELLE_RESERVE}, hors étagères`}</span></>
                    : null}. </>
                : <>Aucun lieu choisi pour l'instant. </>}
              Un produit à la fois : vous saisissez ce que vous avez sous la main, et le logiciel ne
              montre son chiffre qu'après.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-3xl font-black text-white tabular-nums">{session.length}</p>
              <p className="text-[11px] font-bold text-amber-200 mt-1">Produits comptés</p>
            </div>
            {varianceCount > 0 && (
              <div className="text-right border-l border-amber-500/30 pl-4">
                <p className="text-3xl font-black text-orange-200 tabular-nums">{varianceCount}</p>
                <p className="text-[11px] font-bold text-amber-200 mt-1">Écarts corrigés</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {etageresPossibles && (
        <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-4">
          <p className="text-[11px] font-black text-stone-500 uppercase tracking-wider mb-2.5">Que comptez-vous ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => changerDeMode('reserve')}
              aria-pressed={mode === 'reserve'}
              className={`text-left rounded-2xl border p-3.5 transition-colors ${
                mode === 'reserve' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-black text-stone-900">
                <Warehouse className="w-4 h-4 text-amber-700" /> {LIBELLE_RESERVE}
              </span>
              <span className="block text-[11px] font-medium text-stone-500 leading-snug mt-1">
                Couleur par couleur, dans l'unité de la réserve (sacs, rouleaux, pièces…). Hors étagères.
              </span>
            </button>
            <button
              type="button"
              onClick={() => changerDeMode('etageres')}
              aria-pressed={mode === 'etageres'}
              className={`text-left rounded-2xl border p-3.5 transition-colors ${
                mode === 'etageres' ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200' : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-black text-stone-900">
                <Layers className="w-4 h-4 text-teal-700" /> {LIBELLE_ETAGERES}
              </span>
              <span className="block text-[11px] font-medium text-stone-500 leading-snug mt-1">
                Un chiffre par produit, toutes couleurs ensemble, à l'unité de vente (pièce ou mètre).
              </span>
            </button>
          </div>
        </div>
      )}

      {mode === 'reserve' && transfertsEnAttente.length > 0 && (
        <Encadre ton="attention" titre={`${transfertsEnAttente.length} transfert${transfertsEnAttente.length > 1 ? 's' : ''} en route vers ${nomDuLieu}, pas encore réceptionné${transfertsEnAttente.length > 1 ? 's' : ''}`}>
          Leur marchandise n'est pas encore dans le stock de ce lieu. Si elle est déjà arrivée, réceptionnez
          d'abord {transfertsEnAttente.length > 1 ? 'ces transferts' : 'ce transfert'} (écran Transferts) avant de compter :
          sinon elle entrerait deux fois, par l'inventaire puis par la réception. Bons concernés :{' '}
          <span className="font-black">{transfertsEnAttente.map(b => numeroBonTransfert(b.id)).join(', ')}</span>.
        </Encadre>
      )}

      {!isRealStore && (
        <Encadre ton="attention" titre="Choisissez d'abord un lieu précis">
          En « Vue globale », les quantités de plusieurs lieux sont additionnées : un comptage fait
          là-dessus corrigerait le stock d'un lieu avec les cartons d'un autre. Choisissez en haut de
          l'écran la boutique ou la réserve que vous avez réellement sous les yeux.
        </Encadre>
      )}

      <Encadre ton="astuce" titre="Pourquoi le stock n'apparaît pas avant votre chiffre">
        Quand le chiffre du logiciel s'affiche d'abord, on ne compte plus : on recopie. Il reste donc
        masqué jusqu'à votre saisie, et l'écran ne compare qu'ensuite.{' '}
        {mode === 'etageres' ? (
          <>
            Comptez seulement ce qui est <span className="font-black">sur les étagères</span> de{' '}
            {nomDuLieu}, toutes couleurs ensemble, à l'unité de vente. Les cartons et rouleaux de la
            réserve ne se comptent pas ici : ils ont leur propre comptage (mode « Réserve »).
          </>
        ) : activeStore === MAGASIN_PRINCIPAL || etageresPossibles ? (
          <>
            Comptez ce qui est présent dans <span className="font-black">{nomDuLieu}</span>{' '}
            <span className="font-black">ET dans ses entrepôts</span> : ici les deux ne font qu'un
            seul stock, et ne compter que le magasin effacerait les entrepôts.{' '}
            <span className="font-black">Hors étagères</span> : ce qui est en rayon pour le détail
            se compte à part, dans le mode « Étagères ».
          </>
        ) : (
          <>
            Comptez seulement ce qui est physiquement présent dans{' '}
            <span className="font-black">{nomDuLieu}</span> — ce qui dort dans une autre boutique se
            compte dans sa propre session, ce lieu sélectionné en haut de l'écran.
          </>
        )}{' '}
        {mode === 'etageres'
          ? 'La qualité et la taille, elles, restent séparées : chacune a sa propre ligne.'
          : 'Un produit décliné en qualités, couleurs ou tailles se compte variante par variante : chacune a son stock à elle.'}
      </Encadre>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne de gauche : comptage */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-5 space-y-6">
            {mode === 'etageres' ? (
              <ComptageEtageres
                stockItems={stockItems}
                categories={categories}
                generalCategories={generalCategories}
                magasin={magasinEtageres}
                nomDuLieu={nomDuLieu}
                onAddMovement={onAddMovement}
                onCompte={handleCompteEtagere}
              />
            ) : !selected ? (
              picking ? (
                <SectionFormulaire
                  numero={1}
                  titre="Quel produit comptez-vous ?"
                  aide="Descendez famille, puis sous-catégorie, puis produit. Pour un article décliné, choisissez la variante exacte que vous tenez en main."
                  action={
                    <button
                      type="button"
                      onClick={() => setPicking(false)}
                      title="Fermer la recherche"
                      className="text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  }
                >
                  <ProductPicker
                    // Comptage à l'aveugle : le sélecteur ne doit afficher aucune quantité, sinon
                    // le magasinier lit le chiffre du logiciel juste avant de saisir le sien.
                    masquerQuantites
                    stockItems={stockDuPerimetre}
                    categories={categories}
                    generalCategories={generalCategories}
                    formType="ADJUSTMENT"
                    onSelect={handlePick}
                  />
                </SectionFormulaire>
              ) : (
                <SectionFormulaire
                  numero={1}
                  titre="Quel produit comptez-vous ?"
                  aide="Un produit à la fois, celui que vous avez devant vous. Vous reviendrez ici après chaque comptage."
                >
                  <BoutonValider
                    onClick={() => setPicking(true)}
                    raisonDesactive={
                      !isRealStore
                        ? "Choisissez d'abord une boutique ou une réserve en haut de l'écran."
                        : null
                    }
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <Search className="w-4 h-4" /> Rechercher un produit à compter
                    </span>
                  </BoutonValider>
                </SectionFormulaire>
              )
            ) : (
              <>
                <SectionFormulaire
                  numero={1}
                  titre="Produit compté"
                  aide="Vérifiez la qualité, la couleur et la taille : une variante voisine a son propre stock."
                  action={
                    <button
                      type="button"
                      onClick={() => { setSelected(null); setCountedValue(''); }}
                      title="Changer de produit"
                      className="text-[11px] font-bold text-stone-400 hover:text-stone-700 inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Changer
                    </button>
                  }
                >
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                    {etageresPossibles && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">
                        {LIBELLE_RESERVE} · hors étagères
                      </p>
                    )}
                    <p className="text-sm font-black text-stone-900 leading-tight">
                      {selected.nameFR || selected.productName}
                    </p>
                    <p className="text-[11px] font-bold text-stone-500 mt-1">
                      {[selected.quality, selected.color, selected.size].filter(Boolean).join(' · ') || selected.categoryId}
                    </p>
                  </div>
                </SectionFormulaire>

                <SectionFormulaire
                  numero={2}
                  titre="Combien en avez-vous compté ?"
                  aide="Le chiffre du comptage réel, pas une estimation : c'est lui qui décidera de la correction."
                >
                  <Champ
                    label="Quantité comptée sur place"
                    obligatoire
                    htmlFor="inventaire-quantite-comptee"
                    indice={unite}
                    aide={`Tout ce qui est présent dans ${nomDuLieu}${etageresPossibles ? ' et ses entrepôts, hors étagères,' : ''} pour cette variante, y compris les rouleaux entamés et les cartons du fond. Recomptez avant de valider : c'est ce chiffre qui fera foi.`}
                  >
                    <Input
                      id="inventaire-quantite-comptee"
                      type="number" min={0} step="any" autoFocus
                      value={countedValue}
                      onChange={e => setCountedValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleConfirmCount(); }}
                      className={`${CLASSE_CHAMP} text-xl md:text-xl font-black bg-white border-emerald-200`}
                      placeholder="0"
                    />
                  </Champ>

                  {ecart !== null && (
                    <div className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 border ${
                      ecart === 0 ? 'bg-emerald-50 border-emerald-200' : ecart > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
                    }`}>
                      <span className={`text-[13px] font-bold leading-tight flex items-center gap-2 ${
                        ecart === 0 ? 'text-emerald-800' : ecart > 0 ? 'text-blue-800' : 'text-red-800'
                      }`}>
                        {ecart === 0 ? <Equal className="w-4 h-4 shrink-0" /> : ecart > 0 ? <Plus className="w-4 h-4 shrink-0" /> : <Minus className="w-4 h-4 shrink-0" />}
                        {ecart === 0
                          ? 'Aucun écart : le stock était déjà juste'
                          : ecart > 0
                            ? 'Surplus : il y en a plus que ce que dit le logiciel'
                            : 'Manquant : il y en a moins que ce que dit le logiciel'}
                      </span>
                      <span className={`text-xl font-black tabular-nums shrink-0 ${
                        ecart === 0 ? 'text-emerald-800' : ecart > 0 ? 'text-blue-800' : 'text-red-800'
                      }`}>
                        {ecart > 0 ? '+' : ''}{ecart}
                      </span>
                    </div>
                  )}
                </SectionFormulaire>

                {bonsSelection.length > 0 && (
                  <Encadre ton="attention" titre="Ce produit est dans un transfert en route">
                    {bonsSelection.map(b => numeroBonTransfert(b.id)).join(', ')} en apporte vers {nomDuLieu}, sans être
                    encore réceptionné. S'il est arrivé, réceptionnez d'abord le transfert, puis comptez. S'il n'est pas
                    encore là, comptez sans lui et cochez la case.
                    <label className="mt-2 flex items-start gap-2 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={horsTransfertConfirme}
                        onChange={e => setHorsTransfertConfirme(e.target.checked)}
                      />
                      La marchandise de ce transfert n'est pas dans mon comptage.
                    </label>
                  </Encadre>
                )}

                <SectionFormulaire
                  numero={3}
                  titre="Relisez, puis enregistrez"
                  aide="Dernier moment où une erreur se corrige d'un clic, au lieu de se rattraper par un second inventaire."
                >
                  {ecart === null ? (
                    <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-3.5 flex items-start gap-2.5">
                      <EyeOff className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
                      <p className="text-[11px] font-medium text-stone-500 leading-snug">
                        Le stock du logiciel reste masqué tant que votre chiffre n'est pas saisi. Il
                        s'affichera ici, à côté du vôtre, avec l'écart entre les deux.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Recapitulatif titre="Avant d'enregistrer">
                        <LigneResume libelle="Lieu compté" valeur={nomDuLieu} />
                        <LigneResume libelle="Stock annoncé par le logiciel" valeur={`${theoreticalQty(selected)} ${unite}`} />
                        <LigneResume libelle="Compté sur place" valeur={`${Number(countedValue) || 0} ${unite}`} />
                        <LigneResume
                          fort
                          libelle="Écart"
                          ton={ecart === 0 ? 'positif' : 'alerte'}
                          valeur={ecart === 0 ? 'aucun' : `${ecart > 0 ? '+' : ''}${ecart} ${unite}`}
                        />
                      </Recapitulatif>

                      {ecart === 0 ? (
                        <Encadre ton="info">
                          Écart nul : <span className="font-black">aucun mouvement n'est écrit</span>.
                          Le comptage est seulement noté dans la liste de droite, comme preuve que ce
                          produit a bien été vérifié aujourd'hui.
                        </Encadre>
                      ) : (
                        <Encadre ton="attention">
                          Une correction de <span className="font-black">{ecart > 0 ? '+' : ''}{ecart} {unite}</span> va
                          être écrite sur {nomDuLieu}, au motif « Inventaire », datée du jour et
                          inscrite au journal sous votre nom. Le stock affiché partout ailleurs
                          change aussitôt : recomptez s'il reste le moindre doute.
                        </Encadre>
                      )}
                    </>
                  )}

                  <BoutonValider
                    onClick={handleConfirmCount}
                    enCours={saving}
                    libelleEnCours="Enregistrement…"
                    raisonDesactive={
                      countedValue === ''
                        ? 'Saisissez la quantité comptée à l\'étape 2 pour pouvoir valider.'
                        : raisonTransfertEnRoute
                    }
                    className="!bg-emerald-600 hover:!bg-emerald-700"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Valider ce comptage
                    </span>
                  </BoutonValider>
                </SectionFormulaire>
              </>
            )}
          </div>

          {session.length > 0 && isRealStore && (
            <div className="bg-white rounded-3xl shadow-lg border border-stone-100 p-5">
              <SectionFormulaire
                titre="Clôturer la session de comptage"
                aide="À faire une fois le tour du lieu terminé. Les corrections, elles, sont déjà enregistrées au fur et à mesure."
              >
                <Recapitulatif titre="Ce que la clôture retiendra">
                  <LigneResume libelle="Lieu" valeur={nomDuLieu} />
                  <LigneResume libelle="Produits comptés" valeur={session.length} />
                  <LigneResume libelle="Comptages sans écart" valeur={session.length - varianceCount} ton="positif" />
                  <LigneResume
                    fort
                    libelle="Écarts corrigés"
                    ton={varianceCount > 0 ? 'alerte' : 'positif'}
                    valeur={varianceCount}
                  />
                </Recapitulatif>

                <Encadre ton="info">
                  La clôture inscrit la date du dernier inventaire sur {nomDuLieu} et vide la liste de
                  droite. Les corrections déjà écrites restent en place : clôturer n'annule rien.
                </Encadre>

                <BoutonValider
                  onClick={handleFinalize}
                  enCours={finalizing}
                  libelleEnCours="Clôture…"
                  raisonDesactive={
                    !onFinalizeSession
                      ? "La clôture n'est pas disponible depuis cet écran."
                      : null
                  }
                  className="!bg-amber-600 hover:!bg-amber-700"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Flag className="w-4 h-4" /> Clôturer la session ({session.length} produit{session.length > 1 ? 's' : ''})
                  </span>
                </BoutonValider>
              </SectionFormulaire>
            </div>
          )}
        </div>

        {/* Colonne de droite : historique de session */}
        <div className="bg-white rounded-3xl shadow-lg border border-stone-100 overflow-hidden flex flex-col max-h-[700px]">
          <div className="p-5 border-b border-stone-100 bg-stone-50/50 flex items-start gap-2.5">
            <History className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-black text-stone-900 leading-tight">Comptages de cette session</h2>
              <p className="text-[11px] font-medium text-stone-500 leading-snug mt-0.5">
                Le plus récent en haut. Cette liste se vide à la clôture.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {session.length === 0 ? (
              <div className="text-center py-12 px-4">
                <CheckCircle2 className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-[13px] font-bold text-stone-500">Aucun produit compté</p>
                <p className="text-[11px] font-medium text-stone-400 leading-snug mt-1">
                  Chaque comptage validé vient s'inscrire ici, avec son écart.
                </p>
              </div>
            ) : (
              session.map((l, i) => {
                const diff = ecartArrondi(l);
                return (
                  <div key={i} className={`p-3 rounded-2xl border ${diff === 0 ? 'bg-stone-50 border-stone-100' : diff > 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-[13px] font-bold text-stone-900 leading-tight">
                      {l.productName}
                      {l.etagere && (
                        <span className="ml-1.5 align-middle text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded uppercase">Étagères</span>
                      )}
                    </p>
                    {(l.color || l.size || l.quality || l.etagere) && (
                      <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                        {[l.quality, l.color, l.size].filter(Boolean).join(' · ')}
                        {l.etagere ? `${l.quality || l.size ? ' · ' : ''}toutes couleurs` : ''}
                      </p>
                    )}
                    {l.reserveARecompter && (
                      <p className="text-[11px] font-bold text-amber-800 mt-1">
                        Réserve à recompter (mode Réserve, hors étagères) : sinon ces quantités comptent deux fois.
                      </p>
                    )}
                    <div className="flex justify-between items-center gap-3 mt-2 pt-2 border-t border-black/5">
                      <span className="text-[11px] font-medium text-stone-500 leading-snug">
                        Logiciel {l.theoretical} → compté {l.counted} {l.unitOfMeasure}
                      </span>
                      <span className={`text-[13px] font-black tabular-nums shrink-0 ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {diff === 0 ? 'Aucun écart' : (diff > 0 ? '+' : '') + diff}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
