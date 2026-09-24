"use client";

// ─── Espace client ────────────────────────────────────────────────────────────
// Ce que le client voit de ses précommandes. Tout y est dit dans ses mots à lui
// (cf. lib/statut-client.ts) : jamais un statut interne, jamais un chiffre de
// gestion (part de conteneur, prix d'achat). L'accueil montre tout ce qui est
// en cours, dans l'ordre du voyage : en douane, en mer, prêt à livrer, en
// fabrication.

import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Factory,
  Ship,
  PackageCheck,
  History,
  Menu,
  Package,
  LogOut,
  ClipboardList,
  FileText,
  MapPin,
  ExternalLink,
  CalendarClock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { Badge } from '@/components/ui/badge';
import { getArticleDisplayName, getArticleFrenchName } from '@/lib/product-name-utils';
import { libelleUnite } from '@/lib/unites-pole';
import { ETAPES_CLIENT, dateFr, etapeClient, nombreFr, phraseEtape, rangEtape, titreEtape } from '@/lib/statut-client';

interface ClientPortalAppProps {
  clientName: string;
  articles: any[];
  factures: any[];
  categories: any[];
  generalCategories?: any[];
  onLogout?: () => void;
}

type Onglet = 'dashboard' | 'to_order' | 'production' | 'transit' | 'customs' | 'stock' | 'history';

/** Unités au singulier / au pluriel, comme on les dit à un client. */
const UNITES_DITES: Record<string, [string, string]> = {
  'm': ['mètre', 'mètres'], 'rolls': ['rouleau', 'rouleaux'], 'yds': ['yard', 'yards'],
  'kg': ['kg', 'kg'], 'bag': ['sac', 'sacs'], 'doz': ['douzaine', 'douzaines'],
  'gross (144p)': ['grosse (144 pièces)', 'grosses (144 pièces)'],
};

/** Quantité lisible, accordée : « 1 000 mètres », « 1 rouleau », « 12 pièces ». */
const quantiteLisible = (q: unknown, unite?: string | null) => {
  const n = Number(q) || 0;
  const u = (unite || '').trim();
  const dites = UNITES_DITES[u] || (!u || ['u', 'unité', 'pcs', 'pièces', 'pièce'].includes(u.toLowerCase())
    ? ['pièce', 'pièces']
    : [libelleUnite(u).toLowerCase(), libelleUnite(u).toLowerCase()]);
  return `${nombreFr(n)} ${Math.abs(n) > 1 ? dites[1] : dites[0]}`;
};

export function ClientPortalApp({ clientName, articles, factures, categories, generalCategories = [], onLogout }: ClientPortalAppProps) {
  const [activeTab, setActiveTab] = useState<Onglet>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const clientArticles = useMemo(() => {
    const nameLower = (clientName || '').trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return articles
      .filter(a => {
        if (!a.clientName) return false;
        const aName = (a.clientName || '').trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        return aName === nameLower || aName.includes(nameLower) || nameLower.includes(aName);
      })
      .map(a => {
        const facture = factures.find(f => f.id === a.factureId);
        const arrivalDate = facture?.arrivalDate || null;
        const stockEntryDate = facture?.stockEntryDate || null;
        const orderDate = a.orderDate || null;

        const mergedArticle = { ...a, arrivalDate, stockEntryDate };
        const derivedStatus = computeEffectiveStatus(mergedArticle);
        const frenchName = getArticleFrenchName(mergedArticle, categories, generalCategories);

        return {
          ...mergedArticle,
          frenchName,
          status: derivedStatus,
          orderDate,
          factureNoBL: facture?.noBL || null,
          factureShippingLine: facture?.shippingLine || null,
          factureShippingDate: facture?.shippingDate || null,
          // Carte publique ShipsGo du conteneur (faite pour être partagée avec un client).
          factureSuivi: facture?.suivi || null,
        };
      })
      .sort((a, b) => {
        const tA = a.arrivalDate ? new Date(a.arrivalDate).getTime() : Infinity;
        const tB = b.arrivalDate ? new Date(b.arrivalDate).getTime() : Infinity;
        return tA - tB;
      });
  }, [clientName, articles, factures, categories, generalCategories]);

  const stats = useMemo(() => {
    return {
      to_order: clientArticles.filter(a => a.status === 'TO_ORDER'),
      production: clientArticles.filter(a => a.status === 'PI'),
      transit: clientArticles.filter(a => ['TRANSIT', 'SHIPPED'].includes(a.status)),
      customs: clientArticles.filter(a => a.status === 'CUSTOMS'),
      stock: clientArticles.filter(a => a.status === 'STOCK'),
      history: clientArticles.filter(a => a.status === 'DELIVERED'),
    };
  }, [clientArticles]);

  const enCours = clientArticles.length - stats.history.length;

  // Prochaine arrivée annoncée : le conteneur en mer qui arrive le plus tôt.
  const prochaineArrivee = useMemo(() => {
    return stats.transit
      .filter(a => a.arrivalDate)
      .sort((a, b) => String(a.arrivalDate).localeCompare(String(b.arrivalDate)))[0] || null;
  }, [stats.transit]);

  const navItems: { id: Onglet; label: string; icon: any; count: number }[] = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard, count: 0 },
    { id: 'to_order', label: 'Enregistrées', icon: ClipboardList, count: stats.to_order.length },
    { id: 'production', label: 'En fabrication', icon: Factory, count: stats.production.length },
    { id: 'transit', label: 'En mer', icon: Ship, count: stats.transit.length },
    { id: 'customs', label: 'En douane', icon: FileText, count: stats.customs.length },
    { id: 'stock', label: 'Prêtes à livrer', icon: PackageCheck, count: stats.stock.length },
    { id: 'history', label: 'Livrées', icon: History, count: stats.history.length },
  ];

  const NavContent = () => (
    <div className="flex flex-col gap-2 p-4">
      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
            activeTab === item.id
              ? 'bg-[#c4a062] text-white shadow-md shadow-[#c4a062]/20'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <item.icon className="w-5 h-5 shrink-0" />
          <span className="font-black text-[12px] uppercase tracking-widest">{item.label}</span>
          {item.count > 0 && item.id !== 'dashboard' && (
            <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${
              activeTab === item.id ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
            }`}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  /** Le parcours de la commande : où elle en est parmi les six étapes. */
  const Parcours = ({ statut }: { statut: string }) => {
    const rang = rangEtape(etapeClient(statut));
    return (
      <div className="mt-3" aria-label={`Étape : ${titreEtape(statut)}`}>
        <div className="flex items-center gap-1">
          {ETAPES_CLIENT.map((e, i) => (
            <div
              key={e.id}
              title={e.titre}
              className={`h-1.5 flex-1 rounded-full ${i < rang ? 'bg-[#c4a062]' : i === rang ? 'bg-stone-900' : 'bg-stone-200'}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-stone-500">
          <span className="font-black text-stone-800">{titreEtape(statut)}</span>
          {' · '}étape {rang + 1} sur {ETAPES_CLIENT.length}
        </p>
      </div>
    );
  };

  const ArticleCard = ({ article, hideArrivalDate }: { article: any, hideArrivalDate?: boolean }) => {
    const category = categories.find(c => c.id === article.categoryId || (c.name && c.name.toLowerCase() === (article.categoryId || '').toLowerCase()));
    const displayImage = article.imageUrl || article.designImageUrl || category?.imageUrl;

    const { frenchName, originalName, hasDifferentFrenchName } = getArticleDisplayName(article, categories, generalCategories);

    const safeColorBreakdown = Array.isArray(article.colorBreakdown)
      ? article.colorBreakdown
      : (article.colorBreakdown && typeof article.colorBreakdown === 'object')
        ? Object.values(article.colorBreakdown)
        : [];

    const hasVariousColors = (article.color && String(article.color).toUpperCase() === 'VARIOUS' && safeColorBreakdown.length > 0) || safeColorBreakdown.length > 0;
    const unite = article.unitOfMeasure;

    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex gap-4 hover:shadow-md transition-all">
        {displayImage ? (
          <img src={displayImage} alt="" className="w-20 h-20 rounded-xl object-cover border border-stone-100 shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6 text-stone-300" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="font-black text-stone-900 text-sm uppercase tracking-wider truncate mb-0.5">
            {frenchName}
          </p>
          {hasDifferentFrenchName && (
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide truncate mb-1">
              Référence : {originalName}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-stone-600 mb-1">
            <span><span className="text-stone-400">Quantité :</span> <span className="font-black">{quantiteLisible(article.quantity, unite)}</span></span>
            {article.orderDate && <span className="text-stone-400">Commandée le {dateFr(article.orderDate)}</span>}
          </div>

          {(article.size || (article.color && !hasVariousColors) || article.specs || article.zipperType) && (
            <p className="text-[10px] font-bold text-stone-500 mb-1.5 leading-snug line-clamp-2">
              {[
                article.size && article.size !== 'various' ? `Taille ${article.size}` : null,
                article.color && !hasVariousColors ? `Couleur ${article.color}` : null,
                article.specs ? article.specs : article.zipperType ? `Fermeture ${article.zipperType}${article.slider ? ` · curseur ${article.slider}` : ''}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          {hasVariousColors && (
            <div className="mt-1 flex flex-wrap gap-1">
              {safeColorBreakdown.map((c: any, i: number) => (
                <span key={i} className="text-[9px] font-black bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded uppercase">
                  {c.colorCode || c.color} · {quantiteLisible(c.rolls ?? c.quantity, unite)}
                </span>
              ))}
            </div>
          )}

          {!hideArrivalDate && ['TRANSIT', 'SHIPPED'].includes(article.status) && article.arrivalDate && (
            <p className="mt-1.5 text-[11px] font-black text-blue-600 flex items-center gap-1.5">
              <Ship className="w-3 h-3" /> Arrivée prévue le {dateFr(article.arrivalDate)}
            </p>
          )}
          {!hideArrivalDate && article.status === 'CUSTOMS' && article.arrivalDate && (
            <p className="mt-1.5 text-[11px] font-black text-indigo-700 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Arrivée au port le {dateFr(article.arrivalDate)} · dédouanement en cours
            </p>
          )}
          {article.status === 'STOCK' && article.stockEntryDate && (
            <p className="mt-1.5 text-[11px] font-black text-emerald-600 flex items-center gap-1.5">
              <PackageCheck className="w-3 h-3" /> Dans notre entrepôt depuis le {dateFr(article.stockEntryDate)}
            </p>
          )}
          {article.devisConfirmed && article.devisPrixVenteUniteMad && (
            <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 inline-block w-max">
              <p className="text-[10px] font-black text-emerald-700 flex items-center gap-1">
                Prix convenu : {nombreFr(article.devisPrixVenteUniteMad)} MAD / {quantiteLisible(1, unite).replace(/^1 /, '')}
              </p>
            </div>
          )}

          <Parcours statut={article.status} />
        </div>
      </div>
    );
  };

  const ArticleGrid = ({ title, icon: Icon, color, articles, sousTitre }: { title: string, icon: any, color: string, articles: any[], sousTitre?: string }) => {
    if (articles.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1 px-2">
          <div className={`p-2 rounded-xl ${color.split(' ')[0]}`}>
            <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
          </div>
          <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{title}</h2>
          <Badge variant="secondary" className="ml-2 font-black">{articles.length}</Badge>
        </div>
        {sousTitre && <p className="px-2 mb-4 text-xs font-medium text-stone-500">{sousTitre}</p>}
        <div className={`grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 ${sousTitre ? '' : 'mt-4'}`}>
          {articles.map(a => <ArticleCard key={a.id} article={a} />)}
        </div>
      </div>
    );
  };

  /** Les articles regroupés par conteneur, avec sa date et, s'il est suivi, la carte du navire. */
  const ContainerGrid = ({ articles, mode }: { articles: any[]; mode: 'mer' | 'douane' }) => {
    if (articles.length === 0) return null;

    const SANS_CONTENEUR = '__sans_conteneur__';
    const groups: Record<string, any[]> = {};
    articles.forEach(a => {
      const key = a.factureNoBL || SANS_CONTENEUR;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    return (
      <div className="space-y-8">
        {Object.entries(groups).map(([bl, groupArts]) => {
          const premier = groupArts[0];
          const suivi = premier?.factureSuivi;
          const carte = suivi?.lienCarte && suivi?.statut !== 'UNTRACKED' ? suivi.lienCarte : null;
          return (
          <div key={bl} className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-stone-100">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${mode === 'douane' ? 'bg-indigo-50 text-indigo-500' : 'bg-blue-50 text-blue-500'}`}>
                {mode === 'douane' ? <FileText className="w-6 h-6" /> : <Ship className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
                  {bl === SANS_CONTENEUR ? 'Conteneur' : `Conteneur · connaissement ${bl}`}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <h3 className="text-base font-black text-stone-900 uppercase tracking-wider">
                    {bl === SANS_CONTENEUR ? 'Conteneur en cours d’attribution' : (premier?.factureShippingLine ? `${premier.factureShippingLine}` : 'En route')}
                  </h3>
                  {premier?.arrivalDate && mode === 'mer' && (
                    <span className="text-[11px] font-black text-blue-600 flex items-center gap-1.5 bg-blue-50/50 border border-blue-100 px-2.5 py-1 rounded-md">
                      <CalendarClock className="w-3.5 h-3.5" /> Arrivée prévue le {dateFr(premier.arrivalDate)}
                    </span>
                  )}
                  {premier?.arrivalDate && mode === 'douane' && (
                    <span className="text-[11px] font-black text-indigo-700 flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100 px-2.5 py-1 rounded-md">
                      <Check className="w-3.5 h-3.5" /> Arrivé au port le {dateFr(premier.arrivalDate)} · dédouanement en cours
                    </span>
                  )}
                </div>
                {mode === 'mer' && suivi?.navire && (
                  <p className="mt-1 text-[11px] font-bold text-stone-500">Navire : {suivi.navire}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {carte && mode === 'mer' && (
                  <a
                    href={carte}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Suivre le navire <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                )}
                <Badge variant="secondary" className="bg-stone-100 text-stone-600 font-black">
                  {groupArts.length} article{groupArts.length > 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupArts.map(a => <ArticleCard key={a.id} article={a} hideArrivalDate />)}
            </div>
          </div>
        )})}
      </div>
    );
  };

  /** Titre de section de l'accueil, avec son explication. */
  const Section = ({ icon: Icon, fond, texte, titre, statut, children }: { icon: any; fond: string; texte: string; titre: string; statut: string; children: React.ReactNode }) => (
    <div>
      <div className="flex items-center gap-3 mb-1 px-2">
        <div className={`p-2 rounded-xl ${fond}`}>
          <Icon className={`w-5 h-5 ${texte}`} />
        </div>
        <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{titre}</h2>
      </div>
      <p className="px-2 mb-5 text-xs font-medium text-stone-500">{phraseEtape(statut)}</p>
      {children}
    </div>
  );

  const tuiles: { id: Onglet; label: string; valeur: number; ton: string }[] = [
    { id: 'production', label: 'En fabrication', valeur: stats.production.length, ton: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
    { id: 'transit', label: 'En mer', valeur: stats.transit.length, ton: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
    { id: 'customs', label: 'En douane', valeur: stats.customs.length, ton: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' },
    { id: 'stock', label: 'Prêtes à livrer', valeur: stats.stock.length, ton: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
  ];

  return (
    <div className="flex min-h-screen bg-[#F9F6F0]">
      <aside className="hidden md:flex w-72 flex-col bg-white border-r border-stone-200 sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="p-6 border-b border-stone-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#c4a062] to-[#a38042] flex items-center justify-center shrink-0 shadow-lg shadow-[#c4a062]/20">
            <span className="text-white font-black text-lg uppercase tracking-widest">
              {(clientName || 'C').substring(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Espace client</p>
            <h2 className="font-black text-stone-900 truncate uppercase tracking-wider text-sm">{clientName}</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavContent />
        </div>
        {onLogout && (
          <div className="p-4 border-t border-stone-100 mt-auto">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-stone-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span className="font-black text-[12px] uppercase tracking-widest">Se déconnecter</span>
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 w-full min-w-0 flex flex-col">
        <header className="md:hidden bg-white border-b border-stone-200 sticky top-0 z-40 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#c4a062] to-[#a38042] flex items-center justify-center shadow-sm">
              <span className="text-white font-black text-sm uppercase">{(clientName || 'C').substring(0, 2)}</span>
            </div>
            <h1 className="font-black text-stone-900 uppercase truncate text-sm">{clientName}</h1>
          </div>
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Ouvrir le menu"><Menu className="w-6 h-6" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 bg-white">
              <SheetHeader className="p-6 text-left border-b border-stone-100">
                <SheetTitle className="font-black text-stone-900 uppercase tracking-widest">Mes commandes</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <NavContent />
              </div>
              {onLogout && (
                <div className="p-4 border-t border-stone-100 mt-auto">
                  <button
                    onClick={onLogout}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-stone-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
                  >
                    <LogOut className="w-5 h-5 shrink-0" />
                    <span className="font-black text-[12px] uppercase tracking-widest">Se déconnecter</span>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </header>

        <div className="p-4 md:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-10 animate-in fade-in">
              <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden shadow-xl">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10">
                  <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Bonjour {clientName}</p>
                  <h1 className="text-3xl font-black text-white tracking-tight">
                    {enCours > 0
                      ? `${enCours} commande${enCours > 1 ? 's' : ''} en cours`
                      : 'Aucune commande en cours'}
                  </h1>
                  <p className="text-stone-400 text-sm font-medium mt-2 mb-6">
                    Suivez chaque commande de la fabrication jusqu'à la livraison. Les dates se mettent à jour d'elles-mêmes.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {tuiles.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`text-left backdrop-blur-md border rounded-2xl p-4 hover:brightness-125 transition-all ${t.ton}`}
                      >
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1">{t.label}</p>
                        <p className="text-2xl font-black text-white">{t.valeur}</p>
                      </button>
                    ))}
                  </div>
                  {prochaineArrivee && (
                    <p className="mt-5 inline-flex items-center gap-2 text-[11px] font-black text-blue-200 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-xl">
                      <CalendarClock className="w-4 h-4" /> Prochaine arrivée prévue le {dateFr(prochaineArrivee.arrivalDate)}
                    </p>
                  )}
                </div>
              </div>

              {stats.customs.length > 0 && (
                <Section icon={FileText} fond="bg-indigo-50" texte="text-indigo-600" titre="En douane" statut="CUSTOMS">
                  <ContainerGrid articles={stats.customs} mode="douane" />
                </Section>
              )}

              {stats.transit.length > 0 && (
                <Section icon={Ship} fond="bg-blue-50" texte="text-blue-600" titre="En mer" statut="TRANSIT">
                  <ContainerGrid articles={stats.transit} mode="mer" />
                </Section>
              )}

              <ArticleGrid title="Prêtes à livrer" icon={PackageCheck} color="bg-emerald-50 text-emerald-600" articles={stats.stock} sousTitre={phraseEtape('STOCK')} />
              <ArticleGrid title="En fabrication" icon={Factory} color="bg-amber-50 text-amber-600" articles={stats.production} sousTitre={phraseEtape('PI')} />

              {stats.customs.length + stats.transit.length + stats.stock.length + stats.production.length === 0 && (
                <EmptyState
                  titre="Rien en route pour le moment"
                  text={stats.to_order.length > 0
                    ? `${stats.to_order.length} commande${stats.to_order.length > 1 ? 's sont enregistrées' : ' est enregistrée'} : vous la suivrez ici dès son lancement en fabrication.`
                    : 'Vos commandes apparaîtront ici dès leur lancement en fabrication.'}
                />
              )}
            </div>
          )}

          {activeTab === 'to_order' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Commandes enregistrées" icon={ClipboardList} color="bg-orange-50 text-orange-600" articles={stats.to_order} sousTitre={phraseEtape('TO_ORDER')} />
              {stats.to_order.length === 0 && <EmptyState text="Aucune commande en attente de lancement." />}
            </div>
          )}

          {activeTab === 'production' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="En fabrication" icon={Factory} color="bg-amber-50 text-amber-600" articles={stats.production} sousTitre={phraseEtape('PI')} />
              {stats.production.length === 0 && <EmptyState text="Aucune commande en fabrication en ce moment." />}
            </div>
          )}

          {activeTab === 'transit' && (
            <div className="animate-in fade-in">
              {stats.transit.length > 0
                ? <Section icon={Ship} fond="bg-blue-50" texte="text-blue-600" titre="En mer" statut="TRANSIT"><ContainerGrid articles={stats.transit} mode="mer" /></Section>
                : <EmptyState text="Aucune commande en mer en ce moment." />}
            </div>
          )}

          {activeTab === 'customs' && (
            <div className="animate-in fade-in">
              {stats.customs.length > 0
                ? <Section icon={FileText} fond="bg-indigo-50" texte="text-indigo-600" titre="En douane" statut="CUSTOMS"><ContainerGrid articles={stats.customs} mode="douane" /></Section>
                : <EmptyState text="Aucune commande en dédouanement en ce moment." />}
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Prêtes à livrer" icon={PackageCheck} color="bg-emerald-50 text-emerald-600" articles={stats.stock} sousTitre={phraseEtape('STOCK')} />
              {stats.stock.length === 0 && <EmptyState text="Aucune commande prête à livrer pour le moment." />}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Commandes livrées" icon={History} color="bg-stone-100 text-stone-600" articles={stats.history} />
              {stats.history.length === 0 && <EmptyState text="Aucune commande livrée pour l'instant." />}
            </div>
          )}
        </div>
      </main>

    </div>
  );
}

const EmptyState = ({ text, titre }: { text: string; titre?: string }) => (
  <div className="text-center py-16 px-6 bg-white border border-stone-200 rounded-3xl">
    {titre && <p className="text-stone-700 font-black uppercase tracking-widest text-sm mb-2">{titre}</p>}
    <p className="text-stone-400 font-medium text-sm">{text}</p>
  </div>
);
