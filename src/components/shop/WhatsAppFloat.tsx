"use client";

import React, { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/language-context";

export default function WhatsAppFloat() {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000);
    const pulseTimer = setTimeout(() => setPulse(false), 6000);
    return () => { clearTimeout(timer); clearTimeout(pulseTimer); };
  }, []);

  const message = language === 'ar'
    ? "السلام عليكم، بغيت نطلب من عندكم"
    : "Bonjour, je souhaite commander sur LEBTEX";

  const href = `https://wa.me/212760998347?text=${encodeURIComponent(message)}`;

  if (!visible) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-4 z-[100] flex items-center gap-3 group"
      aria-label="Commander sur WhatsApp"
    >
      {/* Tooltip */}
      <span className="hidden sm:flex items-center px-3 py-2 rounded-xl bg-white shadow-lg border border-gray-100 text-sm font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 whitespace-nowrap">
        {language === 'ar' ? 'اطلب عبر الواتساب' : 'Commander sur WhatsApp'}
      </span>

      {/* Button */}
      <div className="relative">
        {/* Pulse ring */}
        {pulse && (
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
        )}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(37,211,102,0.4)] hover:scale-110 active:scale-95 transition-transform duration-200 cursor-pointer"
          style={{ backgroundColor: "#25D166" }}
        >
          {/* WhatsApp SVG icon */}
          <svg viewBox="0 0 32 32" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.004 2.667C8.636 2.667 2.667 8.636 2.667 16c0 2.356.636 4.658 1.848 6.672L2.667 29.333l6.862-1.799A13.267 13.267 0 0016.004 29.333C23.372 29.333 29.333 23.364 29.333 16S23.372 2.667 16.004 2.667zm0 24a10.625 10.625 0 01-5.474-1.521l-.39-.233-4.072 1.067 1.088-3.963-.255-.407A10.622 10.622 0 015.333 16c0-5.887 4.784-10.667 10.671-10.667S26.667 10.113 26.667 16 21.887 26.667 16.004 26.667zm5.848-7.953c-.32-.16-1.894-.935-2.188-1.04-.294-.107-.508-.16-.72.16-.215.32-.83 1.04-1.02 1.254-.187.213-.373.24-.694.08-.32-.16-1.352-.5-2.576-1.592-.952-.852-1.595-1.904-1.782-2.224-.187-.32-.02-.493.14-.653.146-.144.32-.374.48-.56.16-.187.214-.32.32-.534.107-.213.054-.4-.026-.56-.08-.16-.72-1.736-.985-2.376-.26-.624-.524-.54-.72-.55l-.614-.01c-.213 0-.56.08-.854.4-.293.32-1.12 1.094-1.12 2.67 0 1.578 1.147 3.104 1.307 3.318.16.213 2.26 3.45 5.48 4.837.765.33 1.362.527 1.828.675.768.244 1.467.21 2.02.127.615-.092 1.894-.775 2.16-1.524.268-.748.268-1.39.188-1.524-.08-.133-.294-.213-.614-.373z"/>
          </svg>
        </div>
      </div>
    </a>
  );
}
