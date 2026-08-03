'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Dumbbell, Apple, Droplets, Flame, TrendingUp, Settings, BarChart3,
  Plus, Minus, Check, X, ChevronRight, Calendar, Target, Zap,
  Bell, BellOff, Download, Upload, Trash2, Trophy, Heart,
  Sun, Moon, Footprints, AlertTriangle, Star, Activity,
} from 'lucide-react';
import {
  type DailyEntry, type TrackerData, type UserGoals, type GymSession,
  type ProteinEntry, type SkinEntry, type NotificationSettings,
  PROTEIN_SOURCES, GYM_SCHEDULE, SKIN_ROUTINE_ITEMS, SKIN_RATINGS,
  DEFAULT_GOALS, DEFAULT_NOTIFICATIONS, STORAGE_KEY,
} from './tracker-types';

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const today = () => new Date().toISOString().split('T')[0];
const dayOfWeek = (d?: string) => {
  const date = d ? new Date(d + 'T12:00:00') : new Date();
  return date.getDay() === 0 ? 7 : date.getDay(); // 1=Mon ... 7=Sun
};
const formatDate = (d: string) => {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const emptyDay = (date: string): DailyEntry => ({
  date,
  proteins: [],
  sugar: 0,
  oil: 0,
  fastFood: false,
  water: 0,
  gym: null,
  skin: { routineCompleted: [], rating: 3 },
});

const loadData = (): TrackerData => {
  const defaults: TrackerData = { entries: {}, goals: { ...DEFAULT_GOALS }, notifications: { ...DEFAULT_NOTIFICATIONS }, version: 1 };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        goals: { ...defaults.goals, ...(parsed.goals || {}) },
        notifications: { ...defaults.notifications, ...(parsed.notifications || {}) },
        entries: parsed.entries || {},
      };
    }
  } catch { /* noop */ }
  return defaults;
};

const saveData = (data: TrackerData) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const getLastNDays = (n: number): string[] => {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

const getWeekDates = (): string[] => {
  const now = new Date();
  const dow = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow - 1));
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

const calcHealthScore = (entry: DailyEntry, goals: UserGoals): number => {
  let score = 0;
  const totalProt = (entry.proteins || []).reduce((s, p) => s + (p.grams || 0), 0);
  const dailyProtGoal = goals?.dailyProtein || 140;
  const maxSugar = goals?.maxSugar || 25;
  const maxOil = goals?.maxOilTbsp || 3;
  const waterGoal = goals?.waterGoal || 12;
  
  score += clamp((totalProt / dailyProtGoal) * 30, 0, 30);
  
  const entrySugar = entry.sugar || 0;
  score += entrySugar <= maxSugar ? 15 : clamp(15 - ((entrySugar - maxSugar) / maxSugar) * 15, 0, 15);
  
  score += (entry.oil || 0) <= maxOil ? 10 : 5;
  
  const entryWater = entry.water || 0;
  score += entryWater >= waterGoal ? 15 : (entryWater / waterGoal) * 15;
  
  if (entry.gym?.completed) score += 20;
  
  const routineLength = entry.skin?.routineCompleted?.length || 0;
  score += (routineLength / Math.max(SKIN_ROUTINE_ITEMS.length, 1)) * 10;
  
  if (entry.fastFood) score -= 10;
  return Math.round(clamp(score, 0, 100));
};

const getStreak = (entries: Record<string, DailyEntry>): number => {
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split('T')[0];
    const e = entries[key];
    if (!e || e.proteins.length === 0) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
};

const getGymStreak = (entries: Record<string, DailyEntry>): number => {
  let weeks = 0;
  const d = new Date();
  while (true) {
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow - 1));
    let weekComplete = true;
    for (let i = 0; i < 5; i++) {
      const wd = new Date(monday);
      wd.setDate(monday.getDate() + i);
      const key = wd.toISOString().split('T')[0];
      if (!entries[key]?.gym?.completed) { weekComplete = false; break; }
    }
    if (!weekComplete) break;
    weeks++;
    d.setDate(d.getDate() - 7);
  }
  return weeks;
};

const getFastFoodThisWeek = (entries: Record<string, DailyEntry>): number => {
  return getWeekDates().filter(d => entries[d]?.fastFood).length;
};

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════

const requestNotifPermission = async () => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
};

const scheduleNotifications = (settings: NotificationSettings) => {
  if (!settings.enabled || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    const reminders: { time: string; title: string; body: string; tag: string }[] = [];
    settings.proteinReminders.forEach((t, i) => {
      reminders.push({ time: t, title: '🥩 Protéines !', body: 'N\'oublie pas tes protéines !', tag: `protein-${i}` });
    });
    if (settings.waterReminder) {
      for (let h = 8; h <= 22; h += 2) {
        reminders.push({ time: `${h.toString().padStart(2, '0')}:00`, title: '💧 Eau !', body: 'Bois un verre d\'eau !', tag: `water-${h}` });
      }
    }
    reminders.push({ time: settings.gymReminder, title: '💪 Gym !', body: 'C\'est l\'heure de ta séance !', tag: 'gym' });
    reminders.push({ time: settings.skinMorning, title: '🧴 Routine Matin', body: 'Fais ta routine peau du matin !', tag: 'skin-am' });
    reminders.push({ time: settings.skinEvening, title: '🌙 Routine Soir', body: 'Fais ta routine peau du soir !', tag: 'skin-pm' });
    reminders.push({ time: settings.dailyReview, title: '📊 Suivi quotidien', body: 'Fais ton bilan du jour !', tag: 'review' });
    reg.active?.postMessage({ type: 'SCHEDULE_NOTIFICATIONS', payload: { reminders } });
  });
};

// ═══════════════════════════════════════════════════════════════════
// REUSABLE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════

const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg ${onClick ? 'cursor-pointer hover:bg-white/10 transition-all active:scale-[0.98]' : ''} ${className}`}
  >
    {children}
  </div>
);

const ProgressRing = ({ value, max, size = 80, color = '#06b6d4', label }: { value: number; max: number; size?: number; color?: string; label?: string }) => {
  const pct = clamp(value / max, 0, 1);
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-white font-bold text-sm">{Math.round(pct * 100)}%</div>
        {label && <div className="text-white/50 text-[9px]">{label}</div>}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, sub, color = '#06b6d4' }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string }) => (
  <GlassCard className="flex items-center gap-3">
    <div className="p-2 rounded-xl" style={{ background: `${color}20` }}>{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-white/50 text-xs">{label}</div>
      <div className="text-white font-bold text-lg leading-tight">{value}</div>
      {sub && <div className="text-white/40 text-xs">{sub}</div>}
    </div>
  </GlassCard>
);

const TabButton = ({ active, icon, label, onClick, badge }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; badge?: number }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all text-xs relative ${active ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/40 hover:text-white/60'}`}
  >
    {icon}
    <span className="text-[10px]">{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{badge}</span>
    )}
  </button>
);

const MiniSparkline = ({ data, color = '#06b6d4', height = 40 }: { data: number[]; color?: string; height?: number }) => {
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 80}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════

type Tab = 'dashboard' | 'nutrition' | 'gym' | 'skin' | 'stats' | 'settings';

export default function YConsolePage() {
  const [data, setData] = useState<TrackerData>({ entries: {}, goals: DEFAULT_GOALS, notifications: DEFAULT_NOTIFICATIONS, version: 1 });
  const [tab, setTab] = useState<Tab>('dashboard');
  const [mounted, setMounted] = useState(false);

  const todayKey = today();
  const todayEntry = data.entries[todayKey] || emptyDay(todayKey);
  const goals = data.goals;

  // Persist + register SW on mount
  useEffect(() => {
    setMounted(true);
    setData(loadData());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/y-sw.js', { scope: '/y-console' }).catch(() => {});
    }
  }, []);

  // Save on data change
  useEffect(() => {
    if (mounted) saveData(data);
  }, [data, mounted]);

  // Schedule notifications on mount or settings change
  useEffect(() => {
    if (mounted && data.notifications.enabled) {
      requestNotifPermission().then((ok) => {
        if (ok) scheduleNotifications(data.notifications);
      });
    }
  }, [mounted, data.notifications]);

  const updateToday = useCallback((updater: (e: DailyEntry) => DailyEntry) => {
    setData((prev) => {
      const entry = prev.entries[todayKey] || emptyDay(todayKey);
      const updated = updater({ ...entry });
      updated.healthScore = calcHealthScore(updated, prev.goals);
      return { ...prev, entries: { ...prev.entries, [todayKey]: updated } };
    });
  }, [todayKey]);

  const updateGoals = useCallback((g: Partial<UserGoals>) => {
    setData((prev) => ({ ...prev, goals: { ...prev.goals, ...g } }));
  }, []);

  const updateNotifs = useCallback((n: Partial<NotificationSettings>) => {
    setData((prev) => ({ ...prev, notifications: { ...prev.notifications, ...n } }));
  }, []);

  // Computed values
  const totalProtein = (todayEntry.proteins || []).reduce((s, p) => s + (p.grams || 0), 0);
  const healthScore = calcHealthScore(todayEntry, goals);
  const streak = useMemo(() => getStreak(data.entries || {}), [data.entries]);
  const gymStreak = useMemo(() => getGymStreak(data.entries || {}), [data.entries]);
  const fastFoodWeek = useMemo(() => getFastFoodThisWeek(data.entries || {}), [data.entries]);
  const todayGymInfo = GYM_SCHEDULE[dayOfWeek()];

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-cyan-400 text-xl font-bold">Loading...</div>
      </div>
    );
  }

  // ─── DASHBOARD TAB ────────────────────────────────────────────
  const DashboardView = () => {
    const last7 = getLastNDays(7);
    const proteinData = last7.map(d => (data.entries[d]?.proteins || []).reduce((s, p) => s + (p.grams || 0), 0));
    const waterData = last7.map(d => data.entries[d]?.water || 0);
    const scoreData = last7.map(d => {
      const e = data.entries[d];
      return e ? calcHealthScore(e, goals) : 0;
    });

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Health Score */}
        <GlassCard className="text-center py-6">
          <div className="text-white/50 text-xs mb-2">SCORE SANTÉ DU JOUR</div>
          <div className="flex justify-center mb-3">
            <ProgressRing value={healthScore} max={100} size={120} color={healthScore >= 70 ? '#22c55e' : healthScore >= 40 ? '#eab308' : '#ef4444'} />
          </div>
          <div className="text-2xl font-black text-white">{healthScore}<span className="text-white/40 text-sm">/100</span></div>
          <div className="text-white/40 text-xs mt-1">
            {healthScore >= 80 ? '🔥 Excellent !' : healthScore >= 60 ? '💪 Bien joué' : healthScore >= 40 ? '⚡ Peut mieux faire' : '😤 Allez on se bouge !'}
          </div>
        </GlassCard>

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Apple size={18} color="#22c55e" />}
            label="Protéines"
            value={`${totalProtein}g`}
            sub={`/ ${goals.dailyProtein}g`}
            color="#22c55e"
          />
          <StatCard
            icon={<Droplets size={18} color="#3b82f6" />}
            label="Eau"
            value={`${todayEntry.water}`}
            sub={`/ ${goals.waterGoal} verres`}
            color="#3b82f6"
          />
          <StatCard
            icon={<Flame size={18} color="#ef4444" />}
            label="Sucre"
            value={`${todayEntry.sugar}g`}
            sub={`max ${goals.maxSugar}g`}
            color={todayEntry.sugar > goals.maxSugar ? '#ef4444' : '#22c55e'}
          />
          <StatCard
            icon={<Zap size={18} color="#f97316" />}
            label="Streak"
            value={`${streak}j`}
            sub="consécutifs"
            color="#f97316"
          />
        </div>

        {/* Today's gym */}
        {todayGymInfo && dayOfWeek() <= 5 && (
          <GlassCard
            className="flex items-center justify-between"
            onClick={() => {
              updateToday((e) => ({
                ...e,
                gym: { type: todayGymInfo.type, completed: !e.gym?.completed },
              }));
            }}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">{todayGymInfo.emoji}</div>
              <div>
                <div className="text-white font-semibold text-sm">{todayGymInfo.label}</div>
                <div className="text-white/40 text-xs">Séance du jour</div>
              </div>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${todayEntry.gym?.completed ? 'bg-green-500' : 'border-2 border-white/20'}`}>
              {todayEntry.gym?.completed && <Check size={16} className="text-white" />}
            </div>
          </GlassCard>
        )}

        {/* Fast food alert */}
        {fastFoodWeek >= goals.maxFastFoodPerWeek && (
          <GlassCard className="border-red-500/30 bg-red-500/10">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={16} />
              <span className="text-sm font-medium">Tu as atteint ta limite de fast food cette semaine ({fastFoodWeek}/{goals.maxFastFoodPerWeek})</span>
            </div>
          </GlassCard>
        )}

        {/* Sparklines */}
        <div className="grid grid-cols-3 gap-3">
          <GlassCard className="p-3">
            <div className="text-white/40 text-[10px] mb-1">Protéines 7j</div>
            <MiniSparkline data={proteinData} color="#22c55e" />
          </GlassCard>
          <GlassCard className="p-3">
            <div className="text-white/40 text-[10px] mb-1">Eau 7j</div>
            <MiniSparkline data={waterData} color="#3b82f6" />
          </GlassCard>
          <GlassCard className="p-3">
            <div className="text-white/40 text-[10px] mb-1">Score 7j</div>
            <MiniSparkline data={scoreData} color="#8b5cf6" />
          </GlassCard>
        </div>
      </div>
    );
  };

  // ─── NUTRITION TAB ────────────────────────────────────────────
  const NutritionView = () => {
    const [customGrams, setCustomGrams] = useState('');
    const [customName, setCustomName] = useState('');

    const addProtein = (source: string, grams: number) => {
      updateToday((e) => ({
        ...e,
        proteins: [...e.proteins, { source, grams, time: new Date().toTimeString().slice(0, 5) }],
      }));
    };

    const removeProtein = (idx: number) => {
      updateToday((e) => ({
        ...e,
        proteins: e.proteins.filter((_, i) => i !== idx),
      }));
    };

    const pct = clamp(totalProtein / goals.dailyProtein, 0, 1.5);

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Protein progress */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">PROTÉINES DU JOUR</span>
            <span className="text-white font-bold">{totalProtein}g <span className="text-white/40 font-normal">/ {goals.dailyProtein}g</span></span>
          </div>
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pct * 100, 100)}%`,
                background: pct >= 1 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : pct >= 0.5 ? 'linear-gradient(90deg, #eab308, #f59e0b)' : 'linear-gradient(90deg, #ef4444, #f87171)',
              }}
            />
          </div>
          <div className="text-white/30 text-xs mt-1">
            {totalProtein >= goals.dailyProtein ? '✅ Objectif atteint !' : `Il te reste ${goals.dailyProtein - totalProtein}g`}
          </div>
        </GlassCard>

        {/* Quick add protein */}
        <div>
          <div className="text-white/50 text-xs mb-2 px-1">AJOUT RAPIDE</div>
          <div className="grid grid-cols-2 gap-2">
            {PROTEIN_SOURCES.map((s) => (
              <button
                key={s.name}
                onClick={() => addProtein(s.name, s.grams)}
                className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.97] transition-all text-left"
              >
                <span className="text-lg">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs font-medium truncate">{s.name}</div>
                  <div className="text-green-400 text-xs font-bold">+{s.grams}g</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom protein */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">AJOUT CUSTOM</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Aliment"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 outline-none focus:border-cyan-500/50"
            />
            <input
              type="number"
              placeholder="g prot"
              value={customGrams}
              onChange={(e) => setCustomGrams(e.target.value)}
              className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={() => {
                if (customName && customGrams) {
                  addProtein(customName, parseInt(customGrams));
                  setCustomName('');
                  setCustomGrams('');
                }
              }}
              className="px-4 py-2 bg-cyan-500 rounded-xl text-white font-medium text-sm active:scale-95 transition-all"
            >
              <Plus size={16} />
            </button>
          </div>
        </GlassCard>

        {/* Log du jour */}
        {(todayEntry.proteins || []).length > 0 && (
          <GlassCard>
            <div className="text-white/50 text-xs mb-2">LOG DU JOUR</div>
            <div className="space-y-2">
              {(todayEntry.proteins || []).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-white text-sm">{p.source}</span>
                    <span className="text-white/30 text-xs ml-2">{p.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-bold text-sm">+{p.grams}g</span>
                    <button onClick={() => removeProtein(i)} className="text-red-400/50 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Sugar tracker */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">SUCRE</span>
            <span className={`font-bold text-sm ${todayEntry.sugar > goals.maxSugar ? 'text-red-400' : 'text-white'}`}>
              {todayEntry.sugar}g / {goals.maxSugar}g
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min((todayEntry.sugar / goals.maxSugar) * 100, 100)}%`,
                background: todayEntry.sugar > goals.maxSugar ? '#ef4444' : todayEntry.sugar > goals.maxSugar * 0.7 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateToday(e => ({ ...e, sugar: Math.max(0, e.sugar - 5) }))}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all"
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              value={todayEntry.sugar}
              onChange={(e) => updateToday(en => ({ ...en, sugar: Math.max(0, parseInt(e.target.value) || 0) }))}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm text-center outline-none"
            />
            <button
              onClick={() => updateToday(e => ({ ...e, sugar: e.sugar + 5 }))}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all"
            >
              <Plus size={14} />
            </button>
          </div>
        </GlassCard>

        {/* Oil tracker */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">HUILE (c.à.s)</span>
            <span className="text-white font-bold text-sm">{todayEntry.oil} / {goals.maxOilTbsp}</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => updateToday(e => ({ ...e, oil: n }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-90 ${todayEntry.oil >= n
                  ? n > goals.maxOilTbsp ? 'bg-red-500/30 text-red-300 border border-red-500/30' : 'bg-amber-500/30 text-amber-300 border border-amber-500/30'
                  : 'bg-white/5 text-white/30 border border-white/10'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Water tracker */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">EAU (verres)</span>
            <span className="text-white font-bold text-sm">{todayEntry.water} / {goals.waterGoal}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateToday(e => ({ ...e, water: Math.max(0, e.water - 1) }))}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all"
            >
              <Minus size={16} />
            </button>
            <div className="flex-1 flex gap-1 flex-wrap">
              {Array.from({ length: goals.waterGoal }).map((_, i) => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full transition-all duration-300 ${i < todayEntry.water ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-white/10'}`}
                />
              ))}
            </div>
            <button
              onClick={() => updateToday(e => ({ ...e, water: e.water + 1 }))}
              className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 active:scale-90 transition-all"
            >
              <Plus size={16} />
            </button>
          </div>
        </GlassCard>

        {/* Fast food */}
        <GlassCard
          className={`flex items-center justify-between ${todayEntry.fastFood ? 'border-red-500/30' : ''}`}
          onClick={() => updateToday(e => ({ ...e, fastFood: !e.fastFood }))}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍔</span>
            <div>
              <div className="text-white text-sm font-medium">Fast Food aujourd'hui ?</div>
              <div className="text-white/40 text-xs">Cette semaine : {fastFoodWeek}/{goals.maxFastFoodPerWeek}</div>
            </div>
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${todayEntry.fastFood ? 'bg-red-500' : 'border-2 border-white/20'}`}>
            {todayEntry.fastFood && <Check size={16} className="text-white" />}
          </div>
        </GlassCard>
      </div>
    );
  };

  // ─── GYM TAB ──────────────────────────────────────────────────
  const GymView = () => {
    const weekDates = getWeekDates();

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Week overview */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-3">PROGRAMME DE LA SEMAINE</div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((d) => {
              const info = GYM_SCHEDULE[d];
              const dateStr = weekDates[d - 1];
              const entry = data.entries[dateStr];
              const isToday = dateStr === todayKey;
              const done = entry?.gym?.completed || false;

              return (
                <button
                  key={d}
                  onClick={() => {
                    if (!isToday) return;
                    updateToday((e) => ({
                      ...e,
                      gym: { type: info.type, completed: !e.gym?.completed },
                    }));
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isToday ? 'bg-white/10 border border-cyan-500/30' : 'bg-white/5'} ${isToday ? 'active:scale-[0.98]' : 'opacity-70'}`}
                >
                  <div className="text-lg">{info.emoji}</div>
                  <div className="flex-1 text-left">
                    <div className={`text-sm font-medium ${isToday ? 'text-white' : 'text-white/60'}`}>{info.label}</div>
                    <div className="text-white/30 text-xs">{formatDate(dateStr)}</div>
                  </div>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${done ? 'bg-green-500' : 'border-2 border-white/20'}`}>
                    {done && <Check size={14} className="text-white" />}
                  </div>
                </button>
              );
            })}
            {/* Weekend */}
            {[6, 7].map((d) => {
              const dateStr = weekDates[d - 1];
              return (
                <div key={d} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 opacity-40">
                  <div className="text-lg">😴</div>
                  <div className="flex-1">
                    <div className="text-white/60 text-sm">Repos</div>
                    <div className="text-white/30 text-xs">{formatDate(dateStr)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Gym streaks */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Trophy size={18} color="#f97316" />} label="Streak Gym" value={`${gymStreak}`} sub="semaines complètes" color="#f97316" />
          <StatCard
            icon={<Activity size={18} color="#8b5cf6" />}
            label="Ce mois"
            value={`${Object.values(data.entries).filter(e => {
              const d = new Date(e.date + 'T12:00:00');
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.gym?.completed;
            }).length}`}
            sub="séances"
            color="#8b5cf6"
          />
        </div>

        {/* Weight tracker */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">POIDS CORPOREL</div>
          <div className="flex items-center gap-3">
            <button onClick={() => updateToday(e => ({ ...e, weight: (e.weight || goals.currentWeight) - 0.5 }))} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all">
              <Minus size={16} />
            </button>
            <div className="flex-1 text-center">
              <div className="text-white text-3xl font-black">{todayEntry.weight || goals.currentWeight}<span className="text-white/40 text-sm ml-1">kg</span></div>
              <div className="text-white/30 text-xs">IMC : {((todayEntry.weight || goals.currentWeight) / (goals.height / 100) ** 2).toFixed(1)}</div>
            </div>
            <button onClick={() => updateToday(e => ({ ...e, weight: (e.weight || goals.currentWeight) + 0.5 }))} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all">
              <Plus size={16} />
            </button>
          </div>
        </GlassCard>

        {/* Heatmap - last 12 weeks */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">ACTIVITÉ (12 semaines)</div>
          <div className="grid grid-cols-12 gap-1">
            {getLastNDays(84).map((d) => {
              const e = data.entries[d];
              const hasGym = e?.gym?.completed;
              const dow = dayOfWeek(d);
              const isWeekend = dow > 5;
              return (
                <div
                  key={d}
                  title={`${formatDate(d)} — ${hasGym ? '✅' : isWeekend ? 'Repos' : '❌'}`}
                  className="aspect-square rounded-sm transition-all"
                  style={{
                    background: hasGym ? '#22c55e' : isWeekend ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                    opacity: hasGym ? 1 : 0.5,
                  }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-white/30">
            <span>Moins</span>
            <div className="w-3 h-3 rounded-sm bg-white/5" />
            <div className="w-3 h-3 rounded-sm bg-green-500/30" />
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Plus</span>
          </div>
        </GlassCard>
      </div>
    );
  };

  // ─── SKIN TAB ─────────────────────────────────────────────────
  const SkinView = () => {
    const toggleRoutine = (id: string) => {
      updateToday((e) => {
        const completed = e.skin.routineCompleted.includes(id)
          ? e.skin.routineCompleted.filter((r) => r !== id)
          : [...e.skin.routineCompleted, id];
        return { ...e, skin: { ...e.skin, routineCompleted: completed } };
      });
    };

    const setRating = (r: 1 | 2 | 3 | 4 | 5) => {
      updateToday((e) => ({ ...e, skin: { ...e.skin, rating: r } }));
    };

    const routinePct = ((todayEntry.skin?.routineCompleted || []).length / SKIN_ROUTINE_ITEMS.length) * 100;
    const last14 = getLastNDays(14);
    const skinData = last14.map(d => ({
      day: formatDate(d).split(' ')[1],
      rating: data.entries[d]?.skin?.rating || 0,
    }));

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Routine progress */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-xs">ROUTINE DU JOUR</span>
            <span className="text-white text-sm font-bold">{Math.round(routinePct)}%</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${routinePct}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }}
            />
          </div>
          <div className="space-y-2">
            {SKIN_ROUTINE_ITEMS.map((item) => {
              const done = (todayEntry.skin?.routineCompleted || []).includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleRoutine(item.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${done ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-white/5 border border-white/10'}`}
                >
                  <span className="text-lg">{item.emoji}</span>
                  <span className={`flex-1 text-left text-sm ${done ? 'text-white line-through' : 'text-white/70'}`}>{item.label}</span>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${done ? 'bg-violet-500' : 'border border-white/20'}`}>
                    {done && <Check size={12} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>

        {/* Skin rating */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-3">ÉTAT DE LA PEAU AUJOURD'HUI</div>
          <div className="flex justify-between">
            {SKIN_RATINGS.map((r) => (
              <button
                key={r.value}
                onClick={() => setRating(r.value)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-90 ${(todayEntry.skin?.rating || 3) === r.value ? 'bg-violet-500/20 border border-violet-500/30 scale-110' : 'opacity-50'}`}
              >
                <span className="text-2xl">{r.emoji}</span>
                <span className="text-white/50 text-[10px]">{r.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Skin evolution chart */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">ÉVOLUTION (14 jours)</div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={skinData}>
              <defs>
                <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="rating" stroke="#8b5cf6" fill="url(#skinGrad)" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>
    );
  };

  // ─── STATS TAB ────────────────────────────────────────────────
  const StatsView = () => {
    const [period, setPeriod] = useState<7 | 30 | 90>(7);
    const days = getLastNDays(period);

    const proteinChartData = days.map(d => ({
      day: period <= 7 ? formatDate(d).split(' ')[0] : d.slice(8),
      protein: (data.entries[d]?.proteins || []).reduce((s, p) => s + (p.grams || 0), 0),
      goal: goals.dailyProtein,
    }));

    const sugarChartData = days.map(d => ({
      day: period <= 7 ? formatDate(d).split(' ')[0] : d.slice(8),
      sugar: data.entries[d]?.sugar || 0,
      max: goals.maxSugar,
    }));

    const gymCompletionData = (() => {
      const totalWorkDays = days.filter(d => dayOfWeek(d) <= 5).length;
      const doneDays = days.filter(d => data.entries[d]?.gym?.completed).length;
      return { total: totalWorkDays, done: doneDays, pct: totalWorkDays ? Math.round((doneDays / totalWorkDays) * 100) : 0 };
    })();

    const macroData = (() => {
      let totalProt = 0, totalSugar = 0, totalOil = 0;
      days.forEach(d => {
        const e = data.entries[d];
        if (!e) return;
        totalProt += (e.proteins || []).reduce((s, p) => s + (p.grams || 0), 0);
        totalSugar += e.sugar || 0;
        totalOil += (e.oil || 0) * 14; // 1 tbsp ≈ 14g
      });
      return [
        { name: 'Protéines', value: totalProt, color: '#22c55e' },
        { name: 'Sucre', value: totalSugar, color: '#ef4444' },
        { name: 'Huile', value: totalOil, color: '#eab308' },
      ];
    })();

    const scoreChartData = days.map(d => ({
      day: period <= 7 ? formatDate(d).split(' ')[0] : d.slice(8),
      score: data.entries[d] ? calcHealthScore(data.entries[d], goals) : 0,
    }));

    const weightData = days.map(d => ({
      day: period <= 7 ? formatDate(d).split(' ')[0] : d.slice(8),
      weight: data.entries[d]?.weight || null,
    })).filter(d => d.weight !== null);

    // Records
    const allEntries = Object.values(data.entries || {});
    const maxProteinDay = allEntries.reduce((max, e) => {
      const p = (e.proteins || []).reduce((s, pr) => s + (pr.grams || 0), 0);
      return p > max ? p : max;
    }, 0);
    const avgScore = allEntries.length ? Math.round(allEntries.reduce((s, e) => s + calcHealthScore(e, goals), 0) / allEntries.length) : 0;
    const totalDays = allEntries.length;

    // This week vs last week
    const thisWeek = getLastNDays(7);
    const lastWeek = getLastNDays(14).slice(0, 7);
    const thisWeekProt = thisWeek.reduce((s, d) => s + ((data.entries[d]?.proteins || []).reduce((ps, p) => ps + (p.grams || 0), 0)), 0);
    const lastWeekProt = lastWeek.reduce((s, d) => s + ((data.entries[d]?.proteins || []).reduce((ps, p) => ps + (p.grams || 0), 0)), 0);

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Period selector */}
        <div className="flex gap-2">
          {([7, 30, 90] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${period === p ? 'bg-cyan-500 text-white' : 'bg-white/5 text-white/40'}`}
            >
              {p}j
            </button>
          ))}
        </div>

        {/* Records */}
        <div className="grid grid-cols-3 gap-3">
          <GlassCard className="text-center p-3">
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-white font-bold">{maxProteinDay}g</div>
            <div className="text-white/40 text-[10px]">Max protéines</div>
          </GlassCard>
          <GlassCard className="text-center p-3">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-white font-bold">{avgScore}</div>
            <div className="text-white/40 text-[10px]">Score moyen</div>
          </GlassCard>
          <GlassCard className="text-center p-3">
            <div className="text-2xl mb-1">📅</div>
            <div className="text-white font-bold">{totalDays}</div>
            <div className="text-white/40 text-[10px]">Jours trackés</div>
          </GlassCard>
        </div>

        {/* Week comparison */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">CETTE SEMAINE VS SEMAINE DERNIÈRE</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <div className="text-white/40 text-xs">Semaine passée</div>
              <div className="text-white text-xl font-bold">{lastWeekProt}g</div>
            </div>
            <div className={`text-sm font-bold ${thisWeekProt >= lastWeekProt ? 'text-green-400' : 'text-red-400'}`}>
              {thisWeekProt >= lastWeekProt ? '↑' : '↓'} {Math.abs(thisWeekProt - lastWeekProt)}g
            </div>
            <div className="flex-1 text-center">
              <div className="text-cyan-400/60 text-xs">Cette semaine</div>
              <div className="text-cyan-400 text-xl font-bold">{thisWeekProt}g</div>
            </div>
          </div>
        </GlassCard>

        {/* Protein chart */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">PROTÉINES ({period}j)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={proteinChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
              <Bar dataKey="protein" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="goal" stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Sugar chart */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">SUCRE ({period}j)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={sugarChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
              <Line type="monotone" dataKey="sugar" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
              <Line type="monotone" dataKey="max" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Health score trend */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">SCORE SANTÉ ({period}j)</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={scoreChartData}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#06b6d4" fill="url(#scoreGrad)" strokeWidth={2} dot={{ fill: '#06b6d4', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Gym completion */}
        <GlassCard className="text-center">
          <div className="text-white/50 text-xs mb-2">COMPLÉTION GYM ({period}j)</div>
          <div className="flex justify-center mb-2">
            <ProgressRing value={gymCompletionData.done} max={gymCompletionData.total} size={100} color="#f97316" label="séances" />
          </div>
          <div className="text-white/40 text-xs">{gymCompletionData.done} / {gymCompletionData.total} séances</div>
        </GlassCard>

        {/* Macro distribution */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-2">DISTRIBUTION MACROS ({period}j)</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={macroData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {macroData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Weight evolution */}
        {weightData.length > 1 && (
          <GlassCard>
            <div className="text-white/50 text-xs mb-2">ÉVOLUTION POIDS</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="weight" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>
        )}
      </div>
    );
  };

  // ─── SETTINGS TAB ─────────────────────────────────────────────
  const SettingsView = () => {
    const exportData = () => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ytracker-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const importData = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const imported = JSON.parse(ev.target?.result as string);
            setData(imported);
          } catch { alert('Fichier invalide'); }
        };
        reader.readAsText(file);
      };
      input.click();
    };

    const resetData = () => {
      if (confirm('⚠️ Supprimer TOUTES les données ? Cette action est irréversible !')) {
        setData({ entries: {}, goals: { ...DEFAULT_GOALS }, notifications: { ...DEFAULT_NOTIFICATIONS }, version: 1 });
      }
    };

    const GoalInput = ({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (v: number) => void }) => (
      <div className="flex items-center justify-between py-3 border-b border-white/5">
        <span className="text-white/70 text-sm">{label}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onChange(Math.max(0, value - 1))} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white active:scale-90">
            <Minus size={12} />
          </button>
          <span className="text-white font-bold text-sm w-12 text-center">{value}</span>
          <button onClick={() => onChange(value + 1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white active:scale-90">
            <Plus size={12} />
          </button>
          <span className="text-white/30 text-xs w-8">{unit}</span>
        </div>
      </div>
    );

    return (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
        {/* Goals */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-1">OBJECTIFS QUOTIDIENS</div>
          <GoalInput label="Protéines" value={goals.dailyProtein} unit="g" onChange={(v) => updateGoals({ dailyProtein: v })} />
          <GoalInput label="Sucre max" value={goals.maxSugar} unit="g" onChange={(v) => updateGoals({ maxSugar: v })} />
          <GoalInput label="Huile max" value={goals.maxOilTbsp} unit="c.à.s" onChange={(v) => updateGoals({ maxOilTbsp: v })} />
          <GoalInput label="Eau" value={goals.waterGoal} unit="verres" onChange={(v) => updateGoals({ waterGoal: v })} />
          <GoalInput label="Fast food/sem" value={goals.maxFastFoodPerWeek} unit="max" onChange={(v) => updateGoals({ maxFastFoodPerWeek: v })} />
        </GlassCard>

        {/* Body */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-1">PROFIL</div>
          <GoalInput label="Poids actuel" value={goals.currentWeight} unit="kg" onChange={(v) => updateGoals({ currentWeight: v })} />
          <GoalInput label="Taille" value={goals.height} unit="cm" onChange={(v) => updateGoals({ height: v })} />
          <div className="pt-2 text-white/30 text-xs">
            IMC : {(goals.currentWeight / (goals.height / 100) ** 2).toFixed(1)}
          </div>
        </GlassCard>

        {/* Notifications */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-xs">NOTIFICATIONS</span>
            <button
              onClick={() => {
                const newEnabled = !data.notifications.enabled;
                updateNotifs({ enabled: newEnabled });
                if (newEnabled) requestNotifPermission();
              }}
              className={`w-12 h-6 rounded-full transition-all relative ${data.notifications.enabled ? 'bg-cyan-500' : 'bg-white/10'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${data.notifications.enabled ? 'left-[26px]' : 'left-0.5'}`} />
            </button>
          </div>
          {data.notifications.enabled && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-white/50">
                <Bell size={14} /> <span>Protéines : {data.notifications.proteinReminders.join(', ')}</span>
              </div>
              <div className="flex items-center gap-2 text-white/50">
                <Droplets size={14} /> <span>Eau : toutes les 2h</span>
              </div>
              <div className="flex items-center gap-2 text-white/50">
                <Dumbbell size={14} /> <span>Gym : {data.notifications.gymReminder}</span>
              </div>
              <div className="flex items-center gap-2 text-white/50">
                <Sun size={14} /> <span>Peau matin : {data.notifications.skinMorning}</span>
              </div>
              <div className="flex items-center gap-2 text-white/50">
                <Moon size={14} /> <span>Peau soir : {data.notifications.skinEvening}</span>
              </div>
              <div className="flex items-center gap-2 text-white/50">
                <BarChart3 size={14} /> <span>Bilan : {data.notifications.dailyReview}</span>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Data management */}
        <GlassCard>
          <div className="text-white/50 text-xs mb-3">DONNÉES</div>
          <div className="space-y-2">
            <button onClick={exportData} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-[0.98]">
              <Download size={16} className="text-cyan-400" />
              <span className="text-white text-sm">Exporter (JSON)</span>
            </button>
            <button onClick={importData} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-[0.98]">
              <Upload size={16} className="text-green-400" />
              <span className="text-white text-sm">Importer (JSON)</span>
            </button>
            <button onClick={resetData} className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-all active:scale-[0.98]">
              <Trash2 size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">Supprimer toutes les données</span>
            </button>
          </div>
        </GlassCard>
      </div>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────
  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <Activity size={18} />, label: 'Home' },
    { key: 'nutrition', icon: <Apple size={18} />, label: 'Nutri' },
    { key: 'gym', icon: <Dumbbell size={18} />, label: 'Gym' },
    { key: 'skin', icon: <Heart size={18} />, label: 'Skin' },
    { key: 'stats', icon: <BarChart3 size={18} />, label: 'Stats' },
    { key: 'settings', icon: <Settings size={18} />, label: 'Config' },
  ];

  return (
    <div className="min-h-screen text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-black bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              YTracker
            </h1>
            <div className="text-white/30 text-[10px]">{formatDate(todayKey)}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/5 rounded-full px-2 py-1">
              <Zap size={12} className="text-orange-400" />
              <span className="text-white text-xs font-bold">{streak}</span>
            </div>
            {data.notifications.enabled ? (
              <Bell size={16} className="text-cyan-400" />
            ) : (
              <BellOff size={16} className="text-white/20" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 max-w-lg mx-auto">
        {tab === 'dashboard' && <DashboardView />}
        {tab === 'nutrition' && <NutritionView />}
        {tab === 'gym' && <GymView />}
        {tab === 'skin' && <SkinView />}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/90 border-t border-white/5">
        <div className="flex justify-around items-center px-2 py-1 max-w-lg mx-auto safe-area-pb">
          {tabs.map((t) => (
            <TabButton
              key={t.key}
              active={tab === t.key}
              icon={t.icon}
              label={t.label}
              onClick={() => setTab(t.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
