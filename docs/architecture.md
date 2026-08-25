# Architecture

L’application conserve une séparation stricte entre ingestion, lecture et interface :

```text
API DofusGuide (commandes de scraping seulement)
  → data/raw (source de vérité immuable)
  → normalizer + audit
  → import atomique Drizzle / SQLite
  → GuideRepository + QuestRepository
  → CLI query | API Fastify | server functions TanStack Start
  → DTO web ciblés
  → React
```

## Couches

- `src/api`, `src/scraper` et `src/utils` archivent les octets HTTP. Ils ne dépendent ni de React ni de SQLite.
- `src/normalizer` et `src/shared` contiennent des transformations pures et conservatrices. Les champs inconnus restent présents dans les colonnes brutes.
- `src/db` porte le schéma, les migrations et la reconstruction atomique de la base.
- `src/repositories/contracts.ts` définit les ports de lecture. `sqliteDofusGuideRepository.ts` est l’adaptateur actif Drizzle/SQLite ; un adaptateur PostgreSQL pourra implémenter les mêmes interfaces.
- Fastify, la CLI et les server functions utilisent ce repository partagé. Aucun SQL n’est présent dans les composants React.
- `src/web/data` expose des DTO sérialisables et omet les gros JSON bruts sauf lorsqu’un détail métier ou un fallback inconnu en a besoin.
- `src/web` contient les routes typées, composants daisyUI et progression locale. Le navigateur ne peut pas importer `better-sqlite3` et ne lit jamais `data/raw`.
- `src/worldTour` archive et résout les parcours DofusDB en amont. Le serveur envoie au navigateur un DTO léger ; le calcul joueur réutilise les états d’étapes existants et aucun appel DofusDB n’est effectué pendant la consultation.
- `src/bestiary` archive les monstres, donjons, succès, sous-zones et positions DofusDB. `summarize-quests` résout hors ligne les coordonnées du tutoriel et sérialise directement les groupes bestiaire dans le résumé. Le serveur web ne reçoit qu’un DTO figé et ne connaît ni l’API DofusDB ni l’index de positions.
- `src/accounts` contient le modèle de comptes, la vérification des identités Google et l’adaptateur Drizzle de la base utilisateur. `src/web/accounts` expose les server functions et composants React sans envoyer de jeton de session au JavaScript client.

## Persistance

SQLite reste la base documentaire active (`data/dofusguide.sqlite`). `import-db` construit une base temporaire depuis les archives, applique les migrations dans l’ordre, puis remplace la base seulement après succès.

Les comptes, personnages, relations de suivi, sessions hachées et progressions synchronisées résident dans `data/user-data.sqlite`, avec leurs migrations sous `drizzle-user`. Cette séparation garantit qu’une reconstruction documentaire n’efface pas les sauvegardes. La couche compte reste derrière un repository Drizzle afin de permettre un adaptateur PostgreSQL ultérieur.

La progression anonyme est un document local versionné `dofusguide.progress.v2` dans `localStorage`. La version 1 est migrée automatiquement. À la première connexion Google, ce document initialise le premier personnage ; les modifications suivantes sont synchronisées avec le personnage actif. Les objectifs cochés sont enregistrés par occurrence de quête (guide, étape, relation et ordre), tandis que les états de joueur restent distincts des relations du guide :

- étape : `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `SKIPPED` ;
- quête joueur : `NOT_STARTED`, `STARTED`, `ACTIVE`, `COMPLETED`, `SKIPPED` ;
- relation DofusGuide : `START`, `ACTIVE`, `FINISH`, `UNKNOWN`.

## Serveurs

- `npm run serve` conserve l’API Fastify historique sur `127.0.0.1:3000`.
- `npm run dev` démarre TanStack Start sur `127.0.0.1:3001`.
- `npm run web:start` sert le build Nitro. `DOFUSGUIDE_DB` peut sélectionner une autre base côté serveur.

Les routes React chargent des données ciblées par server functions. Les recherches sont paginées ; les images sont paresseuses et disposent d’un fallback.

Google One Tap est initialisé une seule fois dans le shell React et son prompt est demandé automatiquement. Le credential Google est vérifié côté serveur avec les clés publiques Google et l’audience `GOOGLE_CLIENT_ID`, puis remplacé par une session opaque stockée uniquement sous forme de hash et transportée par cookie `HttpOnly`. Chaque session envoie un heartbeat pour son personnage actif ; l’UI considère ce personnage en ligne pendant douze secondes. Le suivi de profils est actuellement quasi temps réel par interrogation ciblée toutes les trois secondes ; le contrat de repository permet de substituer ultérieurement SSE ou WebSocket sans modifier les marqueurs UI.
