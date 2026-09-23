"use client";

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/firebase';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock } from 'lucide-react';

type EspaceConnexion = 'gestion' | 'stock';

interface AuthViewProps {
  /**
   * Espace depuis lequel la page de connexion est ouverte.
   *
   * - « stock » : poste de caisse partagé en magasin. La session ne survit pas à
   *   la fermeture de l'onglet, il faut donc se reconnecter à chaque ouverture.
   * - « gestion » : poste du bureau. La session reste ouverte comme auparavant.
   *
   * Quand rien n'est précisé (cas de tous les écrans actuels), l'espace est
   * déduit de l'adresse de la page : /stock donne « stock », tout le reste
   * donne « gestion ». Le comportement des écrans de gestion est donc inchangé.
   */
  espace?: EspaceConnexion;
}

export default function AuthView({ espace }: AuthViewProps = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const { toast } = useToast();
  const chemin = usePathname();

  // L'écran de connexion du magasin est celui servi sous /stock.
  const espaceCourant: EspaceConnexion =
    espace ?? (chemin === '/stock' || chemin?.startsWith('/stock/') ? 'stock' : 'gestion');

  // Poste de caisse partagé : le navigateur ne doit ni proposer ni remplir les identifiants du
  // vendeur précédent. Ailleurs (/gestion), on ne touche à rien — un gestionnaire de mots de
  // passe qui cesse de reconnaître un formulaire est une gêne quotidienne, pas une sécurité.
  const posteePartage = espaceCourant === 'stock';
  const champIdentifiant = posteePartage ? 'identifiant-acces' : 'email';
  const champMotDePasse = posteePartage ? 'mot-de-passe-acces' : 'password';

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
      if (espaceCourant === 'stock') {
        // Poste de caisse partagé : la connexion ne doit laisser aucune trace
        // une fois l'onglet fermé. À défaut de session de navigation utilisable,
        // on ne garde la connexion qu'en mémoire — jamais sur le poste.
        await setPersistence(auth, browserSessionPersistence).catch(() =>
          setPersistence(auth, inMemoryPersistence)
        );
      }
      await signInWithEmailAndPassword(auth, targetEmail, password);
      setPassword('');
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
          {/* Aucun identifiant n'est proposé ni rempli par le navigateur :
              les deux champs partent toujours vides. */}
          <form onSubmit={handleAuth} className="space-y-4" autoComplete={posteePartage ? 'off' : 'on'}>
            <div className="space-y-2">
              <Label htmlFor={champIdentifiant}>Identifiant (Nom du magasin ou Email)</Label>
              <Input
                id={champIdentifiant}
                name={champIdentifiant}
                type="text"
                placeholder="Ex: CHRIFA, Derb omar, IDAA ou email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete={posteePartage ? 'off' : 'username'}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="bg-white border-stone-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={champMotDePasse}>Mot de passe</Label>
              <Input
                id={champMotDePasse}
                name={champMotDePasse}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={posteePartage ? 'new-password' : 'current-password'}
                className="bg-white border-stone-200"
              />
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
