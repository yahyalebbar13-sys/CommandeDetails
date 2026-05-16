/**
 * useAutoStatusNotifier
 *
 * Runs once when the admin app loads (and once per day if they leave the tab open).
 * For every dossier (facture), computes the current effective status from today's date
 * and compares it to the last notified status stored on the facture document.
 *
 * If the status has changed (e.g. TRANSIT → CUSTOMS because arrivalDate passed),
 * it sends notification emails to all linked client-articles and updates
 * `lastNotifiedStatus` on the facture to prevent duplicate sends.
 */

import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { computeEffectiveStatus } from '@/lib/status-utils';
import { sendStatusNotification } from '@/lib/send-status-notification';

interface UseAutoStatusNotifierParams {
  firestore: any;
  adminUid: string | null;
  factures: any[];        // all dossiers (with arrivalDate, stockEntryDate, lastNotifiedStatus)
  articles: any[];        // all articles (raw, not enriched)
  enabled: boolean;       // only run when user is fully authenticated
}

export function useAutoStatusNotifier({
  firestore,
  adminUid,
  factures,
  articles,
  enabled,
}: UseAutoStatusNotifierParams) {
  // Track the last time we ran so we only run once per day per session
  const lastRunRef = useRef<number>(0);
  const ranForFacturesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !firestore || !adminUid || !factures.length) return;

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // Only run once per day
    if (now - lastRunRef.current < ONE_DAY_MS && lastRunRef.current !== 0) return;
    lastRunRef.current = now;

    // Reset per-facture tracking for this run
    ranForFacturesRef.current = new Set();

    (async () => {
      console.log('[AutoNotifier] 🔍 Checking status transitions for', factures.length, 'dossiers...');

      for (const facture of factures) {
        const factureId = facture.id;

        // Skip if no dates (nothing to compute)
        if (!facture.arrivalDate && !facture.stockEntryDate) continue;

        // Compute current effective status based on TODAY's date
        const currentStatus = computeEffectiveStatus({
          status: 'SHIPPED',
          arrivalDate: facture.arrivalDate || null,
          stockEntryDate: facture.stockEntryDate || null,
        });

        // Get last notified status — default to TRANSIT (beginning of lifecycle)
        const lastNotified = (facture.lastNotifiedStatus || 'TRANSIT') as string;

        // No change → skip
        if (currentStatus === lastNotified) continue;

        console.log(`[AutoNotifier] 📦 Dossier ${factureId}: ${lastNotified} → ${currentStatus}`);

        // Find linked articles with a clientName (preorder articles)
        const linkedArticles = articles.filter(
          (a: any) => a.factureId === factureId && (a.clientName || '').trim()
        );

        if (!linkedArticles.length) {
          console.log(`[AutoNotifier] ⏭ ${factureId}: pas d'articles avec client, mise à jour du statut seulement.`);
        }

        // Compute transit info for the email
        let transitArrivalDate: string | undefined;
        let transitDuration: string | undefined;
        if (facture.arrivalDate) {
          transitArrivalDate = facture.arrivalDate;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const eta = new Date(facture.arrivalDate); eta.setHours(0, 0, 0, 0);
          const diffDays = Math.round((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0) transitDuration = `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
          else if (diffDays === 0) transitDuration = "aujourd'hui";
        }
        if (currentStatus === 'STOCK' && facture.stockEntryDate) {
          transitArrivalDate = facture.stockEntryDate;
        }

        // Send email for each linked client article
        for (const article of linkedArticles) {
          const clientName = (article.clientName || '').trim();
          sendStatusNotification({
            firestore,
            adminUid,
            clientName,
            articleName: article.categoryId || article.name,
            oldStatus: lastNotified,
            newStatus: currentStatus,
            quantity: article.quantity,
            unitOfMeasure: article.unitOfMeasure,
            specs: article.specs,
            color: article.color,
            size: article.size,
            imageUrl: article.imageUrl || undefined,
            transitArrivalDate,
            transitDuration,
          }).then(result => {
            if (result.ok) {
              console.log(`[AutoNotifier] ✅ Email → ${clientName} pour dossier ${factureId}`);
            } else {
              console.warn(`[AutoNotifier] ❌ Email ÉCHOUÉ → "${clientName}":`, result.error || 'email introuvable');
            }
          });
        }

        // Update lastNotifiedStatus on the facture to prevent re-sending tomorrow
        try {
          const factureRef = doc(firestore, 'users', adminUid, 'factures', factureId);
          await updateDoc(factureRef, { lastNotifiedStatus: currentStatus });
          console.log(`[AutoNotifier] ✅ Facture ${factureId} → lastNotifiedStatus mis à jour: ${currentStatus}`);
        } catch (err) {
          console.error(`[AutoNotifier] ❌ Impossible de mettre à jour lastNotifiedStatus sur ${factureId}:`, err);
        }
      }

      console.log('[AutoNotifier] ✅ Vérification terminée.');
    })();
  }, [enabled, firestore, adminUid, factures, articles]);
}
