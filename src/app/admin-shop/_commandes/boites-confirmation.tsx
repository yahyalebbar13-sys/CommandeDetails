'use client';

// ─── Confirmations avant un statut qu'on ne pose pas par erreur ──────────────
// Annulée (avec son motif, gardé pour soi), livrée, retournée — et la sortie
// d'un de ces statuts (« rouvrir »), que le client voit aussi dans son suivi.
// Radix directement plutôt que ui/alert-dialog : il faut passer au-dessus de la
// fiche plein écran du téléphone (z-60), et le thème de ui/ est clair.

import { useEffect, useId, useState, type ReactNode } from 'react';
import * as Boite from '@radix-ui/react-alert-dialog';
import type { OrderStatus, ShopOrder } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import { MOTIFS_ANNULATION, MESSAGE_CLIENT } from '@/lib/commandes-boutique';
import { estStatutFinal, statutLisible } from './outils-ecran';

const CLASSE_BOUTON_RETOUR =
  'h-11 px-4 rounded-xl border border-white/15 text-sm font-semibold text-gray-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60';

function Cadre({
  ouverte, onFermer, titre, description, children, pied,
}: {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  description: ReactNode;
  children?: ReactNode;
  pied: ReactNode;
}) {
  return (
    <Boite.Root open={ouverte} onOpenChange={o => { if (!o) onFermer(); }}>
      <Boite.Portal>
        <Boite.Overlay className="fixed inset-0 z-[80] bg-black/75 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Boite.Content
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] p-5 text-gray-100 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Boite.Title className="text-lg font-bold text-gray-100 leading-snug">{titre}</Boite.Title>
          <Boite.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-gray-300">{description}</div>
          </Boite.Description>
          {children}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boite.Cancel className={CLASSE_BOUTON_RETOUR}>Retour</Boite.Cancel>
            {pied}
          </div>
        </Boite.Content>
      </Boite.Portal>
    </Boite.Root>
  );
}

/** Annuler : on choisit pourquoi (gardé pour soi, le client ne voit que « Commande annulée »). */
export function BoiteAnnulation({
  commande, ouverte, onFermer, onConfirmer,
}: {
  commande: ShopOrder;
  ouverte: boolean;
  onFermer: () => void;
  onConfirmer: (motif: string) => void;
}) {
  const [motif, setMotif] = useState<string>('');
  const [precision, setPrecision] = useState('');
  const nomGroupe = useId();

  useEffect(() => {
    if (ouverte) { setMotif(''); setPrecision(''); }
  }, [ouverte]);

  const autre = motif === 'Autre';
  const texte = precision.trim();
  const valide = !!motif && (!autre || !!texte);
  // « Autre » : la précision est le motif. Sinon elle complète le motif choisi.
  const motifFinal = autre ? texte : texte ? `${motif} — ${texte}` : motif;

  return (
    <Cadre
      ouverte={ouverte}
      onFermer={onFermer}
      titre={`Annuler la commande ${commande.orderNumber} ?`}
      description={<>Le client verra seulement « {MESSAGE_CLIENT.cancelled} ». Le motif reste dans l’admin : il ne le voit pas.</>}
      pied={
        <Boite.Action
          disabled={!valide}
          onClick={() => onConfirmer(motifFinal)}
          className="h-11 px-4 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        >
          Annuler la commande
        </Boite.Action>
      }
    >
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-gray-200 mb-2">Pourquoi ?</legend>
        <div className="space-y-1.5">
          {MOTIFS_ANNULATION.map(m => (
            <label
              key={m}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm transition-colors ${
                motif === m ? 'border-red-500/60 bg-red-500/10 text-gray-100' : 'border-white/10 text-gray-200 hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name={`motif-${nomGroupe}`}
                value={m}
                checked={motif === m}
                onChange={() => setMotif(m)}
                className="h-4 w-4 accent-red-600"
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block">
        <span className="text-sm font-semibold text-gray-200">
          {autre ? 'Précisez le motif' : 'Précision (facultatif)'}
        </span>
        <textarea
          value={precision}
          onChange={e => setPrecision(e.target.value)}
          rows={2}
          maxLength={250}
          placeholder={autre ? 'Ex. : le client a commandé ailleurs' : 'Ex. : 3 appels sans réponse'}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-base sm:text-sm text-gray-100 placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
        />
      </label>
    </Cadre>
  );
}

type Textes = { titre: (o: ShopOrder) => string; description: (o: ShopOrder) => string; bouton: string };

const TEXTES_SENSIBLES: Partial<Record<OrderStatus, Textes>> = {
  delivered: {
    titre: o => `La commande ${o.orderNumber} est livrée et payée ?`,
    description: o => `À marquer seulement quand l’argent (${formatPrice(Number(o.total) || 0)}) est encaissé. Le client verra « ${MESSAGE_CLIENT.delivered} »`,
    bouton: 'Oui, livrée et payée',
  },
  returned: {
    titre: o => `La commande ${o.orderNumber} est revenue ?`,
    description: () => `À marquer quand le colis est de retour au dépôt. Le client verra « ${MESSAGE_CLIENT.returned} »`,
    bouton: 'Oui, colis revenu',
  },
};

/** Sortir d'un statut final : ce qui change pour l'argent et ce que le client lira. */
function textesReouverture(statut: OrderStatus): Textes {
  return {
    titre: o => `Rouvrir la commande ${o.orderNumber} ?`,
    description: o => [
      `Elle est « ${statutLisible(o.status)} » et repassera « ${statutLisible(statut)} ».`,
      o.status === 'delivered' ? `Son montant (${formatPrice(Number(o.total) || 0)}) sortira de « Encaissé ».` : '',
      `Le client verra dans son suivi : « ${MESSAGE_CLIENT[statut]} »`,
    ].filter(Boolean).join(' '),
    bouton: 'Oui, rouvrir',
  };
}

function textesPour(o: ShopOrder, statut: OrderStatus): Textes | undefined {
  // Livrée ou retournée demandée : la question propre à ce statut.
  if (TEXTES_SENSIBLES[statut]) return TEXTES_SENSIBLES[statut];
  if (estStatutFinal(o.status) && !estStatutFinal(statut)) return textesReouverture(statut);
  return undefined;
}

/** Livrée, retournée, ou commande rouverte : une question avant d'enregistrer. */
export function BoiteStatutSensible({
  commande, statut, onFermer, onConfirmer,
}: {
  commande: ShopOrder;
  statut: OrderStatus | null;
  onFermer: () => void;
  onConfirmer: (statut: OrderStatus) => void;
}) {
  const textes = statut ? textesPour(commande, statut) : undefined;
  return (
    <Cadre
      ouverte={!!statut && !!textes}
      onFermer={onFermer}
      titre={textes?.titre(commande) ?? ''}
      description={textes?.description(commande) ?? ''}
      pied={
        <Boite.Action
          onClick={() => statut && onConfirmer(statut)}
          className="h-11 px-4 rounded-xl bg-[#C8102E] text-sm font-bold text-white hover:bg-[#A50D26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          {textes?.bouton ?? 'Confirmer'}
        </Boite.Action>
      }
    />
  );
}
