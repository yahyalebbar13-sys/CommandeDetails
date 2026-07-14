/**
 * useEnrichedArticles — joins articles with their linked facture dates
 * to compute the correct effective status for every article.
 *
 * Call this ONCE at the top level (AdminApp) and pass enrichedArticles
 * to all child views instead of raw articles.
 */

import { useMemo } from 'react';
import { computeEffectiveStatus } from '@/lib/status-utils';

export function useEnrichedArticles(articles: any[], factures: any[]): any[] {
  return useMemo(() => {
    if (!articles || !factures) return articles || [];

    return articles.map(a => {
      // Find the linked dossier (facture)
      const facture = factures.find((f: any) => f.id === a.factureId);

      // Facture (dossier) is the source of truth for dates.
      // When an article belongs to a dossier, always use the dossier's dates.
      // Fall back to the article's own dates only when there is no linked dossier.
      const arrivalDate = facture ? (facture.arrivalDate || null) : (a.arrivalDate || null);
      const stockEntryDate = facture ? (facture.stockEntryDate || null) : (a.stockEntryDate || null);

      // ─── STATUS SYSTEM ─────────────────────────────────────────────────────
      // Manual statuses — always respected, NEVER overridden by dates:
      //   TO_ORDER   → article not yet ordered
      //   PI         → in production
      //   DELIVERED  → delivered to client (end of lifecycle)
      //
      // Automatic statuses — derived from dossier dates:
      //   TRANSIT    → arrivalDate in future
      //   CUSTOMS    → arrivalDate passed, no stockEntryDate yet
      //   STOCK      → stockEntryDate reached
      // ───────────────────────────────────────────────────────────────────────

      const MANUAL_STATUSES = ['TO_ORDER', 'PI', 'DELIVERED'];
      const storedStatus = a.status;

      // If the article has a manual status, never override it with dates
      if (MANUAL_STATUSES.includes(storedStatus)) {
        return a; // return as-is, no enrichment needed
      }

      // For all other articles (SHIPPED, TRANSIT, CUSTOMS, STOCK, or anything else):
      // if they belong to a dossier with dates, always re-derive from dates.
      // This ensures changing the dossier's stockEntryDate → STOCK, etc.
      const baseStatus = facture && (arrivalDate || stockEntryDate) ? 'SHIPPED' : storedStatus;

      // Compute the effective status — TRANSIT / CUSTOMS / STOCK based on dates
      const effectiveStatus = computeEffectiveStatus({
        status: baseStatus,
        arrivalDate,
        stockEntryDate,
      });

      // Only add date fields if they weren't already on the article
      // (avoids unnecessary object churn for articles without factures)
      if (
        effectiveStatus === a.status &&
        arrivalDate === a.arrivalDate &&
        stockEntryDate === a.stockEntryDate
      ) {
        return a;
      }

      return {
        ...a,
        // Enrich with facture dates so all views have them
        arrivalDate,
        stockEntryDate,
        // Expose effective status as a computed field
        // so views can use it without re-computing
        effectiveStatus,
        // Keep the raw Firestore status for edit operations
        rawStatus: a.status,
        // Override .status so all views get the correct value automatically
        status: effectiveStatus,
      };
    });
  }, [articles, factures]);
}
