"use client";

/**
 * « Expédier » un article en production vers un dossier d'arrivage : toute la
 * commande ou une partie (par couleur, design, qualité, taille, ou en
 * quantité), avec le poids net et le volume du packing list.
 *
 * Deux portes : la production (on choisit le dossier) et la fiche d'un dossier
 * (« Ajouter des articles » : le dossier est donné).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore } from '@/firebase';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { sendStatusNotification } from '@/lib/send-status-notification';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { planExpedition, type ModeExpedition } from '@/lib/expedition';
import { libelleLigne, repartition } from '@/lib/repartition';
import { Ship, CalendarDays, CheckCircle2, Loader2, Scissors, Package, ClipboardPaste, Scale, Box, AlertTriangle } from 'lucide-react';

interface ExpedierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  factures: any[];
  /** Tous les articles : une deuxième part de la même commande rejoint la première dans le dossier. */
  articles: any[];
  /** Le dossier est déjà choisi (fiche du dossier) : pas de choix de facture. */
  dossier?: any | null;
}

/** « 1 234,5 » ou « 1234.5 » → 1234.5 ; vide → null. */
function lireSaisie(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const cleLibelle = (s: string) => s.trim().toUpperCase().replace(/[\s\-_]/g, '');

/** Firestore refuse `undefined` : on le retire partout. */
function sansIndefinis(v: any): any {
  if (Array.isArray(v)) return v.map(sansIndefinis);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, sansIndefinis(x)]));
  }
  return v;
}

const fmt = (n: number, d = 3) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });

export default function ExpedierModal({ open, onOpenChange, order, factures, articles, dossier }: ExpedierModalProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [mode, setMode] = useState<ModeExpedition>('tout');
  const [parLigne, setParLigne] = useState<string[]>([]);
  const [quantite, setQuantite] = useState('');
  const [poids, setPoids] = useState('');
  const [volume, setVolume] = useState('');
  const [factureId, setFactureId] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [collage, setCollage] = useState<string | null>(null);
  const [resultatCollage, setResultatCollage] = useState<{ trouves: number; inconnus: string[] } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const rep = useMemo(() => (order ? repartition(order) : null), [order]);
  const parLignes = Boolean(rep && rep.lignes.length > 1);
  const qteArticle = Number(order?.quantity) || 0;
  const unite = order?.unitOfMeasure || '';

  useEffect(() => {
    if (!open) return;
    setMode('tout');
    setParLigne(rep ? rep.lignes.map(() => '') : []);
    setQuantite('');
    setPoids('');
    setVolume('');
    setFactureId(dossier?.id || '');
    setArrivalDate(dossier?.arrivalDate || '');
    setCollage(null);
    setResultatCollage(null);
  }, [open, dossier, rep]);

  // Ce qui part, ce qui reste, à mesure de la saisie.
  const qteEnvoyee = mode === 'tout'
    ? qteArticle
    : parLignes
      ? parLigne.reduce((s, v) => s + (lireSaisie(v) || 0), 0)
      : lireSaisie(quantite) || 0;
  const qteRestante = Math.max(0, (parLignes && rep ? rep.lignes.reduce((s, l) => s + (Number(l[rep.qte]) || 0), 0) : qteArticle) - qteEnvoyee);
  const estimation = (v: unknown, d: number) => {
    const n = Number(v);
    return n > 0 && qteArticle > 0 ? Math.round((n * qteEnvoyee) / qteArticle * 10 ** d) / 10 ** d : null;
  };
  const poidsEstime = estimation(order?.netWeight, 2);
  const volumeEstime = estimation(order?.cubicMeasurement, 3);

  // Coller un tableau « COULEUR <tab> QTÉ » depuis Excel ou le packing details.
  const lireCollage = (texte: string) => {
    setCollage(texte);
    if (!rep || !texte.trim()) { setResultatCollage(null); return; }
    const index = new Map(rep.lignes.map((l, i) => [cleLibelle(libelleLigne(rep, l)), i]));
    const valeurs = [...parLigne];
    const inconnus: string[] = [];
    let trouves = 0;
    for (const brut of texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const m = brut.match(/^(.*?)[\t;\s]+([\d\s.,]+)$/);
      if (!m) { inconnus.push(brut); continue; }
      const i = index.get(cleLibelle(m[1]));
      const q = lireSaisie(m[2]);
      if (i == null || q == null) { inconnus.push(m[1]); continue; }
      valeurs[i] = String(Math.min(q, Number(rep.lignes[i][rep.qte]) || 0));
      trouves++;
    }
    setParLigne(valeurs);
    setResultatCollage({ trouves, inconnus });
  };

  const choisirFacture = (id: string) => {
    const v = id.toUpperCase();
    setFactureId(v);
    const connue = factures.find(f => f.id === v);
    if (connue?.arrivalDate) setArrivalDate(connue.arrivalDate);
  };

  const confirmer = async () => {
    if (!user || !firestore || !order) return;
    const plan = planExpedition({
      article: order,
      dossier: { id: factureId.trim(), arrivalDate },
      mode,
      parLigne: parLigne.map(v => lireSaisie(v) || 0),
      quantite: lireSaisie(quantite) || 0,
      poidsNet: lireSaisie(poids),
      volume: lireSaisie(volume),
      articles,
      maintenant: serverTimestamp(),
      nouvelId: () => crypto.randomUUID(),
    });
    if ('erreur' in plan) {
      toast({ variant: 'destructive', title: 'Expédition impossible', description: plan.erreur });
      return;
    }
    setEnvoi(true);
    try {
      const lot = writeBatch(firestore);
      for (const e of plan.ecritures) {
        const ref = doc(firestore, 'users', user.uid, 'articles', e.id);
        if (e.op === 'set') lot.set(ref, sansIndefinis(e.data));
        else lot.update(ref, sansIndefinis(e.data));
      }
      await lot.commit();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Expédition non enregistrée', description: e?.message || String(e) });
      setEnvoi(false);
      return;
    }
    toast({
      title: 'Expédié',
      description: `${order.name} : ${fmt(plan.envoye.quantite)} ${unite} dans le dossier ${factureId.trim()}${plan.fusionneAvec ? ' (ajouté à la part déjà expédiée)' : ''}.`,
    });

    // Le client de la commande est prévenu, comme avant.
    const client = String(order.clientName || '').trim();
    if (client.length >= 3) {
      const fiche = dossier || factures.find(f => f.id === factureId.trim());
      let transitDuration: string | undefined;
      if (arrivalDate) {
        const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
        const eta = new Date(arrivalDate); eta.setHours(0, 0, 0, 0);
        const jours = Math.round((eta.getTime() - aujourdhui.getTime()) / 86400000);
        transitDuration = jours > 1 ? `${jours} jours` : jours === 1 ? '1 jour' : jours === 0 ? "aujourd'hui" : undefined;
      }
      const effectif = computeEffectiveStatus({ status: 'SHIPPED', arrivalDate, stockEntryDate: fiche?.stockEntryDate });
      const r = await sendStatusNotification({
        firestore,
        adminUid: user.uid,
        clientName: client,
        articleName: order.categoryId || order.name,
        oldStatus: 'PI',
        newStatus: effectif === 'TRANSIT' ? 'SHIPPED' : effectif,
        quantity: plan.envoye.quantite,
        unitOfMeasure: unite,
        specs: order.specs,
        color: plan.envoye.couleur,
        size: order.size,
        estimatedProductionDelay: order.estimatedProductionDelay,
        imageUrl: order.imageUrl || undefined,
        transitArrivalDate: arrivalDate,
        transitDuration,
        noBL: fiche?.noBL || null,
      }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }) as { ok: boolean; email?: string; error?: string });
      if (r.ok) toast({ title: 'Client prévenu', description: `${client}${r.email ? ` — ${r.email}` : ''}` });
      else if (r.error) toast({ variant: 'destructive', title: 'Client non prévenu', description: r.error });
    }
    setEnvoi(false);
    onOpenChange(false);
  };

  if (!order) return null;
  const dossiersRecents = [...factures]
    .sort((a, b) => (b.createdAt || b.shippingDate || '').localeCompare?.(a.createdAt || a.shippingDate || '') ?? 0)
    .slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={o => { if (!envoi) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-700 flex items-center gap-2">
            <Ship className="w-6 h-6" /> Expédier
          </DialogTitle>
          <DialogDescription className="text-stone-500">
            {dossier
              ? <>Dans le dossier <b className="text-stone-800">{dossier.id}</b>{dossier.arrivalDate ? ` · arrivée prévue ${dossier.arrivalDate}` : ''}.</>
              : "Choisis le dossier (n° de facture / conteneur) et sa date d'arrivée."}
          </DialogDescription>
        </DialogHeader>

        {/* L'article */}
        <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 space-y-1">
          <div className="font-bold text-stone-800">{order.name}</div>
          <div className="text-sm text-stone-600">
            {fmt(qteArticle)} {unite}{order.supplierId ? ` · ${order.supplierId}` : ''}{order.orderDate ? ` · commandé le ${order.orderDate}` : ''}
          </div>
          <div className="text-[11px] text-stone-500">
            Estimation fiche : {Number(order.netWeight) > 0 ? `${fmt(Number(order.netWeight), 2)} kg` : 'poids —'} · {Number(order.cubicMeasurement) > 0 ? `${fmt(Number(order.cubicMeasurement))} m³` : 'volume —'}
          </div>
          {order.clientName && (
            <div className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex">
              Client prévenu : {order.clientName}
            </div>
          )}
        </div>

        {/* Toute la commande / fractionner */}
        <div className="flex gap-2">
          {([
            ['tout', Package, 'Toute la commande', 'Tout part'],
            ['partiel', Scissors, 'Fractionner', 'Une partie part'],
          ] as const).map(([m, Icone, titre, sous]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                mode === m
                  ? m === 'tout' ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm' : 'bg-orange-50 border-orange-400 text-orange-800 shadow-sm'
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              <Icone className="w-5 h-5" />
              <span className="text-[11px] font-black uppercase">{titre}</span>
              <span className="text-[9px] font-bold opacity-70">{sous}</span>
            </button>
          ))}
        </div>

        {mode === 'partiel' && (
          <div className="bg-orange-50 p-3 rounded-xl border-2 border-dashed border-orange-300 space-y-2">
            {parLignes && rep ? (
              <>
                <p className="text-[9px] font-black text-orange-700 uppercase tracking-widest">Quantité expédiée par ligne</p>
                <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCollage(c => (c == null ? '' : null))}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Coller un tableau (packing details, Excel)</span>
                  </button>
                  {collage != null && (
                    <div className="px-3 pb-3 space-y-2">
                      <Textarea
                        placeholder={'A501\t800\nA726\t250\nBLACK\t1000'}
                        value={collage}
                        onChange={e => lireCollage(e.target.value)}
                        rows={4}
                        className="text-[11px] font-mono border-orange-200 bg-orange-50/50 resize-none"
                      />
                      {resultatCollage && (
                        <div className="flex items-center gap-2 flex-wrap text-[9px] font-black">
                          {resultatCollage.trouves > 0 && (
                            <span className="text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> {resultatCollage.trouves} ligne{resultatCollage.trouves > 1 ? 's' : ''} remplie{resultatCollage.trouves > 1 ? 's' : ''}
                            </span>
                          )}
                          {resultatCollage.inconnus.length > 0 && (
                            <span className="text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              Absent{resultatCollage.inconnus.length > 1 ? 's' : ''} de la commande : {resultatCollage.inconnus.slice(0, 6).join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {rep.lignes.map((l, i) => {
                    const max = Number(l[rep.qte]) || 0;
                    const v = parLigne[i] || '';
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-1 rounded-xl border ${lireSaisie(v) ? 'bg-orange-100 border-orange-400' : 'bg-white border-stone-200'}`}>
                        <span className="text-[10px] font-black uppercase w-28 truncate" title={libelleLigne(rep, l)}>{libelleLigne(rep, l) || `Ligne ${i + 1}`}</span>
                        <Input
                          inputMode="decimal"
                          value={v}
                          onChange={e => setParLigne(p => p.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder="0"
                          className="h-8 border-orange-200 bg-white font-bold rounded-lg flex-1 text-right"
                        />
                        <button type="button" onClick={() => setParLigne(p => p.map((x, j) => (j === i ? String(max) : x)))} className="text-[9px] text-stone-400 hover:text-orange-700 font-bold w-16 text-right" title="Toute la ligne">
                          / {fmt(max)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-[9px] font-black text-orange-700 uppercase tracking-widest">Quantité expédiée (sur {fmt(qteArticle)} {unite})</p>
                <div className="flex items-center gap-2">
                  <Input inputMode="decimal" value={quantite} onChange={e => setQuantite(e.target.value)} placeholder="Ex : 500" className="h-10 border-orange-200 bg-white font-bold rounded-xl flex-1" />
                  <span className="text-[10px] font-bold text-orange-700">{unite}</span>
                </div>
              </>
            )}
            {qteEnvoyee > 0 && (
              <div className="flex gap-4 pt-2 border-t border-orange-200 text-[10px]">
                <span><b className="text-blue-700 uppercase">Transit :</b> {fmt(qteEnvoyee)} {unite}</span>
                <span><b className="text-amber-700 uppercase">Reste en production :</b> {fmt(qteRestante)} {unite}</span>
              </div>
            )}
          </div>
        )}

        {/* Poids net et volume du packing list */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Scale className="w-3 h-3" /> N.W. — poids net (kg)</Label>
            <Input inputMode="decimal" value={poids} onChange={e => setPoids(e.target.value)} placeholder={poidsEstime != null ? `Estimé ${fmt(poidsEstime, 2)}` : 'Ex : 494'} className="font-bold" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Box className="w-3 h-3" /> CBM — volume (m³)</Label>
            <Input inputMode="decimal" value={volume} onChange={e => setVolume(e.target.value)} placeholder={volumeEstime != null ? `Estimé ${fmt(volumeEstime)}` : 'Ex : 2,5'} className="font-bold" />
          </div>
          <p className="col-span-2 text-[10px] text-stone-400 -mt-1">
            Totaux de la part expédiée, lus sur le packing list. Vide : l'estimation de la fiche est gardée{mode === 'partiel' ? ' au prorata' : ''}.
          </p>
        </div>

        {/* Le dossier */}
        {!dossier && (
          <div className="space-y-3">
            {dossiersRecents.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Dossier existant</Label>
                {dossiersRecents.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => choisirFacture(f.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left ${
                      factureId === f.id ? 'bg-blue-50 border-blue-400' : 'bg-stone-50 border-stone-200 hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Ship className={`w-3.5 h-3.5 shrink-0 ${factureId === f.id ? 'text-blue-500' : 'text-stone-400'}`} />
                      <span className="text-[11px] font-black uppercase truncate">{f.id}</span>
                      <span className="text-[9px] font-bold text-stone-400">{f.arrivalDate || 'date non définie'}</span>
                    </span>
                    {factureId === f.id && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label className="font-bold text-stone-800">Ou le n° de facture / conteneur</Label>
              <Input value={factureId} onChange={e => choisirFacture(e.target.value)} className="uppercase font-bold border-blue-200" placeholder="Ex : 26HD1004" />
            </div>
            <div className="space-y-1">
              <Label className="text-blue-700 font-bold flex items-center gap-1"><CalendarDays className="w-4 h-4" /> Date d'arrivée prévue</Label>
              <Input type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} className="bg-blue-50 border-blue-200 font-bold" />
            </div>
          </div>
        )}
        {dossier && !dossier.arrivalDate && (
          <div className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-bold flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Ce dossier n'a pas de date d'arrivée : renseigne-la dans « Paramétrer le dossier ».
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" disabled={envoi} onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            type="button"
            onClick={confirmer}
            disabled={envoi || !factureId.trim() || !arrivalDate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
          >
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
            Confirmer l'expédition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
