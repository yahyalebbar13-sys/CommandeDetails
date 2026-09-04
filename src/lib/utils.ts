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
      .map(item => (item && typeof item === 'object' && !(item instanceof Date) ? cleanUndefined(item) : item)) as any;
  }
  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !(val instanceof Date) && typeof (val as any).toMillis !== 'function') {
        cleaned[key] = cleanUndefined(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}
