import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Nettoie récursivement un objet pour retirer toutes les valeurs `undefined`
 * empêchant les erreurs "Unsupported field value: undefined" de Firebase Firestore.
 */
export function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => (item && typeof item === 'object' && item.constructor === Object ? cleanUndefined(item) : item)) as any;
  }
  // Ne pas altérer les instances spéciales (ServerTimestampFieldValueImpl, Date, Timestamp, etc.)
  if (obj.constructor !== Object) {
    return obj;
  }
  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && val.constructor === Object) {
        cleaned[key] = cleanUndefined(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}
