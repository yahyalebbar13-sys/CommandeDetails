"use client";

/**
 * « Ajouter des articles » dans la fiche d'un dossier d'arrivage : on cherche
 * la commande en production, puis « Expédier » — toute la commande ou une
 * partie, avec le poids net et le volume du packing list.
 */

import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { commandeCorrespond } from '@/lib/recherche-commandes';
import { repartition } from '@/lib/repartition';
import ExpedierModal from './expedier-modal';
import { ArrowRight, Box, Building2, Clock, PackagePlus, Scale, Search, UserCircle2, X } from 'lucide-react';

interface AjouterArticlesDossierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dossier: any;
  articles: any[];
  factures: any[];
  generalCategories?: any[];
}

const statutEnBase = (a: any) => a?.rawStatus ?? a?.status;
const fournisseur = (x: any) => String(x?.supplierId || '').trim().toUpperCase();
const fmt = (n: number, d = 3) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });
const NOMS_REPARTITION: Record<string, [string, string]> = {
  colorBreakdown: ['couleur', 'couleurs'],
  designBreakdown: ['design', 'designs'],
  qualityBreakdown: ['qualité', 'qualités'],
  sizeBreakdown: ['taille', 'tailles'],
};

export default function AjouterArticlesDossierModal({ open, onOpenChange, dossier, articles, factures, generalCategories = [] }: AjouterArticlesDossierModalProps) {
  const [recherche, setRecherche] = useState('');
  const [tousFournisseurs, setTousFournisseurs] = useState(false);
  const [aExpedier, setAExpedier] = useState<any>(null);

  const fournisseurDossier = fournisseur(dossier);
  const enProduction = useMemo(
    () => articles
      .filter(a => statutEnBase(a) === 'PI')
      .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))),
    [articles],
  );
  const duFournisseur = useMemo(
    () => (fournisseurDossier ? enProduction.filter(a => fournisseur(a) === fournisseurDossier) : enProduction),
    [enProduction, fournisseurDossier],
  );
  // Rien chez ce fournisseur : on montre tout.
  const parmi = tousFournisseurs || !duFournisseur.length ? enProduction : duFournisseur;
  const nomDuPole = useMemo(
    () => new Map<string, string>(generalCategories.map((gc: any) => [gc.id, `${gc.name || ''} ${gc.nameFR || ''}`])),
    [generalCategories],
  );
  const trouves = useMemo(
    () => (recherche.trim() ? parmi.filter(o => commandeCorrespond(o, recherche, nomDuPole.get(o.generalCategoryId))) : parmi),
    [parmi, recherche, nomDuPole],
  );

  const dansLeDossier = useMemo(
    () => articles.filter(a => a.factureId === dossier?.id && statutEnBase(a) !== 'PI'),
    [articles, dossier?.id],
  );
  const total = (k: 'netWeight' | 'cubicMeasurement') => dansLeDossier.reduce((s, a) => s + (Number(a[k]) || 0), 0);

  if (!dossier) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[96vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl">
          <div className="bg-stone-900 p-5 text-white shrink-0 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg"><PackagePlus className="w-6 h-6" /></div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-black uppercase tracking-tight leading-none">Ajouter des articles</DialogTitle>
                <DialogDescription className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                  Dossier {dossier.id}{dossier.supplierId ? ` · ${dossier.supplierId}` : ''}{dossier.arrivalDate ? ` · arrivée ${dossier.arrivalDate}` : ''}
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="px-2 py-1 rounded-lg bg-white/10">{dansLeDossier.length} article{dansLeDossier.length > 1 ? 's' : ''} au dossier</span>
              <span className="px-2 py-1 rounded-lg bg-white/10 inline-flex items-center gap-1"><Scale className="w-3 h-3" /> {fmt(total('netWeight'), 2)} kg</span>
              <span className="px-2 py-1 rounded-lg bg-white/10 inline-flex items-center gap-1"><Box className="w-3 h-3" /> {fmt(total('cubicMeasurement'))} m³</span>
            </div>
          </div>

          <div className="p-4 border-b border-stone-100 bg-[#F9F6F0] space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                autoFocus
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Chercher une commande en production : article, couleur, client, fournisseur, code…"
                className="pl-9 pr-9 h-11 bg-white font-bold"
              />
              {recherche && (
                <button type="button" onClick={() => setRecherche('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700" aria-label="Effacer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {fournisseurDossier && duFournisseur.length > 0 && (
              <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest">
                {[[false, `${dossier.supplierId} (${duFournisseur.length})`], [true, `Tous les fournisseurs (${enProduction.length})`]].map(([v, t]) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setTousFournisseurs(v as boolean)}
                    className={`px-3 py-1.5 rounded-lg border ${tousFournisseurs === v ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}
                  >
                    {t as string}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
            {!trouves.length && (
              <p className="p-8 text-center text-sm text-stone-400 font-bold">
                {enProduction.length ? 'Aucune commande en production ne correspond.' : 'Aucune commande en production.'}
              </p>
            )}
            {trouves.map(o => {
              const rep = repartition(o);
              const noms = rep ? NOMS_REPARTITION[rep.champ] : null;
              return (
                <div key={o.id} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-stone-900 text-[12px] uppercase truncate">{o.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {o.supplierId && (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded uppercase">
                          <Building2 className="w-2.5 h-2.5" /> {o.supplierId}
                        </span>
                      )}
                      {o.clientName && (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                          <UserCircle2 className="w-2.5 h-2.5" /> {o.clientName}
                        </span>
                      )}
                      {rep && noms && rep.lignes.length > 1 && (
                        <span className="text-[8px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded uppercase">{rep.lignes.length} {noms[1]}</span>
                      )}
                      {o.color && o.color !== 'various' && <span className="text-[8px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.color}</span>}
                      {o.size && o.size !== 'various' && <span className="text-[8px] font-bold text-stone-500 bg-stone-50 border border-stone-100 px-1.5 py-0.5 rounded uppercase">{o.size}</span>}
                      {o.specs && <span className="text-[8px] font-bold text-stone-400 px-1.5 py-0.5 truncate max-w-[220px]">{o.specs}</span>}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-stone-400 font-bold text-[10px] shrink-0">
                    <Clock className="w-3 h-3" /> {o.orderDate}
                  </div>
                  <div className="text-right shrink-0 w-28">
                    <p className="font-black text-stone-900 text-[12px]">{fmt(Number(o.quantity) || 0)} <span className="text-[9px] text-stone-400 font-bold">{o.unitOfMeasure}</span></p>
                    <p className="text-[9px] font-bold text-stone-400">
                      {Number(o.netWeight) > 0 ? `${fmt(Number(o.netWeight), 2)} kg` : '— kg'} · {Number(o.cubicMeasurement) > 0 ? `${fmt(Number(o.cubicMeasurement))} m³` : '— m³'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setAExpedier(o)}
                    disabled={!dossier.arrivalDate}
                    title={dossier.arrivalDate ? 'Expédier dans ce dossier' : "Le dossier n'a pas de date d'arrivée"}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-widest px-4 h-8 rounded-lg shrink-0"
                  >
                    Expédier <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              );
            })}
          </div>
          {!dossier.arrivalDate && (
            <p className="p-3 text-[11px] font-bold text-amber-800 bg-amber-50 border-t border-amber-200 shrink-0">
              Ce dossier n'a pas de date d'arrivée : renseigne-la dans « Paramétrer le dossier » avant d'y expédier.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <ExpedierModal
        open={!!aExpedier}
        onOpenChange={o => { if (!o) setAExpedier(null); }}
        order={aExpedier}
        factures={factures}
        articles={articles}
        dossier={dossier}
      />
    </>
  );
}
