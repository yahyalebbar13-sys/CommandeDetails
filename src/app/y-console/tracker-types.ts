// ─── YTracker Types ───────────────────────────────────────────────

export type GymSessionType =
  | 'pecs-triceps'
  | 'dos-biceps'
  | 'epaules-avbras'
  | 'jambes'
  | 'cardio-foot';

export interface GymExercise {
  name: string;
  sets: number;
  reps: number;
  weight: number; // kg
}

export interface GymSession {
  type: GymSessionType;
  intensity: 1 | 2 | 3 | 4 | 5; // 1-5 stars
}

export interface Meal {
  id: string;
  name: string;
  proteins: number; // grams
  sugar: number;    // grams
  oil: number;      // tablespoons
  isFastFood: boolean;
  time: string;     // HH:mm
}

export interface SkinEntry {
  routineCompleted: string[];
  rating: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

export interface DailyEntry {
  date: string; // YYYY-MM-DD
  meals: Meal[];
  water: number; // glasses
  gym: GymSession | null;
  skin: SkinEntry;
  weight?: number; // kg
  healthScore?: number; // 0-100 calculated
}

export interface UserGoals {
  dailyProtein: number;    // grams, default 140
  maxSugar: number;        // grams, default 25
  maxOilTbsp: number;      // tablespoons, default 3
  maxFastFoodPerWeek: number; // default 2
  waterGoal: number;       // glasses, default 12
  currentWeight: number;   // kg, default 71
  height: number;          // cm, default 180
}

export interface NotificationSettings {
  enabled: boolean;
  proteinReminders: string[];   // ["08:00", "12:00", "15:00", "19:00"]
  waterReminder: boolean;       // every 2h
  gymReminder: string;          // "17:00"
  skinMorning: string;          // "07:30"
  skinEvening: string;          // "21:30"
  dailyReview: string;          // "22:00"
}

export interface TrackerData {
  entries: Record<string, DailyEntry>; // key = YYYY-MM-DD
  goals: UserGoals;
  notifications: NotificationSettings;
  savedMeals: Meal[]; // Meal templates
  version: number;
}

// ─── Constants ──────────────────────────────────────────────────

export const PROTEIN_SOURCES = [
  { name: 'Poulet (100g)', grams: 31, emoji: '🍗' },
  { name: 'Œuf', grams: 6, emoji: '🥚' },
  { name: 'Whey (scoop)', grams: 24, emoji: '🥤' },
  { name: 'Thon (100g)', grams: 26, emoji: '🐟' },
  { name: 'Steak (100g)', grams: 26, emoji: '🥩' },
  { name: 'Lentilles (100g)', grams: 9, emoji: '🫘' },
  { name: 'Yaourt grec (100g)', grams: 10, emoji: '🥛' },
  { name: 'Amandes (30g)', grams: 6, emoji: '🥜' },
  { name: 'Fromage (30g)', grams: 7, emoji: '🧀' },
  { name: 'Lait (250ml)', grams: 8, emoji: '🥛' },
  { name: 'Saumon (100g)', grams: 25, emoji: '🍣' },
  { name: 'Dinde (100g)', grams: 29, emoji: '🍗' },
] as const;

export const GYM_SESSIONS: { type: GymSessionType; label: string; emoji: string; color: string }[] = [
  { type: 'pecs-triceps', label: 'Pecs + Triceps', emoji: '🔴', color: '#ef4444' },
  { type: 'dos-biceps', label: 'Dos + Biceps', emoji: '🔵', color: '#3b82f6' },
  { type: 'epaules-avbras', label: 'Épaules + Avant-bras', emoji: '🟡', color: '#eab308' },
  { type: 'jambes', label: 'Jambes', emoji: '🟢', color: '#22c55e' },
  { type: 'cardio-foot', label: 'Cardio (Foot)', emoji: '⚽', color: '#f97316' },
];

export const SKIN_ROUTINE_ITEMS = [
  { id: 'cleanser', label: 'Nettoyant', emoji: '🧼' },
  { id: 'moisturizer', label: 'Hydratant', emoji: '💧' },
  { id: 'spf', label: 'SPF / Crème solaire', emoji: '☀️' },
  { id: 'serum', label: 'Sérum', emoji: '💎' },
  { id: 'exfoliant', label: 'Exfoliant', emoji: '✨' },
  { id: 'mask', label: 'Masque', emoji: '🎭' },
];

export const SKIN_RATINGS = [
  { value: 1 as const, emoji: '😡', label: 'Terrible' },
  { value: 2 as const, emoji: '😐', label: 'Pas top' },
  { value: 3 as const, emoji: '😊', label: 'OK' },
  { value: 4 as const, emoji: '😄', label: 'Bien' },
  { value: 5 as const, emoji: '🤩', label: 'Parfait' },
];

export const DEFAULT_GOALS: UserGoals = {
  dailyProtein: 140,
  maxSugar: 25,
  maxOilTbsp: 3,
  maxFastFoodPerWeek: 2,
  waterGoal: 12,
  currentWeight: 71,
  height: 180,
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  proteinReminders: ['08:00', '12:00', '15:00', '19:00'],
  waterReminder: true,
  gymReminder: '17:00',
  skinMorning: '07:30',
  skinEvening: '21:30',
  dailyReview: '22:00',
};

export const STORAGE_KEY = '__sys_console_data';
