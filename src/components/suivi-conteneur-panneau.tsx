"use client";

// ─── Panneau « Suivi du conteneur » du dossier d'arrivage ─────────────────────
// Montre où en est le conteneur d'après la compagnie maritime (via ShipsGo) et
// permet d'ouvrir le suivi. Rien n'est saisi à la main ensuite : le webhook
// ShipsGo — et le cron de nuit en rattrapage — corrigent la date d'arrivée du
// dossier, d'où le statut affiché découle déjà (cf. lib/status-utils.ts).
//
// Ouvrir un suivi coûte un crédit ShipsGo — le bouton le dit, et l'action reste
// volontaire. Relire est gratuit.
//
// Le suivi ne concerne que les arrivages attendus : un dossier entré en stock
// n'affiche rien, et un conteneur déjà arrivé sans suivi ne propose pas d'en
// ouvrir un.

import React, { useEffect, useRef, useState } from 'react';
import {
  Ship, Anchor, MapPin, RefreshCw, Loader2, AlertTriangle, CheckCircle2,
  CalendarClock, ExternalLink, Container, Radar, Mail, X, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';
import {
  LIBELLE_STATUT, auPortFinal, derniereEtape, dossierArrive, instantDe, prochaineEtape, type SuiviConteneur,
} from '@/lib/suivi-conteneur';
import type { Carte } from '@/lib/suivi-carte';
import SuiviCarte from './suivi-carte';

const formatJour = (iso?: string) => {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
};

const formatInstant = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const puce = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border';

/** Une étape du voyage, réelle (pleine) ou attendue (creuse). */
function Etape({ etape }: { etape: NonNullable<SuiviConteneur['etapes']>[number] }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex flex-col items-center pt-1">
        <span className={`w-2.5 h-2.5 rounded-full border-2 ${etape.reel ? 'bg-stone-900 border-stone-900' : 'bg-white border-stone-300'}`} />
      </span>
      <div className="min-w-0 pb-3">
        <p className={`text-[11px] font-black ${etape.reel ? 'text-stone-900' : 'text-stone-400'}`}>
          {etape.libelle}
          {!etape.reel && <span className="ml-2 text-[9px] font-bold text-stone-400 normal-case">prévu</span>}
        </p>
        <p className="text-[10px] font-bold text-stone-400">
          {formatJour(etape.date)}
          {etape.lieu ? ` · ${etape.lieu}` : ''}
          {etape.navire ? ` · ${etape.navire}` : ''}
          {etape.voyage ? ` (${etape.voyage})` : ''}
        </p>
      </div>
    </li>
  );
}

export default function SuiviConteneurPanneau({
  facture,
  verrouille = false,
}: {
  facture: any;
  /** Dossier fermé au suivi (entré en stock, conteneur arrivé — cf. dossierVerrouille) : le panneau disparaît. */
  verrouille?: boolean;
}) {
  const { toast } = useToast();
  const suivi: SuiviConteneur | undefined = facture?.suivi;
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [changementNumero, setChangementNumero] = useState(false);
  const [toutesEtapes, setToutesEtapes] = useState(false);
  const [carte, setCarte] = useState<Carte | null>(null);
  const [emailAbonne, setEmailAbonne] = useState('');
  const [abonneEnCours, setAbonneEnCours] = useState<string | null>(null);

  // La route du navire n'est pas stockée : elle change à chaque escale et pèse
  // plus lourd que le dossier. On la relit à l'ouverture, puis à chaque
  // mouvement du suivi (`majLe`). Lecture gratuite chez ShipsGo.
  const shipmentId = suivi?.shipmentId;
  const majLe = suivi?.majLe;
  const tracable = !verrouille && Boolean(shipmentId) && suivi?.statut !== 'UNTRACKED';
  useEffect(() => {
    if (!tracable) { setCarte(null); return; }
    let vivant = true;
    authedFetch(`/api/admin/suivi-carte?factureId=${encodeURIComponent(facture.id)}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || 'Carte indisponible');
        return d;
      })
      .then(d => { if (vivant) setCarte(d.carte || null); })
      // Une carte absente n'est pas une panne : le reste du suivi vaut déjà le détour.
      .catch(() => { if (vivant) setCarte(null); });
    return () => { vivant = false; };
  }, [tracable, shipmentId, majLe, facture.id]);

  // Ouvrir un dossier, c'est vouloir savoir où en est son conteneur : on relit
  // la compagnie si la dernière lecture date. C'est gratuit — seule l'ouverture
  // d'un suivi coûte un crédit. Une seule fois par affichage du dossier.
  const dejaRafraichi = useRef(false);
  useEffect(() => {
    if (!tracable || verrouille || dejaRafraichi.current) return;
    const age = Date.now() - (instantDe(suivi?.majLe) ?? 0);
    if (age < 5 * 60 * 1000) return;    // relu il y a moins de cinq minutes
    dejaRafraichi.current = true;
    authedFetch('/api/admin/suivi-conteneur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factureId: facture.id }),
    }).catch(() => { /* hors ligne : le dossier reste lisible tel quel */ });
  }, [tracable, verrouille, suivi?.majLe, facture.id]);

  const gererAbonne = async (corps: { email?: string; abonneId?: number; action: 'ajouter' | 'retirer' }) => {
    if (abonneEnCours !== null) return;
    setAbonneEnCours(corps.email || String(corps.abonneId));
    try {
      const r = await authedFetch('/api/admin/suivi-abonne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factureId: facture.id, ...corps }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Action impossible');
      setEmailAbonne('');
      toast({
        title: corps.action === 'ajouter' ? '📬 Client inscrit' : '🔕 Client désinscrit',
        description: corps.action === 'ajouter'
          ? `ShipsGo écrira à ${corps.email} à chaque étape de ce conteneur.`
          : 'Cette adresse ne recevra plus rien pour ce conteneur.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Abonnement impossible', description: e.message });
    } finally {
      setAbonneEnCours(null);
    }
  };

  const appeler = async (reference?: string, forcerDate = false) => {
    if (enCours) return;
    setEnCours(true);
    try {
      const r = await authedFetch('/api/admin/suivi-conteneur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factureId: facture.id, reference, forcerDate }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Suivi indisponible');

      setChangementNumero(false);
      setSaisie('');
      if (data.issue === 'date-modifiee') {
        toast({
          title: '📅 Date d’arrivée mise à jour',
          description: `${formatJour(data.ancienneDate)} → ${formatJour(data.nouvelleDate)} d’après la compagnie.`,
        });
      } else if (data.issue === 'deja-arrive' || data.issue === 'verrouille') {
        toast({
          title: 'Pas de suivi pour ce dossier',
          description: data.message || 'Le conteneur est déjà arrivé : le suivi ne concerne que les arrivages attendus.',
        });
      } else if (data.issue === 'suivi-ouvert') {
        toast({ title: '🚢 Suivi activé', description: 'Le conteneur sera relu automatiquement chaque nuit.' });
      } else {
        toast({ title: '✅ Suivi à jour', description: 'Rien de neuf depuis la dernière vérification.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Suivi impossible', description: e.message });
    } finally {
      setEnCours(false);
    }
  };

  // Un statut inconnu (ShipsGo en ajoute un jour) ne doit pas faire écran noir.
  const statut = (suivi && LIBELLE_STATUT[suivi.statut]) || null;
  const derniere = derniereEtape(suivi);
  const prochaine = prochaineEtape(suivi);
  const etapes = suivi?.etapes || [];
  // Les dossiers suivis avant l'ajout des abonnés n'ont pas ce champ.
  const abonnes = suivi?.abonnes || [];
  const etapesVisibles = toutesEtapes ? etapes : etapes.slice(-4);

  // Conteneur arrivé ou marchandise reçue : le suivi n'existe plus pour ce dossier.
  if (verrouille) return null;

  // Un NOUVEAU suivi (premier, ou autre numéro) ne s'ouvre que sur un arrivage
  // attendu — le serveur refuse de toute façon (issue « deja-arrive »).
  const ouvrable = !dossierArrive(facture);

  // ── Pas encore de suivi : proposer de l'ouvrir ──────────────────────────────
  if (!suivi?.shipmentId || (changementNumero && ouvrable)) {
    if (!ouvrable) return null;
    return (
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-stone-900" />
          <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">
            {changementNumero ? 'Changer le numéro suivi' : 'Suivi du conteneur'}
          </h3>
        </div>
        <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
          Indiquez le <strong>numéro de conteneur</strong> (MSCU1234567) ou le <strong>Master BL</strong> de la
          compagnie maritime — pas la référence du transitaire{facture?.noBL ? ` (${facture.noBL})` : ''}, que la
          compagnie ne connaît pas. Un Master BL couvre tous ses conteneurs pour un seul crédit.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={saisie}
            onChange={e => setSaisie(e.target.value.toUpperCase())}
            placeholder="MSCU1234567 ou MEDUXY123456"
            disabled={enCours}
            className="h-11 rounded-xl border-stone-200 font-bold tracking-widest uppercase text-sm"
            onKeyDown={e => { if (e.key === 'Enter' && saisie.trim() && !enCours) appeler(saisie.trim()); }}
          />
          <Button
            onClick={() => appeler(saisie.trim())}
            disabled={!saisie.trim() || enCours}
            className="h-11 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase tracking-widest gap-2 px-5 shrink-0"
          >
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
            Activer le suivi (1 crédit)
          </Button>
          {changementNumero && (
            <Button
              variant="ghost"
              onClick={() => { setChangementNumero(false); setSaisie(''); }}
              className="h-11 rounded-xl text-[10px] font-black uppercase tracking-widest text-stone-400"
            >
              Annuler
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Suivi ouvert ────────────────────────────────────────────────────────────
  const inconnu = suivi.statut === 'UNTRACKED';

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-stone-100">
        <div className="flex items-center gap-2 flex-wrap">
          <Radar className="w-4 h-4 text-stone-900" />
          <h3 className="text-[11px] font-black text-stone-900 uppercase tracking-widest">Suivi du conteneur</h3>
          {statut && <span className={`${puce} ${statut.ton}`}>{statut.emoji} {statut.label}</span>}
          <span className={`${puce} bg-white text-stone-600 border-stone-200`}>
            <Container className="w-3 h-3" />{suivi.reference}
          </span>
          {suivi.compagnie && (
            <span className={`${puce} bg-white text-stone-500 border-stone-200`}>
              <Ship className="w-3 h-3" />{suivi.compagnie}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {suivi.lienCarte && (
            <a
              href={suivi.lienCarte}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
            >
              <MapPin className="w-3.5 h-3.5" /> Carte <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
          <Button
            onClick={() => appeler()}
            disabled={enCours}
            variant="ghost"
            className="h-9 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 text-stone-600 hover:text-stone-900"
          >
            {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </Button>
        </div>
      </div>

      {suivi.erreur && (
        <p className="flex items-start gap-2 px-6 py-3 bg-red-50 text-[11px] font-bold text-red-700 border-b border-red-100">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{suivi.erreur}
        </p>
      )}

      {/* Suivi ouvert, mais ShipsGo n'a pas encore eu le temps d'interroger la
          compagnie : dire que rien n'est cassé et qu'il n'y a rien à faire. */}
      {(suivi.statut === 'NEW' || suivi.statut === 'INPROGRESS') && !suivi.erreur && (
        <p className="px-6 py-3 bg-stone-50 text-[11px] font-bold text-stone-500 border-b border-stone-100">
          ShipsGo interroge {suivi.compagnie || 'la compagnie'} — le trajet apparaît généralement en quelques
          minutes, parfois quelques heures si la compagnie tarde. Rien à faire de votre côté.
        </p>
      )}

      {inconnu ? (
        <div className="px-6 py-5 space-y-3">
          <p className="text-[11px] font-bold text-stone-600 leading-relaxed">
            La compagnie ne reconnaît pas « {suivi.reference} ». C'est presque toujours une référence de transitaire
            ou une faute de frappe : reprenez le numéro écrit sur le <strong>connaissement de la compagnie</strong> ou
            sur le conteneur lui-même.
          </p>
          {ouvrable ? (
            <Button
              onClick={() => setChangementNumero(true)}
              className="h-10 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase tracking-widest px-5"
            >
              Corriger le numéro
            </Button>
          ) : (
            <p className="text-[11px] font-bold text-stone-500 leading-relaxed">
              La date d'arrivée est passée : plus de nouveau suivi. Si le conteneur est encore en mer, corrigez
              d'abord la date d'arrivée du dossier.
            </p>
          )}
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Trajet */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Départ</p>
              <p className="text-sm font-black text-stone-900 uppercase leading-tight">{suivi.portChargement || '—'}</p>
              <p className="text-[10px] font-bold text-stone-400">{formatJour(suivi.dateChargement)}</p>
            </div>
            <div className="flex flex-col items-center gap-1 min-w-[120px]">
              <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-stone-900 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, suivi.avancement ?? 0))}%` }}
                />
              </div>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                {suivi.avancement != null ? `${suivi.avancement} %` : '—'}
                {suivi.dureeTransit ? ` · ${suivi.dureeTransit} j` : ''}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Arrivée</p>
              <p className="text-sm font-black text-stone-900 uppercase leading-tight">{suivi.portDechargement || '—'}</p>
              <p className={`text-[10px] font-bold ${suivi.dateDechargementReelle ? 'text-emerald-600' : 'text-amber-600'}`}>
                {formatJour(suivi.dateDechargement)} · {suivi.dateDechargementReelle ? 'réelle' : 'annoncée'}
              </p>
              {suivi.dateDechargementPrevue && suivi.dateDechargementPrevue !== suivi.dateDechargement && (
                <p className="text-[10px] font-bold text-stone-400">
                  Prévision ShipsGo : {formatJour(suivi.dateDechargementPrevue)}
                </p>
              )}
            </div>
          </div>

          {/* Route et position du navire */}
          {carte && <SuiviCarte carte={carte} />}

          {/* Repères */}
          <div className="flex flex-wrap gap-2">
            {derniere && (
              <span className={`${puce} bg-stone-100 text-stone-700 border-stone-200`}>
                <CheckCircle2 className="w-3 h-3" />{derniere.libelle} · {formatJour(derniere.date)}
              </span>
            )}
            {/* L'arrivée attendue est EXACTEMENT la date du dossier (même calcul,
                cf. resumerShipment) : jamais deux chiffres différents à l'écran. */}
            {!suivi.dateDechargementReelle && suivi.dateDechargement && (
              <span className={`${puce} bg-amber-50 text-amber-700 border-amber-200`}>
                <CalendarClock className="w-3 h-3" />Attendu : Arrivée
                {suivi.portDechargement ? ` · ${suivi.portDechargement}` : ''} · {formatJour(suivi.dateDechargement)}
              </span>
            )}
            {/* Avant, une escale (Tanger, Algésiras…) : dite comme telle, avec son lieu. */}
            {prochaine && !auPortFinal(prochaine, suivi) && (
              <span className={`${puce} bg-white text-stone-500 border-stone-200`}>
                Prochaine escale : {prochaine.libelle}{prochaine.lieu ? ` · ${prochaine.lieu}` : ''} · {formatJour(prochaine.date)}
              </span>
            )}
            {suivi.navire && (
              <span className={`${puce} bg-sky-50 text-sky-700 border-sky-200`}>
                <Anchor className="w-3 h-3" />{suivi.navire}{suivi.voyage ? ` · ${suivi.voyage}` : ''}
              </span>
            )}
            {suivi.conteneurs.length > 1 && (
              <span title={suivi.conteneurs.join(', ')} className={`${puce} bg-white text-stone-500 border-stone-200`}>
                <Container className="w-3 h-3" />{suivi.conteneurs.length} conteneurs
              </span>
            )}
          </div>

          {/* Étapes */}
          {etapes.length > 0 && (
            <div>
              <ul className="border-l border-stone-100 pl-1 ml-1">
                {etapesVisibles.map((e, i) => <Etape key={`${e.code}-${e.date}-${i}`} etape={e} />)}
              </ul>
              {etapes.length > 4 && (
                <button
                  onClick={() => setToutesEtapes(v => !v)}
                  className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-900"
                >
                  {toutesEtapes ? 'Réduire' : `Voir les ${etapes.length} étapes`}
                </button>
              )}
            </div>
          )}

          {/* Clients prévenus par ShipsGo */}
          {!verrouille && (
            <div className="pt-4 border-t border-stone-100 space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-stone-400" />
                <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Prévenir un client</h4>
              </div>
              <p className="text-[10px] font-medium text-stone-400 leading-relaxed">
                L&apos;adresse inscrite reçoit un email <strong>envoyé par ShipsGo</strong> à chaque étape de ce
                conteneur — départ, transbordement, arrivée. Rien ne part de ta boîte, et tu peux désinscrire
                à tout moment.
              </p>
              {abonnes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {abonnes.map(a => (
                    <span key={a.id || a.email} className={`${puce} bg-stone-50 text-stone-600 border-stone-200 normal-case tracking-normal`}>
                      {a.email}
                      <button
                        onClick={() => gererAbonne({ abonneId: a.id, action: 'retirer' })}
                        disabled={abonneEnCours !== null || !a.id}
                        title="Désinscrire"
                        className="text-stone-400 hover:text-red-600 disabled:opacity-40"
                      >
                        {abonneEnCours === String(a.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  value={emailAbonne}
                  onChange={e => setEmailAbonne(e.target.value)}
                  placeholder="client@exemple.com"
                  disabled={abonneEnCours !== null}
                  className="h-10 rounded-xl border-stone-200 text-[12px] font-bold"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && emailAbonne.trim() && abonneEnCours === null) {
                      gererAbonne({ email: emailAbonne.trim(), action: 'ajouter' });
                    }
                  }}
                />
                <Button
                  onClick={() => gererAbonne({ email: emailAbonne.trim(), action: 'ajouter' })}
                  disabled={!emailAbonne.trim() || abonneEnCours !== null}
                  variant="outline"
                  className="h-10 rounded-xl border-stone-200 text-[10px] font-black uppercase tracking-widest gap-2 px-5 shrink-0"
                >
                  {abonneEnCours === emailAbonne.trim() ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Inscrire aux notifications
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-stone-100">
            <p className="text-[10px] font-bold text-stone-400 pt-3">
              Vérifié chez la compagnie : {formatInstant(suivi.verifieLe || suivi.majLe)}
            </p>
            {facture?.arrivalDateSource === 'shipsgo' && (
              <p className="text-[10px] font-bold text-emerald-600 pt-3">
                Date du dossier mise à jour automatiquement
                {facture?.arrivalDateAvantSuivi ? ` (saisie d'origine : ${formatJour(facture.arrivalDateAvantSuivi)})` : ''}
              </p>
            )}
            {ouvrable && (
              <button
                onClick={() => setChangementNumero(true)}
                className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-900 pt-3"
              >
                Changer le numéro
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
