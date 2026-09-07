/**
 * Utility function to find the last purchase price (PA) of an article / product
 * among all existing articles in the database.
 */

export interface LastOrderResult {
  price: number;
  orderDate?: string;
  supplierId?: string;
  unitOfMeasure?: string;
  matchedArticleName?: string;
  status?: string;
  isExactMatch?: boolean;
}

function getArticleTimestamp(a: any): number {
  if (a.orderDate) {
    const t = new Date(a.orderDate).getTime();
    if (!isNaN(t)) return t;
  }
  if (a.arrivalDate) {
    const t = new Date(a.arrivalDate).getTime();
    if (!isNaN(t)) return t;
  }
  if (a.createdAt?.seconds) return a.createdAt.seconds * 1000;
  if (a.createdAt) {
    const t = new Date(a.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export function findLastOrderPrice(
  target: any,
  allArticles: any[]
): LastOrderResult | null {
  if (!target || !Array.isArray(allArticles) || allArticles.length === 0) {
    return null;
  }

  const targetCat = String(target.categoryId || '').trim().toLowerCase();
  const targetName = String(target.name || '').trim().toLowerCase();
  const targetSize = String(target.size || '').trim().toLowerCase();
  const targetColor = String(target.color || '').trim().toLowerCase();
  const targetSpecs = String(target.specs || '').trim().toLowerCase();
  const targetZipper = String(target.zipperType || '').trim().toLowerCase();
  const targetGsm = Number(target.gsm) || null;
  const targetWidth = Number(target.fabricWidth) || null;

  if (!targetCat && !targetName) return null;

  // Filter valid candidate articles
  const candidates = allArticles.filter(c => {
    if (!c || c.id === target.id) return false;
    const price = Number(c.purchasePricePerUnit);
    if (!price || isNaN(price) || price <= 0) return false;

    const cCat = String(c.categoryId || '').trim().toLowerCase();
    const cName = String(c.name || '').trim().toLowerCase();

    // Check if category or name matches
    const exactProductMatch =
      (targetCat && (cCat === targetCat || cName === targetCat)) ||
      (targetName && (cCat === targetName || cName === targetName));

    const partialProductMatch =
      !exactProductMatch &&
      ((targetCat && (cCat.includes(targetCat) || cName.includes(targetCat) || targetCat.includes(cCat) || targetCat.includes(cName))) ||
       (targetName && (cCat.includes(targetName) || cName.includes(targetName) || targetName.includes(cCat) || targetName.includes(cName))));

    return exactProductMatch || partialProductMatch;
  });

  if (candidates.length === 0) return null;

  // Score each candidate
  const scored = candidates.map(c => {
    const cCat = String(c.categoryId || '').trim().toLowerCase();
    const cName = String(c.name || '').trim().toLowerCase();
    const exactProduct =
      (targetCat && (cCat === targetCat || cName === targetCat)) ||
      (targetName && (cCat === targetName || cName === targetName));

    let score = exactProduct ? 100 : 40;

    // Favor actual launched or delivered orders over drafts
    const isActualOrder = (c.status && c.status !== 'TO_ORDER') || !!c.factureId;
    if (isActualOrder) {
      score += 80;
    }

    // Size matching
    const cSize = String(c.size || '').trim().toLowerCase();
    if (targetSize && cSize && targetSize !== 'various' && cSize !== 'various') {
      if (targetSize === cSize) {
        score += 50;
      } else {
        score -= 25;
      }
    }

    // Fabric GSM & Width matching
    const cGsm = Number(c.gsm) || null;
    if (targetGsm && cGsm) {
      if (targetGsm === cGsm) score += 40;
      else score -= 20;
    }

    const cWidth = Number(c.fabricWidth) || null;
    if (targetWidth && cWidth) {
      if (targetWidth === cWidth) score += 40;
      else score -= 20;
    }

    // Zipper type matching
    const cZipper = String(c.zipperType || '').trim().toLowerCase();
    if (targetZipper && cZipper) {
      if (targetZipper === cZipper) score += 30;
      else score -= 15;
    }

    // Specs matching
    const cSpecs = String(c.specs || '').trim().toLowerCase();
    if (targetSpecs && cSpecs) {
      if (targetSpecs === cSpecs) score += 20;
    }

    // Color matching
    const cColor = String(c.color || '').trim().toLowerCase();
    if (targetColor && cColor && targetColor !== 'various' && cColor !== 'various') {
      if (targetColor === cColor) score += 15;
    }

    const timestamp = getArticleTimestamp(c);

    return { candidate: c, score, timestamp };
  });

  // Sort by score desc, then timestamp desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.timestamp - a.timestamp;
  });

  const best = scored[0].candidate;
  return {
    price: Number(best.purchasePricePerUnit),
    orderDate: best.orderDate || (best.arrivalDate ? best.arrivalDate : undefined),
    supplierId: best.supplierId || undefined,
    unitOfMeasure: best.unitOfMeasure || target.unitOfMeasure || undefined,
    matchedArticleName: best.name || best.categoryId,
    status: best.status,
    isExactMatch: scored[0].score >= 150,
  };
}
