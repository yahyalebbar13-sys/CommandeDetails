# Suivi automatique des conteneurs

La position des conteneurs vient de **ShipsGo**, qui interroge les compagnies
maritimes (MSC, Maersk, CMA CGM, COSCO… 160+) et renvoie les mêmes jalons pour
toutes. La date d'arrivée du dossier est corrigée automatiquement — le statut
affiché (En transit → En dédouanement → En stock) en découle déjà tout seul,
voir `src/lib/status-utils.ts`.

Deux chemins mènent la même information au dossier :

1. **Le webhook** (`/api/webhooks/shipsgo`) : ShipsGo nous appelle dès qu'un
   suivi bouge et joint l'état complet. C'est le chemin normal, celui qu'ils
   recommandent, et il met le dossier à jour en quelques secondes.
2. **La tâche de 6 h** (`/api/cron/suivi-conteneurs`) : elle relit les dossiers
   en cours et rattrape ce qu'un webhook perdu aurait manqué. Gratuite.

## Mise en route

1. Créer un compte sur [shipsgo.com](https://shipsgo.com) et acheter des crédits
   (3 crédits offerts à l'inscription). Demander l'**accès API** : il fait l'objet
   d'un forfait annuel facturé à part, à négocier avec eux.
2. Récupérer le jeton API du compte et l'ajouter aux variables d'environnement du
   projet Vercel — **jamais dans le dépôt** :

   ```
   SHIPSGO_API_TOKEN=<jeton du compte ShipsGo>
   ```

3. Vérifier que `CRON_SECRET` existe aussi sur le projet. Sans lui, la tâche de
   nuit refuse de tourner (elle parcourt et modifie tous les dossiers).
4. Déclarer le webhook dans le dashboard ShipsGo,
   **Integrations → Webhooks** : URL `https://lebtex.ma/api/webhooks/shipsgo`,
   événements `OCEAN.SHIPMENTS.SHIPMENT_CREATED` et `SHIPMENT_UPDATED`. ShipsGo
   affiche alors une **Secret Key** : la recopier dans une troisième variable
   d'environnement.

   ```
   SHIPSGO_WEBHOOK_SECRET=<Secret Key du webhook>
   ```

   Sans elle, la route refuse tout (401) : c'est la seule chose qui prouve qu'un
   appel vient bien de ShipsGo, puisque l'URL est publique.
5. Redéployer. La tâche `/api/cron/suivi-conteneurs` tourne alors chaque jour à
   6 h (cf. `vercel.json`) et le webhook prend le relais en temps réel.

## Ce que ça coûte

| Action | Crédits |
| --- | --- |
| Ouvrir le suivi d'un conteneur ou d'un Master BL | 1 |
| Relire ce suivi (cron de nuit, bouton « Actualiser ») | 0 |
| Rouvrir un suivi déjà ouvert (même référence) | 0 — ShipsGo répond `ALREADY_EXISTS` |

Un Master BL couvre **tous** ses conteneurs pour un seul crédit. Les crédits sont
valables un an.

## Utilisation

Dans un dossier d'arrivage, le panneau **Suivi du conteneur** demande un numéro :

- soit un **numéro de conteneur** au format `MSCU1234567` ;
- soit le **Master BL** de la compagnie (`MEDUXY123456`).

⚠️ La référence du transitaire (`26HD1004`, stockée dans `noBL`) n'est pas connue
des compagnies : si elle est saisie, ShipsGo répond `UNTRACKED` et le panneau
propose de corriger le numéro.

Ensuite, plus rien à faire : le webhook met le dossier à jour dès que la
compagnie publie un événement, et la tâche de nuit rattrape le reste. On arrête
d'interroger un conteneur dès qu'il est déchargé ou que la marchandise est
entrée en stock.

Le panneau affiche aussi :

- **La route du navire**, dessinée en SVG à partir du GeoJSON ShipsGo (trait
  plein pour ce qui est parcouru, pointillés pour ce qui reste, point orange
  pour la position actuelle). Elle n'est pas stockée : relue à l'ouverture du
  dossier et à chaque mouvement, gratuitement.
- **Les clients à prévenir** : une adresse inscrite là reçoit un email **envoyé
  par ShipsGo** à chaque étape du conteneur. Rien ne part de la boîte Lebtex, et
  la désinscription est immédiate. C'est un envoi vers l'extérieur : il ne se
  déclenche que sur une action explicite dans le dossier.

## Être prévenu quand un conteneur bouge

Une alerte part dès qu'un changement compte vraiment : étape franchie (départ,
arrivée, déchargement), date d'arrivée qui bouge, ou numéro que la compagnie ne
reconnaît plus. Le reste — une revérification sans nouveauté, une escale encore
prévisionnelle, un glissement d'un jour — n'envoie rien. La règle vit dans
`src/lib/suivi-changements.ts` et est testée.

**Email** — rien à configurer : le message part de la boîte Gmail déjà utilisée
par l'alerte de stock bas, vers `GMAIL_USER`. Sur téléphone, l'application Gmail
le pousse comme n'importe quel mail. Pour l'envoyer ailleurs, poser
`SUIVI_ALERTE_EMAIL`.

**Telegram** (facultatif, gratuit, notification instantanée) :

1. Sur Telegram, écrire à **@BotFather** → `/newbot` → il renvoie un jeton.
2. Écrire un message à son propre bot, puis ouvrir
   `https://api.telegram.org/bot<JETON>/getUpdates` pour y lire `chat.id`.
3. Poser les deux variables sur Vercel :

   ```
   TELEGRAM_BOT_TOKEN=<le jeton de BotFather>
   TELEGRAM_CHAT_ID=<le chat.id>
   ```

Sans ces variables, ce canal est simplement ignoré. Un envoi qui échoue ne fait
jamais échouer la mise à jour du dossier.

Pour voir à quoi ressemble l'alerte sans encombrer sa boîte :
`npx tsx scripts/apercu-notification.ts`.

## Ce qui est écrit dans le dossier

| Champ | Contenu |
| --- | --- |
| `suivi` | État complet du voyage (cf. `src/lib/suivi-conteneur.ts`) |
| `arrivalDate` | Date de déchargement au port — réelle si elle a eu lieu, annoncée sinon |
| `arrivalDateAvantSuivi` | La date saisie à la main avant la première correction automatique |
| `arrivalDateSource` | `shipsgo` quand la date a été corrigée automatiquement |

| `suivi.dateAppliquee` | La dernière date que le suivi a inscrite |
| `suivi.dateProposee` | Obsolète — effacée à chaque synchronisation |

Trois garde-fous encadrent cette écriture :

1. La date n'est **jamais** modifiée sur un dossier déjà entré en stock ni sur un
   arrivage clos depuis plus d'un mois : l'historique reste tel qu'il a été validé.
2. Tant que le dossier n'est pas figé, **la date suit toujours la compagnie** :
   une date corrigée à la main est remplacée au passage suivant (webhook, cron
   ou ouverture du dossier). Décision du 23/09/2026 — auparavant une retouche
   manuelle bloquait la mise à jour et ne laissait qu'une « date proposée ».
3. Un webhook en retard ou rejoué (photo plus ancienne que celle enregistrée,
   d'après `checked_at`) est ignoré : il ne peut pas faire reculer un suivi.

⚠️ **Firestore refuse les valeurs `undefined`** et fait échouer l'écriture
entière quand il en rencontre une, même au fond d'un tableau. Presque tout est
facultatif dans une réponse ShipsGo, donc `resumerShipment()` passe par
`sansIndefinis()` et `appliquerShipment()` repasse le filtre sur l'objet complet
avant le `set`. Ne jamais écrire un suivi sans ce nettoyage — c'est le défaut qui
rendait la fonctionnalité entièrement muette, et `scripts/test-suivi-sync.ts` le
garde fermé avec un double de Firestore aussi intransigeant que le vrai.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/lib/suivi-conteneur.ts` | Lecture pure d'une réponse ShipsGo, libellés français — testé par `scripts/test-suivi-conteneur.ts` |
| `src/lib/shipsgo.ts` | Client de l'API ShipsGo v2 (serveur uniquement) |
| `src/lib/suivi-sync.ts` | Règles d'écriture dans le dossier |
| `src/lib/shipsgo-webhook.ts` | Signature HMAC des webhooks — testé par `scripts/test-shipsgo-webhook.ts` |
| `src/app/api/webhooks/shipsgo/route.ts` | Réception des événements ShipsGo |
| `src/app/api/cron/suivi-conteneurs/route.ts` | Tâche de nuit (rattrapage) |
| `src/app/api/admin/suivi-conteneur/route.ts` | Ouverture / actualisation à la demande (admin) |
| `src/app/api/admin/suivi-carte/route.ts` | Route du navire en GeoJSON, mise en dessin |
| `src/app/api/admin/suivi-abonne/route.ts` | Inscription / désinscription d'un client |
| `src/lib/suivi-carte.ts` | Projection de la route en géométrie SVG — testé par `scripts/test-suivi-carte.ts` |
| `scripts/test-suivi-sync.ts` | Écriture dans le dossier, avec un double de Firestore qui refuse `undefined` |
| `src/components/suivi-carte.tsx` | La carte, en SVG sans librairie |
| `src/components/suivi-conteneur-panneau.tsx` | Le panneau affiché dans le dossier |
