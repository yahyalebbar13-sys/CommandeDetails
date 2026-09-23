'use client';

// ─── Briques communes des formulaires de pôle ─────────────────────────────────
// Tous les formulaires qui créent ou modifient un pôle passent par ici, pour
// qu'une seule règle s'applique partout : on choisit la LIGNE, et les
// spécifications qualités suivent (cf. lib/lignes-logistiques.ts) ; on peut
// fixer l'unité d'achat et l'unité de vente du pôle (cf. lib/unites-pole.ts).

import React from 'react';
import { Lock, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LIBELLE_SPEC, SPEC_TYPES, couleurDeLigne, trouverLigne,
  type LigneLogistique, type SpecType,
} from '@/lib/lignes-logistiques';
import { LIBELLE_UNITE, UNITES } from '@/lib/unites-pole';

/** Pastille « 🧵 Fabric » d'une spécification. */
export function BadgeSpec({ specType, suffixe }: { specType?: SpecType | null; suffixe?: string }) {
  const s = LIBELLE_SPEC[specType || 'none'];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[9px] font-black uppercase tracking-widest text-stone-700">
      {s.emoji} {s.label}{suffixe ? <span className="normal-case font-bold text-stone-400"> · {suffixe}</span> : null}
    </span>
  );
}

/** La valeur saisie désigne-t-elle une ligne qui n'existe pas encore ? */
export function estNouvelleLigne(lignes: LigneLogistique[], nom?: string | null): boolean {
  return Boolean((nom || '').trim()) && !trouverLigne(lignes, nom);
}

/** Choix des spécifications d'une ligne (création ou modification de la ligne). */
export function ChoixSpec({ valeur, onChange }: { valeur: SpecType | null | undefined; onChange: (s: SpecType) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {SPEC_TYPES.map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`p-2.5 rounded-xl border-2 text-left transition-all ${
            valeur === s ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-stone-100 hover:border-stone-200 text-stone-500 bg-white'
          }`}
        >
          <span className="text-[10px] block uppercase font-black">{LIBELLE_SPEC[s].emoji} {LIBELLE_SPEC[s].label}</span>
          <span className="text-[8px] text-stone-400 block font-bold leading-tight mt-0.5">{LIBELLE_SPEC[s].detail}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Choix de la ligne d'un pôle. Les spécifications ne se choisissent pas ici :
 * elles sont celles de la ligne. Seule une NOUVELLE ligne demande les siennes
 * (obligatoire) — elles vaudront ensuite pour tous ses pôles.
 */
export function ChoixLigne({
  lignes, valeur, onChange, specNouvelleLigne, onSpecNouvelleLigne,
}: {
  lignes: LigneLogistique[];
  valeur: string;
  onChange: (nom: string) => void;
  specNouvelleLigne: SpecType | null;
  onSpecNouvelleLigne: (s: SpecType) => void;
}) {
  const choisie = trouverLigne(lignes, valeur);
  const nouvelle = estNouvelleLigne(lignes, valeur);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {lignes.map(l => {
          const active = choisie?.nom === l.nom;
          return (
            <button
              key={l.nom}
              type="button"
              onClick={() => onChange(l.nom)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${active ? 'border-stone-900 bg-stone-50' : 'border-stone-100 hover:border-stone-200'}`}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.couleur }} />
              <span className="text-[10px] font-black uppercase text-stone-700 truncate">{l.nom}</span>
              <span className="ml-auto text-[9px] font-bold text-stone-400 shrink-0">
                {LIBELLE_SPEC[l.specType].emoji} {LIBELLE_SPEC[l.specType].label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
          <Plus className="w-3 h-3" /> Ou créer une nouvelle ligne
        </label>
        <Input
          placeholder="EX: ÉLASTIQUES, ÉTIQUETTES…"
          value={nouvelle ? valeur : ''}
          onChange={e => onChange(e.target.value)}
          className="h-10 uppercase font-bold border-stone-200 rounded-xl text-xs"
        />
      </div>

      {nouvelle ? (
        <div className="space-y-1.5 p-3 rounded-xl border-2 border-amber-200 bg-amber-50/40">
          <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest">
            Spécifications Qualités de la ligne « {valeur.trim().toUpperCase()} » <span className="text-red-600">*</span>
          </p>
          <p className="text-[10px] font-medium text-amber-800/80">
            Elles vaudront pour tous les pôles de cette ligne, et pour leurs catégories.
          </p>
          <ChoixSpec valeur={specNouvelleLigne} onChange={onSpecNouvelleLigne} />
        </div>
      ) : choisie ? (
        <p className="flex items-center gap-2 text-[10px] font-bold text-stone-500">
          <Lock className="w-3 h-3" /> Spécifications qualités :
          <BadgeSpec specType={choisie.specType} suffixe={`données par la ligne ${choisie.nom}`} />
        </p>
      ) : null}
    </div>
  );
}

const LIBRE = '__libre';

/** Unités d'achat et de vente du pôle. Vides = choix libre à chaque saisie. */
export function ChampsUnitesPole({
  uniteAchat, uniteVente, onChange,
}: {
  uniteAchat?: string;
  uniteVente?: string;
  onChange: (u: { uniteAchat?: string; uniteVente?: string }) => void;
}) {
  const champ = (libelle: string, valeur: string | undefined, maj: (v: string | undefined) => void) => (
    <div className="space-y-1.5">
      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{libelle}</label>
      <Select value={valeur || LIBRE} onValueChange={v => maj(v === LIBRE ? undefined : v)}>
        <SelectTrigger className="h-10 rounded-xl border-stone-200 text-xs font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LIBRE}>Libre (au choix à chaque saisie)</SelectItem>
          {UNITES.map(u => <SelectItem key={u} value={u}>{LIBELLE_UNITE[u] || u}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const differentes = Boolean(uniteAchat && uniteVente && uniteAchat !== uniteVente);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {champ("Unité d'achat", uniteAchat, v => onChange({ uniteAchat: v, uniteVente }))}
        {champ('Unité de vente', uniteVente, v => onChange({ uniteAchat, uniteVente: v }))}
      </div>
      <p className="text-[10px] font-medium text-stone-500 leading-relaxed">
        Une unité fixée devient obligatoire dans les formulaires : commandes et achats au marché pour
        l'achat ; caisse, factures, transferts, inventaire et mouvements pour la vente et le stock.
      </p>
      {differentes && (
        <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
          Achat en {LIBELLE_UNITE[uniteAchat!] || uniteAchat}, vente en {LIBELLE_UNITE[uniteVente!] || uniteVente} :
          rien n'est converti — le stock reste compté en {LIBELLE_UNITE[uniteAchat!] || uniteAchat}, et le rapport
          entre les deux vient des qualités du produit (mètres par rouleau, pièces par sac…).
        </p>
      )}
    </div>
  );
}

/** Pastille de couleur d'une ligne, pour les listes. */
export function PastilleLigne({ nom }: { nom: string }) {
  return <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: couleurDeLigne(nom) }} />;
}
