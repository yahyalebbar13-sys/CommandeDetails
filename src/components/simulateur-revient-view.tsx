"use client";

// ─── Simulateur de prix de revient ────────────────────────────────────────────
// « Ce produit, je le vends combien ? » — avant de confirmer une commande.
//
// Le calcul est celui de l'écran « Coût Revient » (cf. lib/cout-revient.ts) :
// un simulateur qui annoncerait d'autres chiffres que les dossiers réels ne
// servirait à rien. Les taux douaniers viennent de la fiche catégorie et le
// taux de change des dernières factures payées ; les deux restent modifiables,
// puisqu'une simulation sert justement à essayer autre chose.

import React, { useMemo, useState } from 'react';
import { Calculator, Package, Ship, Landmark, TrendingUp, AlertTriangle, RotateCcw, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  fretMoyenParM3, simulerCoutRevient, tauxChangeRecent, tauxDeLaCategorie,
  type TauxDouane,
} from '@/lib/cout-revient';

const mad = (n: number, decimales = 2) =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) : '—';

const CARTE = 'bg-white border border-stone-200 rounded-2xl p-5 shadow-sm';
const LABEL = 'text-[10px] font-black text-stone-400 uppercase tracking-widest';
const CHAMP = 'h-10 rounded-xl border-stone-200 text-sm font-bold';

/** Une ligne du détail : libellé à gauche, montant à droite. */
function Ligne({ libelle, valeur, detail, fort, accent }: {
  libelle: string; valeur: string; detail?: string; fort?: boolean; accent?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${fort ? 'border-t border-stone-200 pt-2.5 mt-1' : ''}`}>
      <span className={`${fort ? 'text-[11px] font-black text-stone-900 uppercase tracking-widest' : 'text-[11px] font-bold text-stone-500'}`}>
        {libelle}
        {detail && <span className="block text-[10px] font-medium text-stone-400 normal-case tracking-normal">{detail}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${fort ? 'text-base font-black' : 'text-[12px] font-bold text-stone-700'} ${accent || (fort ? 'text-stone-900' : '')}`}>
        {valeur}
      </span>
    </div>
  );
}

export default function SimulateurRevientView({
  factures = [],
  articles = [],
  subCategories = [],
}: {
  factures?: any[];
  articles?: any[];
  /** Collection « categories » : porte les taux douaniers. */
  subCategories?: any[];
}) {
  // ── Ce que l'historique sait déjà ──────────────────────────────────────────
  const changeHisto = useMemo(() => tauxChangeRecent(factures), [factures]);
  const fretHisto = useMemo(() => fretMoyenParM3(factures, articles), [factures, articles]);

  const [categorie, setCategorie] = useState('');
  const [quantite, setQuantite] = useState('1000');
  const [prixAchat, setPrixAchat] = useState('');
  const [poids, setPoids] = useState('');
  const [volume, setVolume] = useState('');
  const [fret, setFret] = useState('');
  const [fraisDossier, setFraisDossier] = useState('14000');
  const [volumeDossier, setVolumeDossier] = useState('64');
  const [tauxChange, setTauxChange] = useState('');
  const [marge, setMarge] = useState('15');
  const [tvaVente, setTvaVente] = useState('20');

  // Taux douaniers : ceux de la catégorie, sauf si on les a modifiés à la main.
  const [douaneModifiee, setDouaneModifiee] = useState<TauxDouane | null>(null);
  const douaneCategorie = useMemo(
    () => (categorie ? tauxDeLaCategorie(subCategories, categorie) : null),
    [categorie, subCategories],
  );
  const douane: TauxDouane = douaneModifiee ?? douaneCategorie ?? {};

  const tauxUtilise = tauxChange !== '' ? Number(tauxChange) : changeHisto.taux;

  const r = useMemo(() => simulerCoutRevient({
    quantite: Number(quantite) || 0,
    prixAchatUnitaire: Number(prixAchat) || 0,
    poidsNetTotal: Number(poids) || 0,
    volumeTotal: Number(volume) || 0,
    tauxChange: tauxUtilise,
    fretParM3: Number(fret) || 0,
    fraisDossier: Number(fraisDossier) || 0,
    volumeDossier: Number(volumeDossier) || 0,
    douane,
    margePct: Number(marge) || 0,
    tvaVentePct: Number(tvaVente) || 0,
  }), [quantite, prixAchat, poids, volume, tauxUtilise, fret, fraisDossier, volumeDossier, douane, marge, tvaVente]);

  const remplie = Number(quantite) > 0 && Number(prixAchat) > 0;
  const categories = useMemo(
    () => [...subCategories].filter(c => c?.name).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [subCategories],
  );

  const majDouane = (champ: keyof TauxDouane, valeur: string) =>
    setDouaneModifiee({ ...douane, [champ]: valeur === '' ? null : Number(valeur) });

  return (
    <div className="space-y-6 fade-in">
      <header className="bg-stone-900 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-center gap-5">
          <div className="p-4 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20">
            <Calculator className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Avant de commander</p>
            <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Simulateur de prix de revient</h2>
            <p className="text-[11px] text-stone-400 font-medium mt-2 max-w-2xl">
              Même calcul que l&apos;onglet Coût Revient : valeur d&apos;achat convertie, fret et frais répartis au volume,
              valeur en douane au kilo, DI, TPI, TIC puis TVA. Rien n&apos;est enregistré.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Saisie ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <section className={CARTE}>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-stone-900" />
              <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">Le produit</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className={LABEL}>Catégorie</Label>
                <Select value={categorie} onValueChange={v => { setCategorie(v); setDouaneModifiee(null); }}>
                  <SelectTrigger className={`${CHAMP} mt-1`}>
                    <SelectValue placeholder="Choisir — pour reprendre ses taux de douane" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id || c.name} value={c.name}>{c.nameFR || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={LABEL}>Quantité</Label>
                <Input type="number" min="0" value={quantite} onChange={e => setQuantite(e.target.value)} className={`${CHAMP} mt-1`} />
              </div>
              <div>
                <Label className={LABEL}>Prix d&apos;achat unitaire ($)</Label>
                <Input type="number" min="0" step="0.001" value={prixAchat} onChange={e => setPrixAchat(e.target.value)} placeholder="0.42" className={`${CHAMP} mt-1`} />
              </div>
              <div>
                <Label className={LABEL}>Poids net total (kg)</Label>
                <Input type="number" min="0" step="0.1" value={poids} onChange={e => setPoids(e.target.value)} placeholder="850" className={`${CHAMP} mt-1`} />
                <p className="text-[10px] text-stone-400 font-medium mt-1">C&apos;est lui qui détermine les droits de douane.</p>
              </div>
              <div>
                <Label className={LABEL}>Volume total (m³)</Label>
                <Input type="number" min="0" step="0.01" value={volume} onChange={e => setVolume(e.target.value)} placeholder="3.2" className={`${CHAMP} mt-1`} />
                <p className="text-[10px] text-stone-400 font-medium mt-1">Il répartit le fret et les frais.</p>
              </div>
            </div>
          </section>

          <section className={CARTE}>
            <div className="flex items-center gap-2 mb-4">
              <Ship className="w-4 h-4 text-stone-900" />
              <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">Le transport</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className={LABEL}>Fret ($/m³)</Label>
                <Input type="number" min="0" step="1" value={fret} onChange={e => setFret(e.target.value)}
                  placeholder={fretHisto.fret ? fretHisto.fret.toFixed(0) : '95'} className={`${CHAMP} mt-1`} />
                {fretHisto.fret > 0 && (
                  <button type="button" onClick={() => setFret(fretHisto.fret.toFixed(0))}
                    className="text-[10px] font-bold text-amber-600 hover:text-amber-700 mt-1">
                    Vos {fretHisto.dossiers} derniers arrivages : {fretHisto.fret.toFixed(0)} $/m³ — utiliser
                  </button>
                )}
              </div>
              <div>
                <Label className={LABEL}>Taux de change (MAD/$)</Label>
                <Input type="number" min="0" step="0.01" value={tauxChange} onChange={e => setTauxChange(e.target.value)}
                  placeholder={changeHisto.taux ? changeHisto.taux.toFixed(2) : '10.20'} className={`${CHAMP} mt-1`} />
                <p className="text-[10px] text-stone-400 font-medium mt-1">
                  {changeHisto.taux > 0
                    ? `Déduit de vos ${changeHisto.dossiers} derniers dossiers payés : ${changeHisto.taux.toFixed(2)}`
                    : 'Aucun dossier payé pour le déduire — à saisir.'}
                </p>
              </div>
              <div>
                <Label className={LABEL}>Frais du conteneur (MAD)</Label>
                <Input type="number" min="0" value={fraisDossier} onChange={e => setFraisDossier(e.target.value)} className={`${CHAMP} mt-1`} />
                <p className="text-[10px] text-stone-400 font-medium mt-1">Transitaire, change et divers, TTC.</p>
              </div>
              <div>
                <Label className={LABEL}>Volume du conteneur (m³)</Label>
                <Input type="number" min="0" step="1" value={volumeDossier} onChange={e => setVolumeDossier(e.target.value)} className={`${CHAMP} mt-1`} />
                <p className="text-[10px] text-stone-400 font-medium mt-1">Pour la part de frais imputée au produit.</p>
              </div>
            </div>
          </section>

          <section className={CARTE}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-stone-900" />
                <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">La douane</h3>
              </div>
              {douaneModifiee && douaneCategorie && (
                <Button variant="ghost" onClick={() => setDouaneModifiee(null)}
                  className="h-8 text-[10px] font-black uppercase tracking-widest gap-1.5 text-stone-400 hover:text-stone-900">
                  <RotateCcw className="w-3 h-3" /> Revenir à la catégorie
                </Button>
              )}
            </div>
            {!categorie && (
              <p className="text-[11px] font-bold text-stone-400 mb-3">
                Choisissez une catégorie pour reprendre ses taux, ou saisissez-les ici.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {([
                ['valeurAuKg', 'Valeur (DH/kg)'],
                ['di', 'DI (%)'],
                ['tpi', 'TPI (%)'],
                ['tic', 'TIC (%)'],
                ['tva', 'TVA (%)'],
              ] as [keyof TauxDouane, string][]).map(([champ, libelle]) => (
                <div key={champ}>
                  <Label className={LABEL}>{libelle}</Label>
                  <Input type="number" min="0" step="0.01"
                    value={douane[champ] == null ? '' : String(douane[champ])}
                    onChange={e => majDouane(champ, e.target.value)}
                    placeholder="—" className={`${CHAMP} mt-1`} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Résultat ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-stone-900 rounded-2xl p-6 shadow-xl sticky top-6">
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em]">Prix de revient unitaire</p>
            <p className="text-4xl font-black text-white tracking-tighter mt-1 tabular-nums">
              {remplie ? mad(r.coutUnitaire) : '—'} <span className="text-base text-stone-500">MAD</span>
            </p>
            <p className="text-[10px] font-bold text-stone-400 mt-1">
              {remplie ? `${mad(r.coutUnitaireHorsTva)} MAD hors TVA d'importation` : 'Renseignez quantité et prix d’achat'}
            </p>

            <div className="mt-5 pt-5 border-t border-white/10 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Marge (%)</Label>
                  <Input type="number" min="0" step="1" value={marge} onChange={e => setMarge(e.target.value)}
                    className="h-9 mt-1 rounded-lg bg-white/5 border-white/10 text-white text-sm font-black" />
                </div>
                <div className="flex-1">
                  <Label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">TVA vente (%)</Label>
                  <Input type="number" min="0" step="1" value={tvaVente} onChange={e => setTvaVente(e.target.value)}
                    className="h-9 mt-1 rounded-lg bg-white/5 border-white/10 text-white text-sm font-black" />
                </div>
              </div>
              <div className="bg-amber-500 rounded-xl p-4">
                <p className="text-[9px] font-black text-amber-900 uppercase tracking-widest">Prix de vente conseillé</p>
                <p className="text-2xl font-black text-white tracking-tighter tabular-nums">
                  {remplie ? mad(r.prixVenteUnitaireHT) : '—'} <span className="text-xs text-amber-100">MAD HT</span>
                </p>
                <p className="text-[11px] font-bold text-amber-100">
                  {remplie ? `${mad(r.prixVenteUnitaireTTC)} MAD TTC · marge ${mad(r.margeUnitaire)} MAD/unité` : ''}
                </p>
              </div>
            </div>
          </section>

          <section className={CARTE}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-stone-900" />
              <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">Le détail du lot</h3>
            </div>
            <Ligne libelle="Valeur d'achat" valeur={`${mad(r.valeurAchat, 0)} MAD`}
              detail={tauxUtilise > 0 ? `au taux de ${tauxUtilise.toFixed(2)} MAD/$` : undefined} />
            <Ligne libelle="Fret maritime" valeur={`${mad(r.fret, 0)} MAD`} />
            <Ligne libelle="Frais du conteneur" valeur={`${mad(r.fraisLogistiques, 0)} MAD`}
              detail={Number(volumeDossier) > 0 ? `part de ${((Number(volume) || 0) / Number(volumeDossier) * 100).toFixed(1)} % du conteneur` : undefined} />
            <Ligne libelle="Logistique hors TVA" valeur={`${mad(r.fraisTotal, 0)} MAD`} detail="fret et frais ÷ 1,20" />
            <Ligne libelle="Valeur en douane" valeur={`${mad(r.valeurDouane, 0)} MAD`}
              detail={douane.valeurAuKg != null ? `${mad(Number(poids) || 0, 0)} kg × ${douane.valeurAuKg} DH/kg` : 'valeur au kilo manquante'} />
            <Ligne libelle="Droits (DI)" valeur={`${mad(r.di, 0)} MAD`} />
            <Ligne libelle="Parafiscale (TPI)" valeur={`${mad(r.tpi, 0)} MAD`} />
            {r.tic > 0 && <Ligne libelle="Taxe intérieure (TIC)" valeur={`${mad(r.tic, 0)} MAD`} />}
            <Ligne libelle="TVA à l'importation" valeur={`${mad(r.tvaImport, 0)} MAD`} detail="sur douane + DI + TPI + TIC" />
            <Ligne libelle="Coût de revient du lot" valeur={`${mad(r.coutTotal, 0)} MAD`} fort />
          </section>

          {r.alertes.length > 0 && remplie && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              {r.alertes.map(a => (
                <p key={a} className="flex items-start gap-2 text-[11px] font-bold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{a}
                </p>
              ))}
            </section>
          )}

          <p className="flex items-start gap-2 text-[10px] font-medium text-stone-400 px-1">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            La valeur en douane marocaine est forfaitaire, au kilo : elle ne dépend pas du prix payé.
            Un produit léger et cher paie donc peu de droits, un produit lourd et bon marché en paie beaucoup.
          </p>
        </div>
      </div>
    </div>
  );
}
