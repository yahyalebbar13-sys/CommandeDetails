// ─── Modifier un dossier d'arrivage ───────────────────────────────────────────
// Deux écrans modifient un dossier : la fenêtre « Paramétrer le dossier » et le
// tableau des arrivages, cellule par cellule. Ce qu'une modification entraîne —
// le transitaire de la société, le suivi du conteneur, les clients prévenus —
// vit ici, pour que les deux écrans fassent exactement la même chose.

import { computeEffectiveStatus, type EffectiveStatus } from './status-utils';
import { sendStatusNotification } from './send-status-notification';
import { authedFetch } from './authed-fetch';

export const SOCIETES_DECLARANTES = ['New fournitures', 'Lebtex', 'Robe in box'] as const;

/** Transitaire attitré d'une société déclarante ; undefined si elle n'en a pas. */
export function transitaireDeLaSociete(societe: string): string | undefined {
  if (societe === 'Robe in box' || societe === 'New fournitures') return 'NOUH TRANSIT TRANSPORT';
  if (societe === 'Lebtex') return 'IDRISTRANS';
  return undefined;
}

export type DatesDossier = { arrivalDate?: string | null; stockEntryDate?: string | null };

/**
 * Statut que les clients voient pour ces dates — le calcul de la notification
 * automatique (hooks/use-auto-status-notifier), qui part toujours d'un article
 * expédié : seules les dates du dossier comptent.
 */
export function statutPourLesClients(dates: DatesDossier): EffectiveStatus {
  return computeEffectiveStatus({
    status: 'SHIPPED',
    arrivalDate: dates.arrivalDate || null,
    stockEntryDate: dates.stockEntryDate || null,
  });
}

/**
 * Articles dont le client recevra un message si les dates du dossier passent
 * de `avant` à `apres` : ceux qui ont un client, et seulement quand le statut
 * change (sendStatusNotification n'envoie rien pour un statut identique).
 */
export function articlesAPrevenir(articles: any[], avant: DatesDossier, apres: DatesDossier): any[] {
  if (statutPourLesClients(avant) === statutPourLesClients(apres)) return [];
  return articles.filter(a => (a.clientName || '').trim());
}

/**
 * Prévient les clients du changement de statut qu'entraînent les nouvelles
 * dates. Les envois partent en arrière-plan ; renvoie le nombre de messages
 * lancés.
 *
 * L'appelant inscrit `lastNotifiedStatus` dans le dossier quand ce nombre n'est
 * pas nul : sans cela, la notification automatique renverrait le même message
 * au prochain chargement de /gestion.
 */
export function notifierClientsDates(p: {
  firestore: any;
  adminUid: string;
  articles: any[];
  avant: DatesDossier;
  apres: DatesDossier;
  noBL?: string | null;
}): number {
  const destinataires = articlesAPrevenir(p.articles, p.avant, p.apres);
  if (!destinataires.length) return 0;
  const ancien = statutPourLesClients(p.avant);
  const nouveau = statutPourLesClients(p.apres);

  // Compute transit info for the email
  let transitArrivalDate: string | undefined;
  let transitDuration: string | undefined;
  const newArrivalDate = p.apres.arrivalDate || null;
  if (newArrivalDate) {
    transitArrivalDate = newArrivalDate;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const eta = new Date(newArrivalDate); eta.setHours(0, 0, 0, 0);
    const diffDays = Math.round((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) transitDuration = diffDays === 1 ? '1 jour' : `${diffDays} jours`;
    else if (diffDays === 0) transitDuration = "aujourd'hui";
  } else if (nouveau === 'STOCK' && p.apres.stockEntryDate) {
    transitArrivalDate = p.apres.stockEntryDate;
  }

  for (const article of destinataires) {
    const clientName = (article.clientName || '').trim();
    sendStatusNotification({
      firestore: p.firestore,
      adminUid: p.adminUid,
      clientName,
      articleName: article.categoryId || article.name,
      oldStatus: ancien,
      newStatus: nouveau,
      quantity: article.quantity,
      unitOfMeasure: article.unitOfMeasure,
      specs: article.specs,
      color: article.color,
      size: article.size,
      imageUrl: article.imageUrl || undefined,
      transitArrivalDate,
      transitDuration,
      noBL: p.noBL?.trim() || null,
    }).then(result => {
      if (result.ok) {
        console.log(`[Facture] ✅ Email envoyé → ${clientName} (${result.email})`);
      } else {
        console.warn(`[Facture] ❌ Email ÉCHOUÉ → "${clientName}":`, result.error || 'email introuvable dans clientAccess/clientEmails');
      }
    });
  }
  return destinataires.length;
}

type Signaler = (message: { title: string; description?: string; variant?: 'destructive' }) => void;

/**
 * Demande au serveur d'ouvrir le suivi maritime du dossier. Lancé en arrière-plan :
 * l'enregistrement ne doit pas attendre une compagnie maritime.
 *
 * Le dossier vient d'être écrit sans attente : le serveur peut ne pas encore le
 * voir. D'où les tentatives espacées sur un 404, plutôt qu'un échec qui
 * laisserait l'arrivage sans suivi. Le serveur écarte lui-même les dossiers en
 * stock ou déjà arrivés : aucun crédit n'y est dépensé.
 */
export async function ouvrirSuiviEnFond(factureId: string, reference: string, signaler: Signaler): Promise<void> {
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await authedFetch('/api/admin/suivi-conteneur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factureId, reference, auto: true }),
      });
      if (r.status === 404 && essai < 2) {
        await new Promise(resoudre => setTimeout(resoudre, 800 * (essai + 1)));
        continue;
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Le suivi reste activable à la main depuis le dossier : on informe
        // sans transformer ça en échec d'enregistrement.
        if (r.status !== 503) {
          signaler({
            variant: 'destructive',
            title: 'Suivi du conteneur non activé',
            description: data?.error || 'Réessayez depuis le dossier.',
          });
        }
        return;
      }
      if (data.issue === 'suivi-ouvert' || data.issue === 'date-modifiee' || data.issue === 'a-jour') {
        signaler({
          title: '🚢 Suivi du conteneur activé',
          description: `${reference} est suivi chez la compagnie. La date d'arrivée se mettra à jour toute seule.`,
        });
      }
      return;
    } catch {
      return; // hors ligne : rien de cassé, le dossier est enregistré
    }
  }
}
