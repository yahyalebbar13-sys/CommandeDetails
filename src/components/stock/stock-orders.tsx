"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { LOGO_B64 } from '@/lib/logo-b64';
import { useToast } from '@/hooks/use-toast';
import { imprimerHtml, messageImpression, echapperHtml } from '@/lib/impression';
import { valeurImprimable } from '@/lib/specification-produit';
import { Search, Eye, ArrowRight, Printer, X, CheckCircle2, Tag, Loader2 } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { sansPrix, lignesSansPrix, attendUnPrix, appliquerPrix } from '@/lib/commande-sans-prix';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SaleOrder, SaleOrderStatus, Client, Invoice } from '@/lib/types';

interface StockOrdersProps {
  orders: SaleOrder[];
  clients: Client[];
  onUpdateStatus: (id: string, status: SaleOrderStatus) => Promise<void>;
  onConvertToInvoice: (order: SaleOrder) => Promise<void>;
  /**
   * Enregistre les prix saisis après coup sur un bon de commande. Une commande peut se prendre
   * sans prix — le client négocie, la direction tranchera — et c'est ici qu'elle en reçoit un.
   */
  onUpdateOrderPrices?: (id: string, items: any[], totalAmount: number, totalAfterDiscount: number) => Promise<void>;
  onNavigate: (v: any) => void;
}

const fmt$ = (n: number) => n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<SaleOrderStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Brouillon',  cls: 'bg-stone-100 text-stone-500 border-stone-200' },
  CONFIRMED: { label: 'Confirmé',   cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  INVOICED:  { label: 'Facturé',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Annulé',     cls: 'bg-red-100 text-red-600 border-red-200' },
};

export default function StockOrders({ orders, clients, onUpdateStatus, onConvertToInvoice, onUpdateOrderPrices, onNavigate }: StockOrdersProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [search, setSearch] = useState('');
  // On garde l'IDENTIFIANT, pas la commande : une photo prise a l'ouverture continuerait
  // d'afficher les anciens prix apres enregistrement, et les reecrirait a la sauvegarde
  // suivante si une autre caisse y avait touche entre-temps.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  /** Le filtre « il manque un prix », posé depuis le rappel en haut de page. */
  const [sansPrixSeulement, setSansPrixSeulement] = useState(false);
  /** Les prix en cours de saisie dans la fenêtre de détail : clé = rang de la ligne. */
  const [prixSaisis, setPrixSaisis] = useState<Record<number, string>>({});
  const [enregistrementPrix, setEnregistrementPrix] = useState(false);

  const months = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => o.date && s.add(o.date.substring(0, 7)));
    return Array.from(s).sort().reverse();
  }, [orders]);

  const filtered = useMemo(() => {
    let r = [...orders].sort((a, b) => b.date.localeCompare(a.date));
    if (filterStatus !== 'all') r = r.filter(o => o.status === filterStatus);
    if (filterMonth !== 'all') r = r.filter(o => o.date.startsWith(filterMonth));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(o => o.clientName?.toLowerCase().includes(q) || o.notes?.toLowerCase().includes(q));
    }
    if (sansPrixSeulement) r = r.filter(attendUnPrix);
    return r;
  }, [orders, filterStatus, filterMonth, search, sansPrixSeulement]);

  // Quand la derniere commande recoit son prix, le bandeau disparait — et avec lui le bouton qui
  // permettait de relacher le filtre. L'ecran restait vide, sans issue visible.
  useEffect(() => {
    if (sansPrixSeulement && orders.every(o => !attendUnPrix(o))) setSansPrixSeulement(false);
  }, [orders, sansPrixSeulement]);

  const totalAmount = filtered.reduce((s, o) => s + o.totalAfterDiscount, 0);

  /** Le rappel : les commandes qui attendent encore leur prix de vente. */
  const enAttenteDePrix = useMemo(() => orders.filter(attendUnPrix), [orders]);

  const orderNumber = (order: SaleOrder, _index: number) => {
    // Use persisted orderNumber if available, otherwise generate from creation order
    if ((order as any).orderNumber) return (order as any).orderNumber;
    // Fallback: stable number based on sorted position in the full (unfiltered) list
    const sortedAll = [...orders].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    const pos = sortedAll.findIndex(o => o.id === order.id) + 1;
    return `BC-${String(pos).padStart(4, '0')}`;
  };

  const handleConvert = async (order: SaleOrder): Promise<boolean> => {
    // Facturer une commande sans prix crée une facture à zéro : pas de créance, pas
    // d'encaissement à attendre, et une marchandise sortie du stock pour rien. Ce n'est plus un
    // refus — c'est une question, à laquelle on peut répondre oui en connaissance de cause.
    const manquants = lignesSansPrix(order);
    if (manquants > 0) {
      const perdu = Math.max(0, Number(order.totalAfterDiscount) || 0);
      const ok = await confirm({
        title: 'Prix de vente manquant',
        description: `${manquants === 1 ? "Une ligne n'a pas de prix" : `${manquants} lignes n'ont pas de prix`}.\n\n`
          + (perdu > 0
            ? `La facture ne portera que ${fmt$(perdu)} MAD : les lignes non chiffrées partiront à zéro, `
              + 'et la marchandise sortira quand même du stock.\n\n'
            : 'La facture partira à 0 MAD : rien ne sera dû par le client, et la marchandise sortira '
              + 'quand même du stock.\n\n')
          + 'Une fois facturée, la commande ne peut plus recevoir de prix. Saisissez-les d\'abord, '
          + 'ou facturez quand même.',
        confirmLabel: 'Facturer quand même',
        variant: 'destructive',
      });
      if (!ok) return false;
    }
    setConverting(order.id);
    try { await onConvertToInvoice(order); return true; }
    finally { setConverting(null); }
  };

  /**
   * Facturer depuis la fenêtre de détail.
   *
   * Des prix tapés et non enregistrés seraient perdus sans un mot, et la facture partirait avec
   * les anciens : on les enregistre d'abord. Et la fenêtre ne se referme qu'une fois la question
   * posée — la fermer tout de suite effaçait la saisie pendant que la confirmation s'affichait.
   */
  const handleConvertDepuisDetail = async () => {
    if (!selected) return;
    const commande = selected;
    if (prixModifies && onUpdateOrderPrices) {
      const ok = await confirm({
        title: 'Prix non enregistrés',
        description: 'Vous avez saisi des prix sans les enregistrer.\n\n'
          + 'Ils seront enregistrés sur la commande avant la facturation.',
        confirmLabel: 'Enregistrer puis facturer',
      });
      if (!ok) return;
      const { items, totalAmount, totalAfterDiscount } =
        appliquerPrix(commande.items || [], prixSaisis, commande.discount);
      await onUpdateOrderPrices(commande.id, items, totalAmount, totalAfterDiscount);
      setPrixSaisis({});
      if (await handleConvert({ ...commande, items, totalAmount, totalAfterDiscount } as SaleOrder)) {
        setSelectedId(null);
      }
      return;
    }
    if (await handleConvert(commande)) setSelectedId(null);
  };

  /**
   * Fermer la fenetre de detail. Des prix tapes et non enregistres seraient perdus sans un mot :
   * on demande avant de les jeter.
   */
  const fermerDetail = async () => {
    if (prixModifies) {
      const ok = await confirm({
        title: 'Prix non enregistrés',
        description: 'Des prix ont été saisis sans être enregistrés.\n\nFermer maintenant les efface.',
        confirmLabel: 'Fermer sans enregistrer',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    setSelectedId(null);
    setPrixSaisis({});
  };

  /**
   * Enregistre les prix saisis à la main sur un bon de commande.
   *
   * Les totaux sont recalculés d'ici : la remise en pourcentage est conservée telle quelle, elle
   * s'applique au nouveau sous-total. Une ligne laissée vide reste sans prix — on ne force
   * personne, la commande continuera simplement de se rappeler.
   */
  const handleEnregistrerPrix = async () => {
    if (!selected || !onUpdateOrderPrices) return;
    // On repart de la commande TELLE QU'ELLE EST EN BASE, pas de la copie ouverte il y a cinq
    // minutes : entre-temps, une autre caisse a pu la modifier, et on reecrirait tout le tableau
    // des lignes avec un etat perime.
    const vivante = orders.find(o => o.id === selected.id) || selected;
    const { items, totalAmount, totalAfterDiscount, restantSansPrix } =
      appliquerPrix(vivante.items || [], prixSaisis, vivante.discount);

    setEnregistrementPrix(true);
    try {
      await onUpdateOrderPrices(selected.id, items, totalAmount, totalAfterDiscount);
      const restants = restantSansPrix;
      toast({
        title: 'Prix enregistrés',
        description: restants > 0
          ? `${restants} ligne(s) attendent encore leur prix.`
          : 'La commande est complète : elle peut être facturée.',
      });
      // La fenetre reste ouverte : elle affiche desormais les prix enregistres, relus en base.
      setPrixSaisis({});
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: `Impossible d'enregistrer les prix : ${err?.message || err}` });
    } finally {
      setEnregistrementPrix(false);
    }
  };

  /** Le prix affiché dans la fenêtre de détail : ce qui est tapé, sinon ce qui est enregistré. */
  const prixDeLaLigne = (item: any, i: number) =>
    prixSaisis[i] !== undefined ? prixSaisis[i] : (Number(item.unitPrice) > 0 ? String(item.unitPrice) : '');

  /** Les totaux tels qu'ils seraient si l'on enregistrait maintenant. */
  const selected = useMemo(() => orders.find(o => o.id === selectedId) || null, [orders, selectedId]);
  const apercu = appliquerPrix(selected?.items || [], prixSaisis, selected?.discount);

  const modifiable = selected ? (selected.status !== 'INVOICED' && selected.status !== 'CANCELLED' && !!onUpdateOrderPrices) : false;
  const prixModifies = Object.keys(prixSaisis).length > 0;

  const printOrder = (order: SaleOrder) => {
    try {
      construireEtImprimerBon(order);
    } catch (e: any) {
      // La construction du document peut lever sur une donnée inattendue : sans ce garde,
      // l'exception partait avant l'impression et le clic restait muet.
      console.error('[bon de commande] impression impossible :', e);
      toast({ variant: 'destructive', title: 'Impression impossible', description: messageImpression(e) });
    }
  };

  const construireEtImprimerBon = (order: SaleOrder) => {
    const num = orderNumber(order, 0);
    const discountAmt = Math.max(0, (order.totalAmount || 0) - (order.totalAfterDiscount || 0));
    const html = (`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${echapperHtml(num)}</title>
    <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#1c1917}
    h1{font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-0.05em}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #1c1917;padding-bottom:20px;margin-bottom:20px}
    .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#78716c;padding:8px;border-bottom:1px solid #e7e5e4}
    td{padding:10px 8px;border-bottom:1px solid #f5f5f4;font-size:12px}
    .total{text-align:right;font-size:18px;font-weight:900;color:#4c1d95}
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#a8a29e}
    </style></head><body>
    <div class="header">
      <div>
        <img src="${LOGO_B64}" alt="LEBTEX" style="height: 120px; margin-bottom: 15px; display: block;" />
        <div class="label">Bon de Commande</div>
        <h1>${echapperHtml(num)}</h1>
      </div>
      <div style="text-align:right"><div class="label">Date</div><strong>${echapperHtml(order.date)}</strong><br>
      <div class="label" style="margin-top:8px">Client</div><strong>${echapperHtml(order.clientName || 'Anonyme')}</strong></div>
    </div>
    <table><thead><tr><th>Produit</th><th>Couleur</th><th>Taille</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
    <tbody>${(order.items || []).map(i => `<tr>
      <td><strong>${echapperHtml(i.productName)}</strong></td><td>${echapperHtml(valeurImprimable(i.color, '—'))}</td><td>${echapperHtml(valeurImprimable(i.size, '—'))}</td>
      <td>${echapperHtml(i.qty)} ${echapperHtml(i.unitOfMeasure)}</td>
      <td>${sansPrix(i) ? '<em style="color:#a16207">à fixer</em>' : fmt$(i.unitPrice)}</td>
      <td>${sansPrix(i) ? '<em style="color:#a16207">—</em>' : fmt$(i.totalPrice)}</td>
    </tr>`).join('')}</tbody></table>
    <div style="text-align:right">
      ${discountAmt > 0 ? `<div style="color:#78716c;margin-bottom:4px">Remise${order.discount ? ` (${order.discount}%)` : ''}: -${fmt$(discountAmt)}</div>` : ''}
      <div class="total">Total: ${fmt$(order.totalAfterDiscount)}</div>
      ${lignesSansPrix(order) > 0 ? `<div style="color:#a16207;font-size:11px;font-weight:700;margin-top:6px">
        Total partiel : ${lignesSansPrix(order)} ligne(s) restent à chiffrer.
      </div>` : ''}
    </div>
    ${order.notes ? `<div style="margin-top:20px;padding:12px;background:#f5f5f4;border-radius:8px"><div class="label">Notes</div><p>${echapperHtml(order.notes)}</p></div>` : ''}
    <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')}</div>
    </body></html>`);
    imprimerHtml(html).catch(e => toast({
      variant: 'destructive',
      title: "Impression impossible",
      description: messageImpression(e),
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-stone-400 uppercase tracking-[0.3em] mb-1">Ventes</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Bons de <span className="text-stone-400">Commande</span></h1>
            <p className="text-stone-500 text-xs font-bold mt-2">{orders.length} BC · Total : {fmt$(totalAmount)}</p>
          </div>
          <Button onClick={() => onNavigate('sale')}
            className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-[10px] tracking-widest px-6 h-11 rounded-2xl gap-2 border border-white/20 shrink-0">
            + Nouvelle vente
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input placeholder="Rechercher client, notes..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl border-stone-200 text-sm font-bold" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 w-40 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="DRAFT">Brouillon</SelectItem>
            <SelectItem value="CONFIRMED">Confirmé</SelectItem>
            <SelectItem value="INVOICED">Facturé</SelectItem>
            <SelectItem value="CANCELLED">Annulé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="h-10 w-36 rounded-xl border-stone-200 font-bold text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute période</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Le rappel : des commandes attendent leur prix ──
          Une commande peut se prendre sans prix, c'est voulu. Ce bandeau est ce qui empêche
          qu'on l'oublie : il reste là tant qu'une commande vivante n'a pas son prix. */}
      {enAttenteDePrix.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-amber-300 bg-amber-50 shadow-sm">
          <Tag className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-amber-900 uppercase tracking-wide">
              {enAttenteDePrix.length === 1
                ? 'Une commande attend son prix de vente'
                : `${enAttenteDePrix.length} commandes attendent leur prix de vente`}
            </p>
            <p className="text-[11px] font-medium text-amber-800 leading-snug mt-0.5">
              Ouvrez la commande, saisissez les prix, enregistrez. Tant qu'un prix manque, la
              facturer produirait une facture à 0 MAD.
            </p>
          </div>
          <Button
            type="button"
            variant={sansPrixSeulement ? 'default' : 'outline'}
            onClick={() => setSansPrixSeulement(v => !v)}
            className={`shrink-0 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest ${
              sansPrixSeulement ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-amber-300 text-amber-800 hover:bg-amber-100'
            }`}
          >
            {sansPrixSeulement ? 'Voir toutes les commandes' : 'Voir celles-ci'}
          </Button>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-stone-300 font-black uppercase text-[10px] py-16">Aucun bon de commande</p>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['N° BC', 'Date', 'Client', 'Articles', 'Total', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-stone-400 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map((order, i) => {
                  const num = orderNumber(order, i);
                  const badge = STATUS_BADGE[order.status];
                  return (
                    <tr key={order.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-black text-stone-700">{num}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{order.date}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-800">{order.clientName || 'Anonyme'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{order.items.length} art.</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">
                        {!attendUnPrix(order)
                          ? fmt$(order.totalAfterDiscount)
                          : (Number(order.totalAfterDiscount) || 0) > 0
                            ? <span className="text-amber-700">{fmt$(order.totalAfterDiscount)} <span className="font-bold">+ à chiffrer</span></span>
                            : <span className="text-amber-700">à chiffrer</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.cls}`}>{badge.label}</span>
                          {attendUnPrix(order) && (
                            <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-lg border bg-amber-100 text-amber-700 border-amber-200">
                              Prix à saisir
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setPrixSaisis({}); setSelectedId(order.id); }} title="Voir"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors">
                            <Eye className="w-3 h-3" />
                          </button>
                          <button onClick={() => printOrder(order)} title="Imprimer"
                            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors">
                            <Printer className="w-3 h-3" />
                          </button>
                          {order.status === 'CONFIRMED' && (
                            <button onClick={() => handleConvert(order)} disabled={converting === order.id} title="Convertir en facture"
                              className="w-7 h-7 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 flex items-center justify-center transition-colors">
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          {order.status !== 'INVOICED' && order.status !== 'CANCELLED' && (
                            <button onClick={() => onUpdateStatus(order.id, 'CANCELLED')} title="Annuler"
                              className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
              <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">{filtered.length} BC</span>
              <span className="text-[10px] font-black text-stone-700">Total filtré : {fmt$(totalAmount)}</span>
            </div>
          </>
        )}
      </div>

      {/* Modal détail */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) fermerDetail(); }}>
        <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-r from-stone-900 to-stone-800 p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">
              {selected ? orderNumber(selected, 0) : ''}
            </DialogTitle>
            <p className="text-[10px] font-bold text-stone-400 mt-1">
              {selected?.date} · {selected?.clientName || 'Anonyme'} · {selected?.items.length} article(s)
            </p>
          </div>
          <div className="overflow-y-auto flex-1 bg-white">
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Produit', 'Couleur', 'Taille', 'Qté', 'Prix unit.', 'Total'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-stone-400">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {selected?.items.map((item, i) => {
                  const tape = prixDeLaLigne(item, i);
                  const prix = Number(String(tape).replace(',', '.')) || 0;
                  return (
                    <tr key={i} className={sansPrix(item) && !prix ? 'bg-amber-50/50' : undefined}>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-800">{item.productName}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.color || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-stone-500">{item.size || '—'}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">{item.qty} {item.unitOfMeasure}</td>
                      <td className="px-4 py-2">
                        {modifiable ? (
                          // Le prix se saisit ici, après coup : c'est tout l'objet de l'écran.
                          <div className="relative w-28">
                            <Input
                              type="text" inputMode="decimal"
                              value={tape}
                              onChange={e => setPrixSaisis(p => ({ ...p, [i]: e.target.value }))}
                              placeholder="à saisir"
                              aria-label={`Prix unitaire — ${item.productName}`}
                              className={`h-9 pr-11 text-[11px] font-bold rounded-xl ${
                                prix > 0 ? 'border-stone-200' : 'border-amber-300 bg-amber-50/60'
                              }`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-stone-400">MAD</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-stone-600">{fmt$(item.unitPrice)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-stone-900">
                        {prix > 0 ? fmt$(prix * (Number(item.qty) || 0)) : <span className="text-amber-700">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Les totaux suivent ce qui est tape : sans cela, le pied contredirait les lignes
                juste au-dessus tant que la saisie n'est pas enregistree. */}
            <div className="p-5 border-t border-stone-100 space-y-1 text-right">
              <p className="text-[10px] font-bold text-stone-500">Sous-total : {fmt$(apercu.totalAmount)}</p>
              {(selected?.discount || 0) > 0 && <p className="text-[10px] font-bold text-emerald-600">Remise {selected?.discount}% : -{fmt$(apercu.totalAmount - apercu.totalAfterDiscount)}</p>}
              <p className="text-xl font-black text-stone-900">Total : {fmt$(apercu.totalAfterDiscount)}</p>
              {apercu.restantSansPrix > 0 && (
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-wide">
                  {apercu.restantSansPrix} ligne(s) sans prix
                </p>
              )}
            </div>
          </div>
          <div className="p-4 bg-stone-50 flex gap-2 shrink-0 flex-wrap">
            <Button variant="ghost" onClick={() => selected && printOrder(selected)} className="gap-2 font-black uppercase text-[10px] rounded-xl">
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </Button>
            {modifiable && (
              <Button
                onClick={handleEnregistrerPrix}
                disabled={!prixModifies || enregistrementPrix}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2 disabled:opacity-40"
              >
                {enregistrementPrix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                {enregistrementPrix ? 'Enregistrement…' : 'Enregistrer les prix'}
              </Button>
            )}
            {selected?.status === 'CONFIRMED' && (
              <Button onClick={handleConvertDepuisDetail}
                className="bg-violet-600 hover:bg-violet-700 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2">
                <ArrowRight className="w-3.5 h-3.5" /> Convertir en Facture
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
