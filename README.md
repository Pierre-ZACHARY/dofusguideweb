# DofusGuide Scraper

Outil Node.js/TypeScript destiné à archiver, à faible cadence, les données publiques du guide DofusGuide avant leur normalisation locale.

## Prérequis

- Node.js 20.19 ou plus récent ;
- npm.

## Installation

```powershell
npm ci
```

## Jalon 1 — liste des guides

```powershell
npm run guides
```

La commande appelle `GET https://dofusguide.fr/api/tutoriel/name?dev` et écrit les octets JSON reçus dans `data/raw/guides.json`, sans correction d'encodage ni reformattage.

Options disponibles :

```powershell
npm run guides -- --timeout-ms 15000 --retries 3
```

Les options `--base-url`, `--user-agent` et `--output` sont également disponibles. Les variables `DOFUSGUIDE_BASE_URL`, `DOFUSGUIDE_USER_AGENT`, `DOFUSGUIDE_TIMEOUT_MS` et `DOFUSGUIDE_RETRIES` fournissent les mêmes réglages.

Le comportement par défaut est volontairement prudent : timeout de 15 secondes, trois retries au maximum et backoff de 500, 1000 puis 2000 ms. Les réponses 408, 425, 429 et 5xx sont retentées ; les autres erreurs HTTP et les données JSON inattendues arrêtent la commande.

## Développement

```powershell
npm test
npm run typecheck
npm run build
```

Les fichiers sous `data/raw` sont générés localement et ne sont pas versionnés.

## Jalon 2 — une étape

```powershell
npm run scrape -- --guide -1 --step 111
```

Cette commande actualise `data/raw/guides.json`, enregistre le guide sélectionné dans `data/raw/guides/-1/metadata.json`, puis conserve la réponse HTTP de l'étape sans la reformater dans `data/raw/guides/-1/steps/0111.json`.

Les types de contenu inconnus sont signalés dans les logs mais restent intégralement présents dans l'archive.

## Jalon 3 — guide complet

```powershell
npm run scrape -- --guide -1
npm run scrape -- --guide-name "Guide Principal"
```

Sans `--guide` ni `--guide-name`, la commande recherche d'abord `Guide Principal (Mono/Multi)`, puis utilise le fallback configurable `-1` si le nom n'est pas disponible.

Le scraper traite les étapes séquentiellement avec un délai de 350 ms entre les requêtes d'étape et s'arrête après cinq tableaux vides consécutifs. Les erreurs HTTP ou réseau épuisent d'abord les retries du client et ne sont jamais comptées comme étapes vides.

Les fichiers existants valides sont lus et ignorés sans nouvelle requête. Un fichier existant invalide arrête le traitement afin d'éviter de masquer une archive corrompue.

Options principales :

```powershell
npm run scrape -- --guide -1 --start-step 1 --delay-ms 350 --stop-after-empty 5
npm run scrape -- --guide-name "Guide Principal" --fallback-guide-id -1
```

## Jalon 4 — reprise et mises à jour

```powershell
npm run scrape -- --guide -1 --resume
npm run scrape -- --guide -1 --force
npm run scrape -- --guide -1 --refresh
npm run scrape -- --guide -1 --step 111 --refresh
```

`scrape-state.json` est mis à jour atomiquement après chaque étape traitée. Il conserve la dernière étape réussie, la dernière étape non vide, le compteur de réponses vides, les paramètres de cadence et le statut `running` ou `completed`.

`--resume` reprend après la dernière étape enregistrée et restaure le compteur de réponses vides. Si l'état est déjà terminé, la commande retourne immédiatement à partir des métadonnées locales, sans requête HTTP.

`--force` retélécharge les étapes ciblées. `--refresh` retélécharge et compare les octets reçus par SHA-256. En cas de différence, l'ancienne réponse est archivée sous `changes/steps/<step>/` et une entrée est ajoutée atomiquement à `changes.jsonl`. Une réponse identique n'est pas réécrite.

`--resume`, `--force` et `--refresh` sont mutuellement exclusifs. `--start-step` ne peut pas être combiné avec `--resume`.

## Jalon 5 — normalisation pure

Le module `src/normalizer` transforme les objets déjà chargés en mémoire. Il n'accède ni au réseau, ni au disque, ni à une base de données et ne modifie jamais les objets sources.

Il expose notamment :

- `normalizeName(name)` : retrait d'un numéro initial, minuscules, retrait des diacritiques, normalisation de la ponctuation et des espaces ;
- `normalizeGuideStep(guideId, stepNumber, elements)` : éléments, titre et relations de quêtes ordonnés ;
- `extractQuestOccurrences(options)` : extraction tolérante depuis un objet, un tableau ou une chaîne JSON.

Les relations `QUEST_START`, `QUEST` et `QUEST_FINISH` deviennent respectivement `START`, `ACTIVE` et `FINISH`. Une clé distante `quest_start:<id>` est rattachée à la clé canonique `quest:<id>`, tout en conservant la clé source. Si aucune clé n'existe, une clé synthétique déterministe est générée.

Les noms originaux, valeurs brutes et éléments complets restent accessibles sur les résultats normalisés. Les niveaux et chapitres sont dérivés conservativement lors de l’import. Une valeur absente ou ambiguë reste `null`. Les chaînes présentant un mojibake ne sont pas réparées automatiquement.

## Jalon 6 — base SQLite normalisée

```powershell
npm run import-db
```

La commande reconstruit `data/dofusguide.sqlite` uniquement depuis `data/raw`. Elle valide d'abord toutes les archives, applique les migrations SQL de `drizzle/`, importe les données dans une base temporaire au sein d'une transaction, puis remplace la base courante seulement après succès.

Options disponibles :

```powershell
npm run import-db -- --raw-dir data/raw --db data/dofusguide.sqlite
npm run import-db -- --migrations-dir drizzle
```

Le schéma Drizzle contient :

- `guides` et les métadonnées distantes complètes ;
- `guide_steps`, avec une contrainte unique sur `guide_id + step_number` et le JSON exact de l'étape ;
- `guide_elements`, avec le type, la position, la valeur brute et l'élément complet ;
- `quests`, indexée par clé et nom normalisé ;
- `guide_step_quests`, qui conserve le type de relation et l'ordre dans l'étape.

Une quête rencontrée plusieurs fois est fusionnée dans l'ordre croissant guide, étape puis élément. La dernière valeur non vide remplace la précédente ; une valeur absente n'efface jamais une information déjà connue. Toutes les colonnes `raw_json` et `raw_value_json` permettent de reprendre la normalisation sans nouveau scraping.

Les archives JSON ne sont ni modifiées ni supprimées. La base SQLite, ses fichiers temporaires et ses journaux sont ignorés par Git.

## Jalon 7 — requêtes et API locale

Recherche en ligne de commande :

```powershell
npm run query -- quest "Bouc à misère"
npm run query -- quest "Bouc à misère" --limit 10 --db data/dofusguide.sqlite
```

La recherche utilise le nom normalisé et retourne un document JSON paginé avec les informations normalisées et la valeur brute décodée.

Démarrage de l'API :

```powershell
npm run serve
npm run serve -- --host 127.0.0.1 --port 3000 --db data/dofusguide.sqlite
```

Le serveur ouvre SQLite en lecture seule et refuse de démarrer si la base demandée n'existe pas. Il écoute uniquement sur `127.0.0.1:3000` par défaut.

Routes :

- `GET /guides` ;
- `GET /guides/:id/steps/:step` ;
- `GET /quests` ;
- `GET /quests/:questKey` ;
- `GET /quests/:questKey/steps`.

`GET /quests` accepte `q`, `guideId`, `stepMin`, `stepMax`, `type`, `limit` et `offset`. `type` correspond à la catégorie de quête, par exemple `ALI` ou `TDM`. La limite vaut 50 par défaut, avec un maximum de 200. La réponse possède la forme `{ items, total, limit, offset }`.

Le détail d'une étape contient son JSON brut décodé, ses éléments complets et ses relations de quêtes ordonnées. Les paramètres invalides retournent `400` et les guides, étapes ou quêtes absents retournent `404`.

## Application web

L’interface TanStack Start fonctionne exclusivement depuis SQLite. Elle n’appelle pas DofusGuide pendant la consultation.

```powershell
npm run import-db
npm run dev
```

Ouvrir `http://127.0.0.1:3001`. Les routes principales sont `/`, `/guides`, `/guides/:guideId`, `/guides/:guideId/steps/:stepNumber`, `/quests`, `/quests/:questKey`, `/progress` et `/design-system`.

Le build de production combine le CLI/API et l’application SSR :

```powershell
npm run build
npm run web:start
```

`npm run serve` reste réservé à l’API Fastify historique. La base web peut être surchargée côté serveur avec `DOFUSGUIDE_DB`. Le navigateur ne lit ni SQLite ni `data/raw`.
La base comptes peut rester locale (`DOFUSGUIDE_USER_DB`) ou pointer vers PostgreSQL via `DOFUSGUIDE_USER_DATABASE_URL`.

### Exécution Docker (WSL)

Le dépôt inclut un `Dockerfile` multi-stage et un `docker-compose.yml` qui démarre :

- l’application SSR sur le port hôte `3003` ;
- PostgreSQL pour la base comptes (partage/suivi/progression connectée).

L’image contient la base documentaire versionnée `data/dofusguide.sqlite`, les
données préparées sous `data/` et les assets de `public/`. Cette base est ouverte
en lecture seule par l’application web et peut être remplacée au déploiement en
surchargeant `DOFUSGUIDE_DB`. La base utilisateurs locale et les secrets ne sont
jamais intégrés à l’image ; Compose utilise PostgreSQL pour ces données.

```powershell
wsl docker compose up --build -d
wsl docker compose ps
wsl docker compose logs -f app
```

Ensuite ouvrir `http://127.0.0.1:3003`.

### Ressources DofusDB locales

Les pictogrammes de classes, les portraits masculin/féminin et les challenges utilisés par l’interface sont archivés à l’avance. Ils ne sont jamais demandés à DofusDB depuis le navigateur :

    npm run scrape-bestiary
    npm run query-bestiary -- zone "Village d'Amakna"

`scrape-bestiary` archive intégralement les collections publiques `monsters`, `dungeons`, `achievements`, `subareas` et `map-positions` sous `data/dofusdb/raw`, puis construit `data/dofusdb/bestiary.json`. Ce catalogue compact permet les recherches locales par zone et contient l’index coordonnées → sous-zones.

```powershell
npm run scrape-breeds
npm run scrape-challenges
npm run scrape-world-tour
```

Les métadonnées complètes sont conservées sous `data/dofusdb/` et les images nécessaires au build sous `public/breeds/`, `public/profile-avatars/`, `public/challenges/` et `public/world-tour/`. Les commandes sont séquentielles, utilisent un User-Agent identifiable, réessaient les erreurs temporaires et ignorent les images déjà présentes sauf avec `--force`. `--metadata-only` permet d’actualiser uniquement les catalogues JSON.

`scrape-world-tour` reconstruit localement les deux parcours de donjons de Metag Robill (27) et Emma Tompouce (29) depuis les hauts faits DofusDB 559 à 564. Il associe chaque donjon à sa première étape `DUNGEON` dans les archives du Guide Principal, télécharge le portrait du boss et conserve son niveau ainsi que ses points de vie. La page principale calcule ensuite la progression exclusivement depuis les étapes terminées du personnage actif. L’Antre du Kralamoure Géant reste le seul objectif non rattaché, car la quête correspondante n’est pas présente dans l’archive locale actuelle.

### Résumés locaux des guides de quêtes

Les explications courtes affichées dans la checklist sont générées en amont, jamais pendant la consultation. Le pipeline télécharge les pages DofusPourLesNoobs à faible cadence, extrait leur texte en mémoire, demande une reformulation structurée à OpenAI ou au CLI Cline, puis ne sauvegarde que le résumé et le hash de la source. Le HTML et les images de la page ne sont ni archivés ni redistribués.

```powershell
$env:OPENAI_API_KEY = "..."
npm run summarize-quests -- --quest-key "quest:130"
npm run summarize-quests -- --all --limit 10 --delay-ms 1000
npm run summarize-quests -- --step-min 100 --step-max 125 --guide=-1 --provider cline --model cline-pass/deepseek-v4-pro --concurrency 3
```

Le fournisseur par défaut est `openai`, avec le modèle `gpt-5.4-mini`. `--provider cline` utilise le compte ClinePass local et `cline-pass/deepseek-v4-pro` par défaut. `--concurrency` est plafonné à 3 ; seules les générations IA sont parallèles, tandis que l’enrichissement et l’écriture de l’archive restent séquentiels. Utiliser d’abord une petite valeur de `--limit` pour contrôler la qualité et le coût avant un traitement complet. `--force` régénère un résumé ; sans cette option, un hash source inchangé est ignoré et une passe interrompue reprend uniquement les pages manquantes.

Après la reformulation, le pipeline recherche chaque nom d’objet par correspondance exacte dans DofusDB, conserve son identifiant et télécharge son icône dans `public/items`. Il extrait ensuite toutes les coordonnées du tutoriel, les résout dans le catalogue local, puis fige dans le résumé les zones, avis de recherche, archimonstres et succès monstres applicables. Les portraits utiles sont archivés dans `public/bestiary/monsters`. Le rythme se règle avec `--item-delay-ms` (100 ms par défaut) et `--bestiary-image-delay-ms` (25 ms) ; `--metadata-only` conserve les métadonnées sans télécharger les images. L’application ne résout aucune zone et n’appelle ni DofusDB ni DofusPourLesNoobs lors de la consultation.

Les sorties se trouvent dans `data/generated/quest-summaries.json`, ignoré par Git. L’UI affiche le résumé dans un collapse « Explications rapides » uniquement pour la quête courante et conserve toujours le bouton vers le guide original complet.

## Thèmes et progression

daisyUI est le design system principal. `cupcake` est le thème clair par défaut et `coffee` le thème sombre. Le Theme Controller de la navbar persiste le choix dans `localStorage` et un script d’amorçage évite le flash de thème.

Sans connexion, la progression reste locale au navigateur et versionnée. Elle ne modifie jamais la base documentaire ni les JSON bruts. Les états joueur d’étape et de quête sont séparés des relations `START`, `ACTIVE` et `FINISH` issues de DofusGuide.

### Compte Google et personnages

Google Identity Services permet d’enregistrer la progression dans une base utilisateur séparée. Créer un client OAuth 2.0 de type **Application Web** dans Google Cloud, déclarer l’origine JavaScript utilisée (`http://localhost:3001` en développement, par exemple), puis fournir son identifiant :

```powershell
$env:GOOGLE_CLIENT_ID = "votre-client-id.apps.googleusercontent.com"
$env:DOFUSGUIDE_USER_DB = "data/user-data.sqlite" # valeur par défaut
$env:DOFUSGUIDE_USER_DATABASE_URL = "postgresql://dofusguide:dofusguide@db:5432/dofusguide_user" # optionnel
npm run dev
```

Au premier accès, la sauvegarde locale du navigateur devient le premier personnage du compte. Chaque personnage possède ensuite son nom, son portrait de classe masculin ou féminin et sa propre progression. Un lien de partage public permet à un autre compte de suivre ce personnage en lecture seule ; les positions suivies et la présence en ligne sont actualisées toutes les trois secondes dans le header, les chapitres, étapes, quêtes et actions du tutoriel. La présence expire automatiquement environ douze secondes après la fermeture du dernier onglet connecté à ce personnage.

La session utilise un cookie `HttpOnly` et le jeton Google est vérifié côté serveur. `data/user-data.sqlite` n’est jamais reconstruite par `npm run import-db`, qui continue de ne remplacer que `data/dofusguide.sqlite`. `npm run scrape-breeds` archive les rendus plein-corps sexués sous `public/profile-avatars/<breedId>-male-full.png` et `public/profile-avatars/<breedId>-female-full.png`. Le script récupère d’abord le jeton de look public de la classe, puis télécharge séquentiellement le rendu local ; les anciennes images de tête restent uniquement des fallbacks.

## Audit des archives

```powershell
npm run audit-data
npm run audit-data -- --json
```

La commande parcourt toutes les étapes en lecture seule et signale types inconnus, quêtes malformées, identifiants manquants ou dupliqués, positions invalides et incohérences d’étape. Les résultats réels sont documentés dans [docs/data-format.md](docs/data-format.md).

Voir aussi [docs/architecture.md](docs/architecture.md) et [docs/daisyui-components.md](docs/daisyui-components.md).
