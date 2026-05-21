"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language, translations } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('shop_language') as Language;
    if (stored === 'fr' || stored === 'ar') {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('shop_language', lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    let text = translations[key]?.[language] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
