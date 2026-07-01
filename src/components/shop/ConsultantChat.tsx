"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, User } from "lucide-react";
import { getWhatsAppContact } from "@/lib/shop-utils";

export default function ConsultantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [hasScrolled, setHasScrolled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setHasScrolled(true);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // Send the user to WhatsApp with their typed message
    const url = getWhatsAppContact(message);
    window.open(url, "_blank");
    setMessage("");
    setIsOpen(false);
  };

  if (!hasScrolled && !isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      
      {/* ── Chat Window ──────────────────────────────────────────────────────── */}
      <div 
        className={`pointer-events-auto w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden mb-4 transition-all duration-300 origin-bottom-right ${
          isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4 pointer-events-none absolute bottom-16 right-0"
        }`}
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1A1A1A]" />
            </div>
            <div>
              <h4 className="text-white font-bold text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>Mohamed</h4>
              <p className="text-white/60 text-xs">Consultant LEBTEX</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="p-4 bg-gray-50 h-64 overflow-y-auto flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white p-3 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 text-sm text-gray-700 leading-relaxed">
              Bonjour ! 👋 <br/>
              Je suis Mohamed, votre conseiller dédié. Avez-vous des questions sur nos produits, le service d'import ou besoin d'aide pour passer commande ?
            </div>
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-gray-100 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Écrivez votre message..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] transition-all"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="p-2 bg-[#25D366] text-white rounded-xl hover:bg-[#20bd5a] disabled:opacity-50 disabled:hover:bg-[#25D366] transition-colors flex items-center justify-center shadow-lg shadow-[#25D366]/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* ── Chat Bubble Button ────────────────────────────────────────────────── */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        className={`pointer-events-auto flex items-center justify-center w-14 h-14 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-transform duration-300 hover:scale-110 active:scale-95 ${
          isOpen ? "bg-gray-800 text-white" : "bg-[#1A1A1A] text-white"
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

    </div>
  );
}
