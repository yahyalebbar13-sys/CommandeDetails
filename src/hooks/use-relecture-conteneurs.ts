"use client";

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * Afficher les arrivages — en cartes ou en tableau —, c'est relire les
 * conteneurs en route.
 *
 * Sans attendre la tâche de 6 h ni un webhook : chaque date d'arrivée suit la
 * dernière annonce de la compagnie. Gratuit, en arrière-plan. Relancé quand la
 * liste s'affiche, quand on revient sur l'onglet du navigateur, et toutes les
 * 5 minutes tant qu'elle reste à l'écran ; le serveur saute les dossiers relus
 * il y a moins de 10 minutes. Les dates changées reviennent d'elles-mêmes par
 * l'écoute Firestore.
 *
 * `actif` : la liste est-elle à l'écran ? Elle reste montée, cachée, quand on
 * change d'onglet : c'est ce drapeau, pas le montage, qui déclenche la relecture.
 */
export function useRelectureConteneurs(actif: boolean) {
  const { toast } = useToast();
  const relectureEnCours = useRef(false);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    const relire = () => {
      if (relectureEnCours.current || document.visibilityState === 'hidden') return;
      relectureEnCours.current = true;
      authedFetch('/api/admin/suivi-actualiser', { method: 'POST' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          const n = d?.datesModifiees?.length || 0;
          if (vivant && n > 0) {
            toast({
              title: `📅 ${n} date${n > 1 ? 's' : ''} d'arrivée mise${n > 1 ? 's' : ''} à jour`,
              description: d.datesModifiees
                .map((x: any) => `${x.dossier} : ${x.apres?.split('-').reverse().join('/')}`)
                .join(' · '),
            });
          }
        })
        .catch(() => { /* hors ligne : la tâche de 6 h rattrapera */ })
        .finally(() => { relectureEnCours.current = false; });
    };
    relire();
    const minuterie = window.setInterval(relire, 5 * 60 * 1000);
    const auRetour = () => { if (document.visibilityState === 'visible') relire(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      vivant = false;
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
}
