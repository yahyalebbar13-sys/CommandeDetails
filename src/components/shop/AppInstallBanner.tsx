"use client";

import React, { useState, useEffect } from "react";
import { X, Download, Smartphone } from "lucide-react";

export default function AppInstallBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    // Check if the user has already dismissed the banner
    const dismissed = localStorage.getItem("lebtex_app_banner_dismissed");
    if (!dismissed) {
      // Delay showing the banner so it doesn't pop up immediately on page load
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("lebtex_app_banner_dismissed", "true");
  };

  const handleInstallClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white shadow-2xl rounded-2xl border border-gray-100 z-50 overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
      <div className="flex items-start p-4 gap-4 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 bg-gradient-to-br from-[#1A1A1A] to-[#333] rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
          <Smartphone className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 pr-6">
          <h4 className="text-sm font-bold text-gray-900 mb-1 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            L'App LEBTEX arrive !
          </h4>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Suivez vos commandes et accédez aux tarifs B2B directement depuis votre poche.
          </p>

          <button
            onClick={handleInstallClick}
            disabled={clicked}
            className={`flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              clicked 
                ? "bg-green-50 text-green-600 border border-green-200" 
                : "bg-[#1A1A1A] text-white hover:bg-black"
            }`}
          >
            {clicked ? (
              "Bientôt disponible !"
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Découvrir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
