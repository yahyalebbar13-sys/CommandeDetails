"use client";

import React, { useState, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Factory, 
  Ship, 
  PackageCheck, 
  History,
  Menu,
  ChevronRight,
  Package,
  LogOut,
  Calendar,
  Clock,
  ClipboardList,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { Badge } from '@/components/ui/badge';

interface ClientPortalAppProps {
  clientName: string;
  articles: any[];
  factures: any[];
  categories: any[];
  onLogout?: () => void;
}

export function ClientPortalApp({ clientName, articles, factures, categories, onLogout }: ClientPortalAppProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'to_order' | 'production' | 'transit' | 'customs' | 'stock' | 'history'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const clientArticles = useMemo(() => {
    const nameLower = (clientName || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return articles
      .filter(a => {
        if (!a.clientName) return false;
        const aName = (a.clientName || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return aName === nameLower || aName.includes(nameLower) || nameLower.includes(aName);
      })
      .map(a => {
        const facture = factures.find(f => f.id === a.factureId);
        const arrivalDate = facture?.arrivalDate || null;
        const stockEntryDate = facture?.stockEntryDate || null;
        const orderDate = a.orderDate || null;
        
        const mergedArticle = { ...a, arrivalDate, stockEntryDate };
        const derivedStatus = computeEffectiveStatus(mergedArticle);
        
        return {
          ...mergedArticle,
          status: derivedStatus,
          orderDate,
          factureNoBL: facture?.noBL || null,
          factureShippingLine: facture?.shippingLine || null,
          factureShippingDate: facture?.shippingDate || null,
        };
      })
      .sort((a, b) => {
        const tA = a.arrivalDate ? new Date(a.arrivalDate).getTime() : Infinity;
        const tB = b.arrivalDate ? new Date(b.arrivalDate).getTime() : Infinity;
        return tA - tB;
      });
  }, [clientName, articles, factures]);

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

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard, count: 0 },
    { id: 'to_order', label: 'En Attente', icon: ClipboardList, count: stats.to_order.length },
    { id: 'production', label: 'En Production', icon: Factory, count: stats.production.length },
    { id: 'transit', label: 'En Transit', icon: Ship, count: stats.transit.length },
    { id: 'customs', label: 'Dédouanement', icon: FileText, count: stats.customs.length },
    { id: 'stock', label: 'En Stock', icon: PackageCheck, count: stats.stock.length },
    { id: 'history', label: 'Historique', icon: History, count: stats.history.length },
  ];

  const NavContent = () => (
    <div className="flex flex-col gap-2 p-4">
      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => { setActiveTab(item.id as any); setIsMobileMenuOpen(false); }}
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

  const ArticleCard = ({ article, hideArrivalDate }: { article: any, hideArrivalDate?: boolean }) => {
    const category = categories.find(c => c.id === article.categoryId || (c.name && c.name.toLowerCase() === (article.categoryId || '').toLowerCase()));
    const displayImage = article.imageUrl || article.designImageUrl || category?.imageUrl;

    const safeColorBreakdown = Array.isArray(article.colorBreakdown) 
      ? article.colorBreakdown 
      : (article.colorBreakdown && typeof article.colorBreakdown === 'object') 
        ? Object.values(article.colorBreakdown) 
        : [];
        
    const hasVariousColors = (article.color && String(article.color).toUpperCase() === 'VARIOUS' && safeColorBreakdown.length > 0) || safeColorBreakdown.length > 0;

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
          <p className="font-black text-stone-900 text-sm uppercase tracking-wider truncate mb-1">{article.name || article.categoryId}</p>
          <div className="flex flex-wrap gap-2 text-[11px] font-black text-stone-600 uppercase mb-1">
            <span>Qté: {Number(article.quantity).toLocaleString()} {article.unitOfMeasure || 'U'}</span>
            {article.orderDate && <span className="text-stone-400">• Cmd: {article.orderDate}</span>}
          </div>
          
          {(article.size || (article.color && !hasVariousColors) || article.specs || article.zipperType) && (
            <p className="text-[10px] font-bold text-stone-500 mb-1.5 leading-snug line-clamp-2">
              {[
                article.size ? `Taille: ${article.size}` : null,
                article.color && !hasVariousColors ? `Couleur: ${article.color}` : null,
                article.specs ? `Spéc: ${article.specs}` : article.zipperType ? `Zip: ${article.zipperType} ${article.slider || ''}` : null
              ].filter(Boolean).join(' • ')}
            </p>
          )}
          
          {hasVariousColors && (
            <div className="mt-1 flex flex-wrap gap-1">
              {safeColorBreakdown.map((c: any, i: number) => (
                <span key={i} className="text-[9px] font-black bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded uppercase">
                  {c.colorCode || c.color} ({Number(c.rolls) || 0})
                </span>
              ))}
            </div>
          )}
          
          {!hideArrivalDate && ['TRANSIT', 'SHIPPED', 'CUSTOMS'].includes(article.status) && article.arrivalDate && (
            <p className="mt-1.5 text-[11px] font-black text-blue-600 uppercase flex items-center gap-1.5">
              <Ship className="w-3 h-3" /> Arrivée : {new Date(article.arrivalDate).toLocaleDateString('fr-FR')}
            </p>
          )}
          {article.status === 'CUSTOMS' && (
            <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 inline-block w-max">
              <p className="text-[10px] font-black text-indigo-700 uppercase flex items-center gap-1">
                <FileText className="w-3 h-3" /> En Dédouanement
              </p>
            </div>
          )}
          {article.status === 'STOCK' && article.stockEntryDate && (
            <p className="mt-1.5 text-[11px] font-black text-emerald-600 uppercase flex items-center gap-1.5">
              <PackageCheck className="w-3 h-3" /> Stock depuis : {new Date(article.stockEntryDate).toLocaleDateString('fr-FR')}
            </p>
          )}
          {article.devisConfirmed && article.devisPrixVenteUniteMad && (
            <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 inline-block w-max">
              <p className="text-[10px] font-black text-emerald-700 uppercase flex items-center gap-1">
                <span className="text-[8px]">PV :</span> {Number(article.devisPrixVenteUniteMad).toLocaleString('fr-MA')} MAD
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ArticleGrid = ({ title, icon: Icon, color, articles }: { title: string, icon: any, color: string, articles: any[] }) => {
    if (articles.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className={`p-2 rounded-xl ${color.split(' ')[0]}`}>
            <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
          </div>
          <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{title}</h2>
          <Badge variant="secondary" className="ml-2 font-black">{articles.length}</Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {articles.map(a => <ArticleCard key={a.id} article={a} />)}
        </div>
      </div>
    );
  };

  const ContainerGrid = ({ articles }: { articles: any[] }) => {
    if (articles.length === 0) return null;
    
    const groups: Record<string, any[]> = {};
    articles.forEach(a => {
      const key = a.factureNoBL || 'EN ATTENTE DE CONTENEUR';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    return (
      <div className="space-y-8">
        {Object.entries(groups).map(([bl, groupArts]) => (
          <div key={bl} className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-stone-100">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                <Ship className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Conteneur / B/L</p>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-black text-stone-900 uppercase tracking-wider">{bl}</h3>
                  {groupArts[0]?.arrivalDate && (
                    <span className="text-[11px] font-black text-blue-600 uppercase flex items-center gap-1.5 bg-blue-50/50 border border-blue-100 px-2.5 py-1 rounded-md">
                      <Ship className="w-3.5 h-3.5" /> Arrivée prévue : {new Date(groupArts[0].arrivalDate).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="ml-auto bg-stone-100 text-stone-600 font-black">
                {groupArts.length} ARTICLE{groupArts.length > 1 ? 'S' : ''}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupArts.map(a => <ArticleCard key={a.id} article={a} hideArrivalDate />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

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
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Espace Client</p>
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
              <span className="font-black text-[12px] uppercase tracking-widest">Déconnexion</span>
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
              <Button variant="ghost" size="icon"><Menu className="w-6 h-6" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 bg-white">
              <SheetHeader className="p-6 text-left border-b border-stone-100">
                <SheetTitle className="font-black text-stone-900 uppercase tracking-widest">Menu</SheetTitle>
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
                    <span className="font-black text-[12px] uppercase tracking-widest">Déconnexion</span>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </header>

        <div className="p-4 md:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in">
              <div className="bg-stone-900 rounded-3xl p-8 relative overflow-hidden shadow-xl">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10">
                  <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Vue d'ensemble</p>
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-6">Tableau de bord</h1>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4">
                      <p className="text-stone-400 text-[9px] font-black uppercase tracking-widest mb-1">Total</p>
                      <p className="text-2xl font-black text-white">{clientArticles.length}</p>
                    </div>
                    <div className="bg-blue-500/10 backdrop-blur-md border border-blue-500/20 rounded-2xl p-4">
                      <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mb-1">Transit & Douane</p>
                      <p className="text-2xl font-black text-white">{stats.transit.length + stats.customs.length}</p>
                    </div>
                    <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-2xl p-4">
                      <p className="text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-1">En Stock</p>
                      <p className="text-2xl font-black text-white">{stats.stock.length}</p>
                    </div>
                    <div className="bg-stone-500/10 backdrop-blur-md border border-stone-500/20 rounded-2xl p-4">
                      <p className="text-stone-400 text-[9px] font-black uppercase tracking-widest mb-1">Livré</p>
                      <p className="text-2xl font-black text-white">{stats.history.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {stats.transit.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6 px-2">
                    <div className="p-2 rounded-xl bg-blue-50">
                      <Ship className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">Actuellement en Transit</h2>
                  </div>
                  <ContainerGrid articles={stats.transit} />
                </div>
              )}

              <ArticleGrid title="Disponible en Stock" icon={PackageCheck} color="bg-emerald-50 text-emerald-600" articles={stats.stock} />
              
              {stats.transit.length === 0 && stats.stock.length === 0 && (
                <EmptyState text="Vos commandes apparaîtront ici dès qu'elles seront en transit ou en stock." />
              )}
            </div>
          )}

          {activeTab === 'to_order' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="En Attente" icon={ClipboardList} color="bg-orange-50 text-orange-600" articles={stats.to_order} />
              {stats.to_order.length === 0 && <EmptyState text="Aucune commande en attente" />}
            </div>
          )}

          {activeTab === 'production' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Commandes en Production" icon={Factory} color="bg-amber-50 text-amber-600" articles={stats.production} />
              {stats.production.length === 0 && <EmptyState text="Aucune commande en production" />}
            </div>
          )}

          {activeTab === 'transit' && (
            <div className="animate-in fade-in">
              <div className="flex items-center gap-3 mb-6 px-2">
                <div className="p-2 rounded-xl bg-blue-50">
                  <Ship className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">Commandes en Transit</h2>
              </div>
              {stats.transit.length > 0 ? <ContainerGrid articles={stats.transit} /> : <EmptyState text="Aucune commande en transit" />}
            </div>
          )}

          {activeTab === 'customs' && (
            <div className="animate-in fade-in">
              <div className="flex items-center gap-3 mb-6 px-2">
                <div className="p-2 rounded-xl bg-indigo-50">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">En Dédouanement</h2>
              </div>
              {stats.customs.length > 0 ? <ContainerGrid articles={stats.customs} /> : <EmptyState text="Aucune commande en dédouanement" />}
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Commandes en Stock" icon={PackageCheck} color="bg-emerald-50 text-emerald-600" articles={stats.stock} />
              {stats.stock.length === 0 && <EmptyState text="Aucune commande en stock" />}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-in fade-in">
              <ArticleGrid title="Historique (Commandes Livrées)" icon={History} color="bg-stone-100 text-stone-600" articles={stats.history} />
              {stats.history.length === 0 && <EmptyState text="Aucun historique disponible" />}
            </div>
          )}
        </div>
      </main>

    </div>
  );
}

const EmptyState = ({ text }: { text: string }) => (
  <div className="text-center py-20 bg-white border border-stone-200 rounded-3xl">
    <p className="text-stone-400 font-black uppercase tracking-widest">{text}</p>
  </div>
);
