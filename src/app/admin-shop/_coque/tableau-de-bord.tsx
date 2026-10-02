'use client';

// ─── Tableau de bord de la boutique ──────────────────────────────────────────
// Ce qui attend (à confirmer, à préparer, transport à organiser, à retirer, en
// livraison) et l'argent vraiment encaissé (commandes livrées ou retirées) — plus
// de « chiffre d'affaires » qui comptait les commandes jamais confirmées. En
// dessous, les commandes à rappeler en premier, puis ce qui se passe sur le site
// (compteurs anonymes : où les visiteurs s'arrêtent avant de commander).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart2,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  Store,
  Truck,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { ShopOrder } from '@/lib/shop-types';
import { formatPrice } from '@/lib/shop-utils';
import { authedFetch } from '@/lib/authed-fetch';
import {
  commandesDeLaFile,
  compteParFile,
  dateDe,
  dateHeure,
  depuisQuand,
  enRetard,
  resumeArgent,
  totalLigne,
  type FileCommandes,
} from '@/lib/commandes-boutique';
import {
  ROUTE_COMPTEUR,
  jourMaroc,
  resumerPeriode,
  taux,
  type Evenement,
  type JourCompte,
  type Periode,
} from '@/lib/compteurs-boutique';

/** Commandes qui ne comptent pas dans les classements : rien n'a été vendu. */
const exclue = (o: ShopOrder) => o.status === 'cancelled' || o.status === 'returned';

// ─── Carte chiffrée ───────────────────────────────────────────────────────────

function Carte({ titre, valeur, sousTitre, icone, couleur, onClick, alerte }: {
  titre: string;
  valeur: ReactNode;
  sousTitre?: ReactNode;
  icone: ReactNode;
  couleur: string;
  onClick?: () => void;
  alerte?: boolean;
}) {
  const contenu = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${couleur}22`, color: couleur }}>
          {icone}
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden />}
      </div>
      <p className="text-2xl font-bold text-white mb-1 break-words">{valeur}</p>
      <p className="text-sm text-gray-300 font-medium">{titre}</p>
      {sousTitre && <div className="text-xs text-gray-400 mt-1">{sousTitre}</div>}
    </>
  );
  const classes = `text-left bg-[#1A1A1A] rounded-2xl p-4 md:p-5 border transition-colors ${
    alerte ? 'border-red-500/50' : 'border-white/5'
  }`;
  if (!onClick) return <div className={classes}>{contenu}</div>;
  return (
    <button type="button" onClick={onClick} className={`${classes} hover:border-white/20 focus-visible:border-white/40`}>
      {contenu}
    </button>
  );
}

// ─── Vue ──────────────────────────────────────────────────────────────────────

export function TableauDeBord({
  orders,
  pret,
  erreur,
  maintenant,
  nonVues,
  onOuvrirCommande,
  onVoirFile,
  onReessayer,
}: {
  orders: ShopOrder[];
  /** Première réponse du serveur reçue. */
  pret: boolean;
  erreur: string | null;
  maintenant: number;
  nonVues: Set<string>;
  onOuvrirCommande: (id: string) => void;
  /** Ouvre l'écran Commandes sur cette file (la carte « À préparer » montre « À préparer »). */
  onVoirFile: (file: FileCommandes) => void;
  onReessayer: () => void;
}) {
  const chiffres = useMemo(() => {
    const comptes = compteParFile(orders);
    const aConfirmer = commandesDeLaFile(orders, 'a_confirmer', '', maintenant);
    const retard = aConfirmer.filter(o => enRetard(o, maintenant)).length;
    return { comptes, aConfirmer, retard, argent: resumeArgent(orders) };
  }, [orders, maintenant]);

  const classements = useMemo(() => {
    const vendues = orders.filter(o => !exclue(o));

    const villes = new Map<string, number>();
    for (const o of vendues) {
      const ville = o.shippingAddress?.city?.trim() || 'Ville non indiquée';
      villes.set(ville, (villes.get(ville) || 0) + 1);
    }
    const topVilles = [...villes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const produits = new Map<string, { nom: string; qte: number; montant: number }>();
    for (const o of vendues) {
      for (const item of o.items || []) {
        const cle = item.productId || item.productName;
        const p = produits.get(cle) ?? { nom: item.productName, qte: 0, montant: 0 };
        p.qte += Number(item.quantity) || 0;
        p.montant += totalLigne(item); // prix réellement appliqué (prix de gros compris)
        produits.set(cle, p);
      }
    }
    const topProduits = [...produits.values()].sort((a, b) => b.qte - a.qte).slice(0, 5);
    return { topVilles, topProduits };
  }, [orders]);

  // Jamais de zéros trompeurs : tant que rien n'est arrivé du serveur, on le dit.
  if (!pret) return <EtatChargementCommandes erreur={erreur} onReessayer={onReessayer} />;

  const { comptes, aConfirmer, retard, argent } = chiffres;
  const { topVilles, topProduits } = classements;
  const maxVille = topVilles[0]?.[1] || 1;
  const premieres = aConfirmer.slice(0, 5);

  return (
    <div className="space-y-6 md:space-y-8">
      {erreur && <BandeauErreur message={erreur} onReessayer={onReessayer} />}

      {/* ── Ce qui attend, et l'argent encaissé ── */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        <Carte
          titre="À confirmer"
          valeur={comptes.a_confirmer}
          icone={<Clock className="w-5 h-5" />}
          couleur="#F59E0B"
          alerte={retard > 0}
          onClick={() => onVoirFile('a_confirmer')}
          sousTitre={retard > 0
            ? <span className="text-red-300 font-semibold">dont {retard} en retard (plus de 2 h)</span>
            : 'client à appeler'}
        />
        <Carte
          titre="À préparer"
          valeur={comptes.a_preparer}
          icone={<PackageCheck className="w-5 h-5" />}
          couleur="#8B5CF6"
          onClick={() => onVoirFile('a_preparer')}
          sousTitre="confirmées, colis à faire"
        />
        <Carte
          titre="Transport à organiser"
          valeur={comptes.transport}
          icone={<Warehouse className="w-5 h-5" />}
          couleur="#F59E0B"
          onClick={() => onVoirFile('transport')}
          sousTitre="rouleaux : retrait CHRIFA, camionnette ou transporteur"
        />
        <Carte
          titre="À retirer"
          valeur={comptes.a_retirer}
          icone={<Store className="w-5 h-5" />}
          couleur="#14B8A6"
          onClick={() => onVoirFile('a_retirer')}
          sousTitre="prêtes au magasin"
        />
        <Carte
          titre="En livraison"
          valeur={comptes.en_livraison}
          icone={<Truck className="w-5 h-5" />}
          couleur="#06B6D4"
          onClick={() => onVoirFile('en_livraison')}
          sousTitre="Sendit, camionnette ou transporteur"
        />
        <Carte
          titre="Encaissé"
          valeur={formatPrice(argent.encaisse)}
          icone={<Wallet className="w-5 h-5" />}
          couleur="#10B981"
          sousTitre="livrées ou retirées"
        />
      </div>
      {(argent.enCours > 0 || argent.aConfirmer > 0) && (
        <p className="text-sm text-gray-300 -mt-2 md:-mt-4">
          Pas encore encaissé :{' '}
          <span className="text-white font-semibold">{formatPrice(argent.enCours)}</span> en cours (confirmées, pas encore livrées)
          {argent.aConfirmer > 0 && (
            <> et <span className="text-white font-semibold">{formatPrice(argent.aConfirmer)}</span> à confirmer</>
          )}.
        </p>
      )}

      {/* ── À traiter maintenant : les plus anciennes à confirmer ── */}
      <section className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden" aria-labelledby="a-traiter">
        <div className="px-4 md:px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3">
          <h2 id="a-traiter" className="text-white font-semibold text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            À traiter maintenant
          </h2>
          {aConfirmer.length > 0 && (
            <span className="text-xs text-gray-400">la plus ancienne en haut</span>
          )}
        </div>
        {premieres.length === 0 ? (
          <p className="px-4 md:px-6 py-8 text-sm text-gray-300">Aucune commande à confirmer : tout est à jour.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {premieres.map(o => {
              const retardee = enRetard(o, maintenant);
              const nouvelle = !!o.id && nonVues.has(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => o.id && onOuvrirCommande(o.id)}
                    className="w-full text-left px-4 md:px-6 py-3 min-h-[60px] flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate flex items-center gap-2">
                        <span className="truncate">{o.customerName || o.shippingAddress?.fullName || 'Client sans nom'}</span>
                        {nouvelle && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-[#C8102E] text-white text-xs font-bold leading-none">Nouvelle</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {o.shippingAddress?.city || 'Ville non indiquée'} · {dateHeure(o.createdAt, maintenant)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white text-sm font-bold">{formatPrice(o.total)}</p>
                      <p className={`text-xs ${retardee ? 'text-red-300 font-semibold' : 'text-gray-400'}`}>
                        {depuisQuand(o.createdAt, maintenant)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {aConfirmer.length > premieres.length && (
          <button type="button" onClick={() => onVoirFile('a_confirmer')}
            className="w-full min-h-[48px] px-4 md:px-6 border-t border-white/5 text-sm font-semibold text-red-200 hover:bg-white/[0.04] text-left">
            Voir les {aConfirmer.length} commandes à confirmer →
          </button>
        )}
      </section>

      {/* ── Classements (hors annulées et retours) ── */}
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        <section className="bg-[#1A1A1A] rounded-2xl p-4 md:p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#E0314D]" />
              Villes qui commandent le plus
            </h2>
            <span className="text-xs text-gray-400">hors annulées</span>
          </div>
          {topVilles.length === 0 ? (
            <p className="text-gray-300 text-sm">Pas encore de commande.</p>
          ) : (
            <div className="space-y-3">
              {topVilles.map(([ville, nb]) => (
                <div key={ville} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-gray-200 font-medium truncate">{ville}</span>
                    <span className="text-gray-400 text-xs flex-shrink-0">{nb} commande{nb > 1 ? 's' : ''}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(nb / maxVille) * 100}%`, background: 'linear-gradient(90deg, #C8102E, #D4A843)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#1A1A1A] rounded-2xl p-4 md:p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#D4A843]" />
              Produits les plus commandés
            </h2>
            <span className="text-xs text-gray-400">hors annulées</span>
          </div>
          {topProduits.length === 0 ? (
            <p className="text-gray-300 text-sm">Pas encore de commande.</p>
          ) : (
            <ol className="space-y-1">
              {topProduits.map((p, i) => (
                <li key={`${p.nom}-${i}`} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 bg-white/5 text-gray-300">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm font-medium truncate">{p.nom}</p>
                    <p className="text-gray-400 text-xs">{p.qte} unité{p.qte > 1 ? 's' : ''} commandée{p.qte > 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-sm text-gray-200 flex-shrink-0">{formatPrice(p.montant)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <CeQuiSePasseSurLeSite orders={orders} />
    </div>
  );
}

// ─── Ce qui se passe sur le site (compteurs anonymes) ────────────────────────
// Lu par GET /api/shop/compteur (administrateur seulement). Les commandes passées
// viennent des commandes déjà chargées ici, comptées par jour au Maroc.

type ReponseCompteurs = { aujourdhui: string; jours: JourCompte[] };

const LIGNES_SITE: { cle: Evenement | 'commandes'; libelle: string }[] = [
  { cle: 'vue_produit', libelle: 'Fiches produit vues' },
  { cle: 'ajout_panier', libelle: 'Ajouts au panier' },
  { cle: 'ouverture_panier', libelle: 'Paniers ouverts' },
  { cle: 'arrivee_commande', libelle: 'Arrivées au formulaire de commande' },
  { cle: 'commandes', libelle: 'Commandes passées' },
  { cle: 'clic_whatsapp', libelle: 'Clics WhatsApp' },
];

const valeurSite = (p: Periode, cle: Evenement | 'commandes') => (cle === 'commandes' ? p.commandes : p.evenements[cle]);
const pourcent = (v: number | null) => (v === null ? '—' : `${v} %`);

function CeQuiSePasseSurLeSite({ orders }: { orders: ShopOrder[] }) {
  const [reponse, setReponse] = useState<ReponseCompteurs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let actif = true;
    setErreur(null);
    authedFetch(`${ROUTE_COMPTEUR}?jours=7`, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
        return d as ReponseCompteurs;
      })
      .then(d => { if (actif) setReponse(d); })
      .catch(e => { if (actif) setErreur(e instanceof Error ? e.message : 'Compteurs illisibles pour le moment'); });
    return () => { actif = false; };
  }, [essai]);

  // Commandes passées par jour (heure du Maroc), annulées comprises : elles ont été passées
  const commandesParJour = useMemo(() => {
    const parJour: Record<string, number> = {};
    for (const o of orders) {
      const d = dateDe(o.createdAt);
      if (!d) continue;
      const jour = jourMaroc(d);
      parJour[jour] = (parJour[jour] || 0) + 1;
    }
    return parJour;
  }, [orders]);

  const periodes = useMemo(() => {
    if (!reponse) return null;
    return {
      jour: resumerPeriode(reponse.jours.filter(j => j.jour === reponse.aujourdhui), commandesParJour),
      semaine: resumerPeriode(reponse.jours, commandesParJour),
    };
  }, [reponse, commandesParJour]);

  return (
    <section className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden" aria-labelledby="sur-le-site">
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3">
        <h2 id="sur-le-site" className="text-white font-semibold text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#D4A843]" />
          Ce qui se passe sur le site
        </h2>
        <button type="button" onClick={() => setEssai(n => n + 1)}
          className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>

      {erreur ? (
        <p role="alert" className="px-4 md:px-6 py-6 text-sm text-red-200">Compteurs non lus : {erreur}</p>
      ) : !periodes ? (
        <div className="px-4 md:px-6 py-8 flex items-center gap-3 text-sm text-gray-300" role="status">
          <Loader2 className="w-5 h-5 animate-spin text-[#C8102E]" />
          Chargement des compteurs…
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th scope="col" className="text-left font-medium px-4 md:px-6 py-2"><span className="sr-only">Étape</span></th>
                <th scope="col" className="text-right font-medium px-2 py-2">Aujourd&apos;hui</th>
                <th scope="col" className="text-right font-medium px-4 md:px-6 py-2">7 derniers jours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {LIGNES_SITE.map(l => (
                <tr key={l.cle}>
                  <th scope="row" className="text-left font-normal text-gray-200 px-4 md:px-6 py-2.5">{l.libelle}</th>
                  <td className="text-right text-white font-semibold px-2 py-2.5">{valeurSite(periodes.jour, l.cle)}</td>
                  <td className="text-right text-white font-semibold px-4 md:px-6 py-2.5">{valeurSite(periodes.semaine, l.cle)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid sm:grid-cols-2 gap-3 px-4 md:px-6 py-4 border-t border-white/5">
            {[
              {
                titre: 'Ajoutent au panier',
                detail: 'ajouts au panier pour 100 fiches vues',
                jour: taux(periodes.jour.evenements.ajout_panier, periodes.jour.evenements.vue_produit),
                semaine: taux(periodes.semaine.evenements.ajout_panier, periodes.semaine.evenements.vue_produit),
              },
              {
                titre: 'Passent commande',
                detail: 'commandes pour 100 arrivées au formulaire',
                jour: taux(periodes.jour.commandesJoursMesures, periodes.jour.evenements.arrivee_commande),
                semaine: taux(periodes.semaine.commandesJoursMesures, periodes.semaine.evenements.arrivee_commande),
              },
            ].map(t => (
              <div key={t.titre} className="rounded-xl bg-white/[0.04] p-3">
                <p className="text-sm text-gray-200 font-medium">{t.titre}</p>
                <p className="text-xs text-gray-400 mb-2">{t.detail}</p>
                <p className="text-sm text-gray-300">
                  Aujourd&apos;hui <span className="text-white font-bold">{pourcent(t.jour)}</span>
                  {' · '}7 jours <span className="text-white font-bold">{pourcent(t.semaine)}</span>
                </p>
              </div>
            ))}
          </div>

          <p className="px-4 md:px-6 pb-4 text-xs text-gray-400">
            Compté sans rien savoir des visiteurs : ni nom, ni téléphone, ni adresse IP. Chaque passage compte
            (une fiche ouverte deux fois compte deux fois ; le panier qui s&apos;ouvre tout seul après un ajout aussi).
            Les commandes viennent de la liste des commandes ; leur taux ne prend que les jours où les compteurs tournaient.
          </p>
        </>
      )}
    </section>
  );
}

/** Avant la première réponse du serveur : chargement, ou l'erreur qui l'empêche. */
export function EtatChargementCommandes({ erreur, onReessayer }: { erreur: string | null; onReessayer: () => void }) {
  if (erreur) return <BandeauErreur message={erreur} onReessayer={onReessayer} />;
  return (
    <div className="flex items-center justify-center min-h-[300px] gap-3" role="status">
      <Loader2 className="w-7 h-7 animate-spin text-[#C8102E]" />
      <p className="text-gray-300 text-sm">Chargement des commandes…</p>
    </div>
  );
}

export function BandeauErreur({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-200 font-semibold text-sm">Les commandes ne sont pas à jour</p>
          <p className="text-red-200/90 text-sm mt-0.5">{message}</p>
        </div>
      </div>
      <button type="button" onClick={onReessayer}
        className="min-h-[44px] px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-100 text-sm font-semibold inline-flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4" />
        Réessayer
      </button>
    </div>
  );
}
