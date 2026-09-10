import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Nettoie récursivement un objet pour retirer toutes les valeurs `undefined`
 * empêchant les erreurs "Unsupported field value: undefined" de Firebase Firestore.
 */
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => cleanUndefined(item)) as any;
  }

  // Ne pas altérer les instances spéciales (ServerTimestampFieldValueImpl, Date, Timestamp, etc.)
  if (obj.constructor !== Object) {
    return obj;
  }

  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      cleaned[key] = cleanUndefined(val);
    }
  }
  return cleaned;
}
