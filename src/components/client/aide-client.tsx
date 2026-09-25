"use client";

// ─── Aide de l'espace client ──────────────────────────────────────────────────
// Ce qu'un client se demande sans oser téléphoner : ce que veulent dire les
// six étapes, à quoi servent les demandes, pourquoi une date change, comment
// être prévenu, comment installer l'espace client sur son téléphone. Rien
// d'inventé : chaque réponse décrit ce que l'espace client fait vraiment.

import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Download,
  Factory,
  FileText,
  LifeBuoy,
  MessageCircle,
  MessageCircleQuestion,
  PackageCheck,
  Repeat,
  Route,
  Ship,
  Smartphone,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ETAPES_CLIENT, type EtapeClient } from '@/lib/statut-client';
import type { TypeDemande } from '@/lib/demandes-client';
import { lienWhatsApp, messageContact } from './portail-outils';

/** Ce que l'on sait de l'installation sur cet appareil (cf. app/client/page.tsx). */
export type InstallationPortail = {
  /** iPhone ou iPad : l'installation passe par « Partager ». */
  ios?: boolean;
  /** L'espace client est déjà ouvert comme une application. */
  installee?: boolean;
  /** Le navigateur propose l'installation en un geste (Android, ordinateur). */
  onInstaller?: () => void;
};

const ICONE_ETAPE: Record<EtapeClient, LucideIcon> = {
  enregistree: ClipboardList,
  fabrication: Factory,
  mer: Ship,
  douane: FileText,
  prete: PackageCheck,
  livree: Truck,
};

const DEMANDES: { type: TypeDemande; icone: LucideIcon; titre: string; texte: string; quand: string }[] = [
  {
    type: 'recommande',
    icone: Repeat,
    titre: 'Recommander un produit',
    texte: 'Le même article que l’une de vos commandes, dans la quantité de votre choix. Nous vous recontactons pour la confirmer.',
    quand: 'Pour un réassort',
  },
  {
    type: 'livraison',
    icone: Truck,
    titre: 'Organiser la livraison',
    texte: 'Pour ce qui est prêt dans notre entrepôt : la livraison chez vous ou le retrait à notre entrepôt, à la date qui vous convient.',
    quand: 'Quand une commande est prête',
  },
  {
    type: 'question',
    icone: MessageCircleQuestion,
    titre: 'Poser une question',
    texte: 'Une précision sur une commande (délai, quantité, couleurs…) ou une question générale. Notre réponse s’affiche par écrit, dans « Mes demandes ».',
    quand: 'À tout moment',
  },
];

const FAQ: { id: string; question: string; reponse: React.ReactNode }[] = [
  {
    id: 'quand',
    question: 'Quand ma commande arrivera-t-elle ?',
    reponse: (
      <>
        <p>
          Dès que votre marchandise est à bord d’un navire, la date d’arrivée prévue au port s’affiche sur la commande,
          sur l’accueil et dans le calendrier « Arrivées à venir ». Cette date est celle que donne la compagnie maritime :
          elle se met à jour d’elle-même, sans que vous ayez rien à faire.
        </p>
        <p className="mt-2">
          Après l’arrivée au port vient le dédouanement ; la commande entre ensuite dans notre entrepôt et passe à
          « Prête à livrer ». Tant que la commande est en fabrication, la date d’arrivée n’est pas encore connue.
        </p>
      </>
    ),
  },
  {
    id: 'date',
    question: 'Pourquoi la date a-t-elle changé ?',
    reponse: (
      <>
        <p>
          La date d’arrivée vient directement de la compagnie maritime. Elle la corrige quand le navire prend du retard
          (météo, escales, attente au port) ou, plus rarement, de l’avance.
        </p>
        <p className="mt-2">
          Quand elle change, nous vous le montrons clairement : l’écart en jours et la date annoncée au départ restent
          affichés sur la commande. Nous suivons chaque conteneur de près ; pour toute question, écrivez-nous.
        </p>
      </>
    ),
  },
  {
    id: 'prevenu',
    question: 'Comment être prévenu ?',
    reponse: (
      <>
        <p>
          Autorisez les notifications (voir « Être prévenu » plus bas). Tant que l’espace client est ouvert, dans un
          onglet de votre navigateur ou comme application sur votre téléphone, une notification vous prévient quand une
          commande change d’étape et quand nous répondons à l’une de vos demandes.
        </p>
        <p className="mt-2">
          Et à chaque visite, « Quoi de neuf », sur l’accueil, résume ce qui a bougé sur vos commandes ces 30 derniers jours.
        </p>
      </>
    ),
  },
  {
    id: 'livraison',
    question: 'Comment organiser la livraison ?',
    reponse: (
      <>
        <p>
          Dès qu’une commande est « Prête à livrer », choisissez « Organiser la livraison » : sur l’accueil, dans l’onglet
          « Prêtes à livrer » ou dans la fiche de la commande.
        </p>
        <p className="mt-2">
          Cochez les commandes concernées, choisissez la livraison chez vous ou le retrait à notre entrepôt, et, si vous le
          souhaitez, une date. Votre demande nous arrive aussitôt ; son avancement et notre réponse s’affichent dans
          « Mes demandes ».
        </p>
      </>
    ),
  },
  {
    id: 'documents',
    question: 'Comment garder une trace de mes commandes ?',
    reponse: (
      <p>
        « État de mes commandes (PDF) » prépare un document daté, aux couleurs de LEBTEX, à imprimer ou à transmettre.
        « Exporter (Excel) » vous donne un tableau à trier et à recopier dans vos propres fichiers. Chaque fiche de
        commande se télécharge aussi en PDF.
      </p>
    ),
  },
  {
    id: 'erreur',
    question: 'Une commande manque, ou une information vous semble inexacte ?',
    reponse: (
      <p>
        Écrivez-nous avec « Poser une question » ou sur WhatsApp, en précisant le produit concerné : nous vérifions et
        corrigeons au plus vite.
      </p>
    ),
  },
  {
    id: 'confidentialite',
    question: 'Mes informations sont-elles confidentielles ?',
    reponse: (
      <p>
        Oui. Vous ne voyez que vos propres commandes, et aucun autre client ne peut les voir. Votre accès est protégé par votre
        adresse e-mail et votre mot de passe : ne les communiquez pas.
      </p>
    ),
  },
];

type EtatNotifications = 'inconnu' | 'indisponible' | 'default' | 'granted' | 'denied';

/**
 * Ce que les notifications font vraiment : elles partent de l'espace client
 * ouvert (onglet ou application), pas d'un serveur. Fermé, il ne prévient pas.
 */
const PREVENU = 'Tant que l’espace client est ouvert, vous êtes prévenu quand une commande change d’étape ou quand nous répondons à une demande.';

/** Titre de section de l'aide. */
function Titre({ icone: Icone, children, sous }: { icone: LucideIcon; children: React.ReactNode; sous?: string }) {
  return (
    <div className="mb-4 px-2">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#c4a062]/10">
          <Icone className="w-5 h-5 text-[#a38042]" />
        </div>
        <h2 className="text-lg font-black text-stone-900 uppercase tracking-widest">{children}</h2>
      </div>
      {sous && <p className="mt-1 text-xs font-medium text-stone-500">{sous}</p>}
    </div>
  );
}

export function AideClient({ whatsapp, clientName, onNouvelleDemande, installation }: {
  whatsapp?: string;
  clientName: string;
  onNouvelleDemande: (type: TypeDemande) => void;
  installation?: InstallationPortail;
}) {
  // Lu après l'affichage : le serveur ne connaît pas les réglages du navigateur.
  const [notifications, setNotifications] = useState<EtatNotifications>('inconnu');
  const [essai, setEssai] = useState<'' | 'envoye' | 'echec'>('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) { setNotifications('indisponible'); return; }
    setNotifications(Notification.permission as EtatNotifications);
  }, []);

  const activer = async () => {
    if (!('Notification' in window)) return;
    try {
      const r = await Notification.requestPermission();
      setNotifications(r as EtatNotifications);
    } catch {
      setNotifications(Notification.permission as EtatNotifications);
    }
  };

  const tester = async () => {
    const titre = 'LEBTEX — Espace client';
    const corps = `Les notifications fonctionnent. ${PREVENU}`;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) {
        await reg.showNotification(titre, { body: corps, icon: '/y-icon-192.png', tag: 'essai-notifications' });
      } else {
        new Notification(titre, { body: corps, icon: '/y-icon-192.png' });
      }
      setEssai('envoye');
    } catch {
      setEssai('echec');
    }
  };

  const lien = lienWhatsApp(whatsapp, messageContact(clientName));
  const ios = Boolean(installation?.ios);

  const etapesInstallation: { id: 'ios' | 'android'; titre: string; navigateur: string; etapes: string[] }[] = [
    {
      id: 'ios',
      titre: 'Sur iPhone ou iPad',
      navigateur: 'Avec Safari',
      etapes: [
        'Ouvrez l’espace client dans Safari.',
        'Touchez le bouton « Partager » (le carré avec une flèche vers le haut), en bas de l’écran.',
        'Choisissez « Sur l’écran d’accueil », puis « Ajouter ».',
        'Ouvrez LEBTEX depuis l’écran d’accueil, puis autorisez les notifications.',
      ],
    },
    {
      id: 'android',
      titre: 'Sur Android',
      navigateur: 'Avec Chrome',
      etapes: [
        'Ouvrez l’espace client dans Chrome.',
        'Touchez le menu ⋮, en haut à droite.',
        'Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
        'Ouvrez LEBTEX depuis l’écran d’accueil, puis autorisez les notifications.',
      ],
    },
  ];
  // L'appareil du client d'abord.
  if (installation && installation.ios === false) etapesInstallation.reverse();

  return (
    <div className="space-y-12 animate-in fade-in">
      {/* ─── En-tête ─── */}
      <div className="bg-stone-900 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" aria-hidden />
        <div className="relative z-10 max-w-2xl">
          <p className="text-[#c4a062] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Aide</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Tout pour suivre vos commandes sereinement</h1>
          <p className="text-stone-400 text-sm font-medium mt-2">
            Ce que veulent dire les étapes, ce que vous pouvez nous demander, et les réponses aux questions les plus fréquentes.
          </p>
        </div>
      </div>

      {/* ─── Les six étapes ─── */}
      <section>
        <Titre icone={Route} sous="Chaque commande passe par ces six étapes, dans cet ordre. Elles avancent d’elles-mêmes : vous n’avez rien à faire.">
          Les étapes d’une commande
        </Titre>
        <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {ETAPES_CLIENT.map((e, i) => {
            const Icone = ICONE_ETAPE[e.id];
            return (
              <li key={e.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex gap-4">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-xl bg-stone-900 text-[#c4a062] flex items-center justify-center">
                    <Icone className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#c4a062] text-stone-900 text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-stone-900 uppercase tracking-widest">{e.titre}</p>
                  <p className="mt-1 text-xs font-medium text-stone-500 leading-relaxed">{e.phrase}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─── Les demandes ─── */}
      <section>
        <Titre icone={ClipboardList} sous="Sans téléphoner : votre demande nous arrive aussitôt, et vous suivez son avancement (envoyée, prise en charge, traitée) dans « Mes demandes ».">
          Ce que vous pouvez nous demander
        </Titre>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMANDES.map(d => (
            <div key={d.type} className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-[#c4a062]/10 text-[#a38042] flex items-center justify-center">
                <d.icone className="w-5 h-5" />
              </div>
              <p className="mt-3 text-[9px] font-black text-stone-400 uppercase tracking-widest">{d.quand}</p>
              <p className="mt-0.5 text-[12px] font-black text-stone-900 uppercase tracking-widest">{d.titre}</p>
              <p className="mt-1.5 text-xs font-medium text-stone-500 leading-relaxed flex-1">{d.texte}</p>
              <button
                type="button"
                onClick={() => onNouvelleDemande(d.type)}
                className="mt-4 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                <d.icone className="w-3.5 h-3.5" /> {d.titre}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Questions fréquentes ─── */}
      <section>
        <Titre icone={LifeBuoy}>Questions fréquentes</Titre>
        <div className="bg-white border border-stone-200 rounded-3xl px-5 sm:px-6">
          <Accordion type="single" collapsible defaultValue="quand">
            {FAQ.map(q => (
              <AccordionItem key={q.id} value={q.id} className="border-stone-100 last:border-0">
                <AccordionTrigger className="text-left text-sm font-black text-stone-900 hover:no-underline hover:text-[#a38042] py-4 gap-3">
                  {q.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm font-medium text-stone-600 leading-relaxed">
                  {q.reponse}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── Être prévenu ─── */}
      <section>
        <Titre icone={Bell}>Être prévenu</Titre>
        <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            notifications === 'granted' ? 'bg-emerald-50 text-emerald-600' : notifications === 'denied' ? 'bg-red-50 text-red-500' : 'bg-stone-100 text-stone-500'
          }`}>
            {notifications === 'granted' ? <BellRing className="w-6 h-6" /> : notifications === 'denied' ? <BellOff className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-stone-900">
              {notifications === 'granted' && 'Les notifications sont activées sur cet appareil'}
              {notifications === 'denied' && 'Les notifications sont bloquées sur cet appareil'}
              {notifications === 'default' && 'Les notifications ne sont pas encore activées'}
              {notifications === 'indisponible' && 'Les notifications ne sont pas disponibles ici'}
              {notifications === 'inconnu' && 'Notifications'}
            </p>
            <p className="mt-1 text-xs font-medium text-stone-500 leading-relaxed">
              {notifications === 'granted' && (essai === 'envoye'
                ? 'Une notification d’essai vient de partir : si vous l’avez reçue, tout est prêt.'
                : essai === 'echec'
                  ? 'La notification d’essai n’a pas pu s’afficher. Vérifiez les réglages de notifications de votre appareil.'
                  : PREVENU)}
              {notifications === 'denied' && 'Pour les recevoir, autorisez les notifications pour ce site dans les réglages de votre navigateur, puis revenez ici.'}
              {notifications === 'default' && `Un geste suffit. ${PREVENU}`}
              {notifications === 'indisponible' && (ios
                ? 'Sur iPhone, installez d’abord l’espace client sur l’écran d’accueil (voir ci-dessous), puis ouvrez-le depuis l’icône LEBTEX.'
                : 'Ce navigateur ne propose pas les notifications. Essayez avec Chrome, Edge, Firefox ou Safari à jour.')}
            </p>
          </div>
          {notifications === 'default' && (
            <button
              type="button"
              onClick={activer}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#c4a062] hover:bg-[#a38042] text-stone-900 text-[10px] font-black uppercase tracking-widest shadow-md shadow-[#c4a062]/20 transition-colors"
            >
              <BellRing className="w-4 h-4" /> Activer les notifications
            </button>
          )}
          {notifications === 'granted' && (
            <button
              type="button"
              onClick={tester}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-stone-200 hover:border-[#c4a062] text-stone-700 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <Bell className="w-4 h-4" /> Envoyer un essai
            </button>
          )}
        </div>
      </section>

      {/* ─── Installer l'application ─── */}
      <section>
        <Titre icone={Smartphone} sous="Une icône LEBTEX sur votre écran d’accueil : vos commandes en un geste, en plein écran, comme une application.">
          Installer l’application sur votre téléphone
        </Titre>
        {installation?.installee ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <p className="text-sm font-black text-emerald-900">L’espace client est déjà installé sur cet appareil.</p>
          </div>
        ) : (
          <>
            {installation?.onInstaller && (
              <div className="mb-4 bg-stone-900 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white">Votre navigateur peut l’installer tout de suite</p>
                  <p className="mt-1 text-xs font-medium text-stone-400">Un geste, et LEBTEX rejoint votre écran d’accueil.</p>
                </div>
                <button
                  type="button"
                  onClick={installation.onInstaller}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#c4a062] hover:bg-[#a38042] text-stone-900 text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  <Download className="w-4 h-4" /> Installer maintenant
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {etapesInstallation.map(bloc => (
                <div key={bloc.id} className="bg-white border border-stone-200 rounded-3xl p-5">
                  <p className="text-[12px] font-black text-stone-900 uppercase tracking-widest">{bloc.titre}</p>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{bloc.navigateur}</p>
                  <ol className="mt-4 space-y-3">
                    {bloc.etapes.map((t, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-[#c4a062]/15 text-[#a38042] text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-xs font-medium text-stone-600 leading-relaxed pt-0.5">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ─── Nous joindre ─── */}
      <section className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-[#a38042] uppercase tracking-widest">Vous ne trouvez pas votre réponse ?</p>
          <p className="mt-1 text-sm font-black text-stone-900">Notre équipe vous répond, par écrit ou sur WhatsApp.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => onNouvelleDemande('question')}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-stone-200 hover:border-[#c4a062] text-stone-700 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <MessageCircleQuestion className="w-4 h-4" /> Poser une question
          </button>
          {lien && (
            <a
              href={lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> Écrire sur WhatsApp
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
