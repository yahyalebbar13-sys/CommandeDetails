'use client';

import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Printer, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ErreurScan,
  lireEtatScanner,
  reduireImage,
  retournerImage,
  scannerAvecImprimante,
  type EtatScanner,
} from '@/lib/scan-piece';

function nomPiece(methode: string): { le: string; du: string } {
  switch (String(methode).toUpperCase()) {
    case 'CHEQUE': return { le: 'le chèque', du: 'du chèque' };
    case 'LC':
    case 'LCN': return { le: 'la LC', du: 'de la LC' };
    case 'TRAITE': return { le: 'la traite', du: 'de la traite' };
    default: return { le: "l'effet", du: "de l'effet" };
  }
}

type Travail = 'scan' | 'photo' | 'retourner';

/**
 * L'image de la pièce remise (chèque, LC, effet) : scannée par l'imprimante en un clic, ou prise en
 * photo. La même à la caisse, au règlement d'un client et au paiement d'une facture.
 */
export function ScanPiece({
  methode,
  image,
  onImage,
}: {
  methode: string;
  image?: string;
  /** Reçoit l'image en data URL JPEG, ou '' quand on la retire. */
  onImage: (image: string) => void;
}) {
  const [etat, setEtat] = useState<EtatScanner | null>(null);
  const [travail, setTravail] = useState<Travail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [agrandie, setAgrandie] = useState(false);
  const piece = nomPiece(methode);

  // L'état du scanner ne sert qu'avant le scan : inutile de le demander une fois l'image jointe.
  useEffect(() => {
    if (image) return;
    let actif = true;
    lireEtatScanner().then(e => { if (actif) setEtat(e); });
    return () => { actif = false; };
  }, [image]);

  const executer = async (tache: Travail, action: () => Promise<string>) => {
    setErreur(null);
    setTravail(tache);
    try {
      onImage(await action());
    } catch (e) {
      setErreur(e instanceof ErreurScan ? e.message : "L'image n'a pas pu être jointe. Réessayez.");
      if (tache === 'scan') lireEtatScanner().then(setEtat);
    } finally {
      setTravail(null);
    }
  };

  if (image) {
    return (
      <div className="rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAgrandie(a => !a)}
            title={agrandie ? "Réduire l'image" : "Agrandir l'image"}
            className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <img
              src={image}
              alt={`Image ${piece.du}`}
              className="w-24 h-12 rounded-lg object-contain bg-white border border-emerald-200 shadow-sm"
            />
          </button>
          <div className="flex-1 min-w-[10rem]">
            <div className="flex items-center gap-1.5 text-emerald-700 font-black text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Image jointe au règlement</span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium">
              Vérifiez qu'on y lit le montant et le numéro : c'est la preuve si la pièce revient impayée.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!travail}
              onClick={() => executer('retourner', () => retournerImage(image))}
              className="h-8 text-[11px] font-black rounded-lg text-stone-600"
            >
              {travail === 'retourner'
                ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                : <RotateCw className="w-3.5 h-3.5 mr-1" />}
              Retourner
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!travail}
              onClick={() => { setErreur(null); setAgrandie(false); onImage(''); }}
              className="h-8 text-[11px] font-black rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Reprendre
            </Button>
          </div>
        </div>
        {agrandie && (
          <img
            src={image}
            alt={`Image ${piece.du}, en grand`}
            className="w-full max-h-80 object-contain rounded-lg bg-white border border-emerald-200"
          />
        )}
        {erreur && <p role="alert" className="text-[11px] font-bold text-red-700">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/50 p-3 space-y-2.5">
      <p className="text-[11px] font-medium text-stone-600">
        Posez {piece.le} face contre la vitre, dans le coin marqué d'une flèche, puis cliquez sur « Scanner ».
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          onClick={() => executer('scan', scannerAvecImprimante)}
          disabled={!!travail}
          className="flex-1 h-11 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-black text-xs gap-2"
        >
          {travail === 'scan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          {travail === 'scan' ? 'Numérisation en cours…' : "Scanner avec l'imprimante"}
        </Button>
        <label
          className={`flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-xs font-black text-stone-700 hover:bg-stone-50 focus-within:ring-2 focus-within:ring-amber-500 ${
            travail ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
          }`}
        >
          {travail === 'photo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          Photo ou fichier
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={!!travail}
            onChange={e => {
              const fichier = e.target.files?.[0];
              e.target.value = ''; // reprendre le même fichier doit redéclencher le choix
              if (fichier) executer('photo', () => reduireImage(fichier));
            }}
          />
        </label>
      </div>
      {erreur
        ? <p role="alert" className="text-[11px] font-bold text-red-700">{erreur}</p>
        : <EtatDuScanner etat={etat} />}
    </div>
  );
}

function EtatDuScanner({ etat }: { etat: EtatScanner | null }) {
  if (!etat) {
    return <p className="text-[11px] font-medium text-stone-400">Recherche du scanner…</p>;
  }
  if (etat.etat === 'pret') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
        Imprimante prête : {etat.scanner}
      </p>
    );
  }
  if (etat.etat === 'sans-scanner') {
    return (
      <p className="text-[11px] font-bold text-amber-800">
        L'imprimante ne répond pas : allumez-la et vérifiez son câble, puis cliquez sur « Scanner ».
      </p>
    );
  }
  return (
    <p className="text-[11px] font-medium text-stone-500">
      Scanner non détecté sur ce poste. Sans imprimante reliée, utilisez « Photo ou fichier ».
    </p>
  );
}
