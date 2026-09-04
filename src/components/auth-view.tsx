"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock } from 'lucide-react';

export default function AuthView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let targetEmail = email.trim();
    const normalized = targetEmail.toLowerCase().replace(/[\s_-]+/g, '');

    // Résolution automatique du nom de magasin vers son compte
    if (normalized === 'chrifa') {
      targetEmail = 'chrifa@lebtex.ma';
    } else if (normalized === 'derbomar') {
      targetEmail = 'derbomar@lebtex.ma';
    } else if (normalized === 'idaa' || normalized === 'alidaa') {
      targetEmail = 'idaa@lebtex.ma';
    }

    try {
      await signInWithEmailAndPassword(auth, targetEmail, password);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Accès refusé",
        description: "Identifiant ou mot de passe invalide."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickStoreSelect = (storeName: string) => {
    setEmail(storeName);
    setPassword('Lebtex2026');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7] p-4">
      <Card className="w-full max-w-md shadow-xl border-stone-200">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto bg-amber-100 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <Lock className="w-6 h-6 text-amber-600" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-stone-800 uppercase">
            📦 StockVue <span className="text-amber-600">Commandes</span>
          </CardTitle>
          <CardDescription>
            Accès aux magasins (CHRIFA, Derb omar, IDAA) & Administration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Identifiant (Nom du magasin ou Email)</Label>
              <Input
                id="email"
                type="text"
                placeholder="Ex: CHRIFA, Derb omar, IDAA ou email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white border-stone-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white border-stone-200"
              />
            </div>

            {/* Boutons de connexion rapide pour les 3 magasins */}
            <div className="pt-1 pb-1">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-2 text-center">
                Connexion rapide magasin (MDP: Lebtex2026)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickStoreSelect('CHRIFA')}
                  className="py-2 px-2 text-center bg-stone-50 hover:bg-emerald-50 hover:border-emerald-400 border border-stone-200 rounded-xl text-xs font-black text-stone-700 hover:text-emerald-700 transition-all shadow-sm"
                >
                  🏪 CHRIFA
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickStoreSelect('Derb omar')}
                  className="py-2 px-2 text-center bg-stone-50 hover:bg-emerald-50 hover:border-emerald-400 border border-stone-200 rounded-xl text-xs font-black text-stone-700 hover:text-emerald-700 transition-all shadow-sm"
                >
                  🏪 Derb omar
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickStoreSelect('IDAA')}
                  className="py-2 px-2 text-center bg-stone-50 hover:bg-emerald-50 hover:border-emerald-400 border border-stone-200 rounded-xl text-xs font-black text-stone-700 hover:text-emerald-700 transition-all shadow-sm"
                >
                  🏪 IDAA
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-6" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "SE CONNECTER"}
            </Button>
            <p className="text-center text-[10px] text-stone-400 uppercase tracking-widest pt-2">
              Système de gestion sécurisé - Accès restreint
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
