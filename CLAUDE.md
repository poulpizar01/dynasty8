# Contexte projet — Modèle de site d'entreprise RP (Roxwood Network)

Notes de conventions et de pièges pour un agent Claude Code travaillant sur ce dépôt **ou sur un site créé à partir de lui** (bouton « Use this template »). Le modèle frère pour les groupes illégaux est [roxwood-network-site-famille-template](https://github.com/poulpizar01/roxwood-network-site-famille-template) ; celui-ci est plus léger : il impose un **socle** (configs, sécurité, connexion, comptes, grades, déploiement) et laisse la vitrine **et** la partie gestion libres.

- **Toujours répondre en français à l'utilisateur.** Tout le site, les messages d'erreur, les commentaires du code et les commits sont en français.
- Style du code : dense, commentaires courts qui disent *pourquoi*, pas de framework front (HTML / CSS / JS natif), TypeScript côté serveur. Imiter le code voisin.

## La règle qui structure tout : socle / entreprise

| Socle — mutualisé, identique partout | Entreprise — personnalisable par site |
|---|---|
| `server/src/index.ts`, `server/src/socle/`, `server/prisma/schema/socle.prisma`, les migrations `*_socle_*`, `server/Dockerfile`, `server/package.json`, `server/deploy/`, `server/test/socle-*.test.ts`, `socle/` (`socle.js`, `folkos.js`, `signature.css`), `compose*.yaml`, `.env.example` (sauf sa dernière section), `docs/`, `.claude/skills/`, `CLAUDE.md`, `.gitignore`, `.dockerignore` | `README.md` (présentation du site), `ENTREPRISE.md`, `site.json`, `theme.css`, vitrine (`index.html`, `styles.css`, `main.js`, `404.html`, `confidentialite.html`, `robots.txt`, `sitemap.xml`, autres pages de la racine), `assets/`, **toute** la gestion (`gestion/`), `server/src/entreprise/`, `server/prisma/schema/entreprise.prisma` et ses migrations, les autres tests de `server/test/` |

- Dans un site, on ne modifie **pas** un fichier du socle : on corrige dans le modèle, puis chaque site fait `git fetch modele && git merge modele/main` (voir docs/modele.md). Un site qui touche au socle se crée des conflits à chaque mise à jour et perd les correctifs de sécurité.
- Reporter le modèle dans un site **uniquement par ce merge**, jamais en recopiant les fichiers ni par `git cherry-pick` : git ne saurait pas que ces commits sont intégrés, et chaque merge suivant signalerait des conflits partout. Historique déjà divergé alors que le contenu est identique (vérifier `git diff HEAD modele/main -- socle server docs`, vide hors valeurs propres au site) : `git merge -s ours modele/main` l'enregistre une fois sans changer aucun fichier.
- Un besoin que le socle ne couvre pas : d'abord chercher s'il se fait côté entreprise (routes, pages, tâches dans `demarrage()`). S'il exige vraiment le socle (nouvelle capacité commune), l'ajouter **au modèle** pour tous.
- Dans le dépôt **modèle** : aucun contenu propre à une entreprise (noms, lieux, métier). L'exemple « annonces » est volontairement générique.
- Les fichiers du socle commencent par un commentaire `SOCLE —` ; ceux de l'entreprise par `ENTREPRISE —`, `VITRINE` ou `GESTION`.

## Ce que le socle impose à l'entreprise

- **Contrat** : `server/src/socle/contrat.ts`. L'entreprise déclare ses permissions dans `server/src/entreprise/permissions.ts` (fichier sans import, lu par le socle avant les routes) et tout le reste dans `server/src/entreprise/index.ts` : `pages` (niveau de chaque page de `gestion/`), `routes`, `webhooks` (traitement des événements du bot), `avantSuppressionCompte`, `demarrage`, `csp` (`img`, `connect`, `frame`), `hotes` (sous-domaine servi à part, avant tout le socle : sans session ni cookie ni en-têtes du site — le gestionnaire pose les siens ; voir docs/nginx.md).
- **Pages imposées par leur nom** dans `gestion/` (contenu et apparence libres) : `index.html` (connexion, bouton vers `/auth/discord`), `attente.html` (compte pas encore validé ou refusé), `refuse.html` (403 : envoyée par le serveur, adresses absolues), `accueil.html` (arrivée après connexion).
- **Accès aux pages** : toute page de `gestion/` exige un compte validé, sauf déclaration contraire dans `entreprise.pages` (`'public'`, `'connecte'`, `'valide'` ou une clé de permission). Le contrôle a lieu côté serveur avant d'envoyer la page (`server/src/index.ts`) ; le masquage d'un lien côté navigateur n'est que de l'affichage. Une page qui exige une permission la déclare : sinon n'importe quel compte validé la reçoit (les données restent protégées par l'API, mais pas la page).
- **Routes** : sous `/api/…` (la session n'est ouverte que là et sous `/auth`), chacune commence par une garde étalée de `socle/http.ts` : `...valide` ou `...permission('cle')` (`...connecte` seulement pour ce qui concerne un compte en attente). `permission()` refuse au démarrage une clé non déclarée. Corps lus avec `body()`, `text(v, max)`, `entier()`, `intParam()`.
- **Base** : un seul schéma Prisma en deux fichiers (`server/prisma/schema/`). Les tables de l'entreprise vont dans `entreprise.prisma`, noms en français et snake_case (`@@map`, `@map`). Un compte se référence par `compteId Int @map("compte_id")` **sans relation Prisma** vers `Compte` (sinon il faudrait modifier `socle.prisma`) : ce qui doit disparaître ou être anonymisé avec le compte se traite dans `avantSuppressionCompte` (même transaction que la suppression).
- **Permissions** : le socle a `comptes`, `grades` et `parametres` ; l'entreprise ajoute les siennes. Le propriétaire du serveur Discord a tout. Revérifié à chaque connexion : quand un nouveau propriétaire se connecte, l'ancien perd ses permissions d'office et le grade sans rôle Discord qu'il a pu s'attribuer. Règle anti-escalade (serveur, `socle/droits.ts`) : hors propriétaire, on ne gère que les comptes et grades **sous** son propre grade, et on n'accorde que des permissions qu'on détient. Un compte qui porte un rôle Discord lié à un grade reçoit ce grade et est validé d'office à la connexion ; un grade lié à un rôle que le compte n'a plus lui est retiré. Un grade attribué à la main plus haut que celui du rôle l'emporte (sinon, lier un grade inférieur à un rôle porté par tous ferait tomber les supérieurs). Lier un grade à un rôle Discord exige aussi la permission `comptes` (c'est valider des comptes). Un compte refusé ne peut pas supprimer son compte (il effacerait son refus).
- **Rôles Discord du compte** : `req.compte.rolesDiscord` (IDs des rôles portés sur le serveur, relus à chaque connexion Discord ; la connexion FolkOS ne les relit pas). Pour ce que l'entreprise règle selon le rôle (qui voit quoi) ; un rôle retiré sur Discord compte jusqu'à la connexion suivante (7 jours au plus) : un droit qui doit tomber aussitôt passe par un grade et la gestion des comptes.
- **Bot Discord** (`DISCORD_BOT_TOKEN`, facultatif) : tout appel passe par `socle/discord.ts` (`appelBot`, `posterMessage`, `ErreurDiscord` avec le statut et un message lisible ; `botDiscordConfigure()` pour masquer ce qui en dépend). Le socle n'exige aucun droit au bot ; un site qui lui fait lire un salon ou écrire dans un ticket documente les droits nécessaires dans son guide d'installation.
- **Paramètres** (liens et réglages modifiables depuis la gestion, jamais dans le code ni dans le `.env`) : l'entreprise les déclare par groupes dans `entreprise.parametres` (types `lien`, `origine`, `texte`, `entier`, `id-discord`, `ids-discord`, ou saisie propre avec `lire` / `afficher`) ; le socle valide, enregistre (clés `site.<cle>`), sert la page `gestion/parametres.html` (permission `parametres`, du socle) et `GET /api/liens`. Lecture : `parametre()`, `lienParametre()`, `origineParametre()`, `entierParametre()`, `idsParametre()` (`socle/parametres.ts`). Pages publiques : `<a data-lien="<cle>" hidden>` (lien déclaré `public`), rempli par `socle.js`, masqué s'il est vide. Une adresse que le serveur appelle est de type `origine` et s'appelle par `requeteHttps` (`socle/adresses.ts`).
- **Réglages** : `socle/reglages.ts` (`reglage(cle)`, `definirReglage(cle, valeur)`) ; préfixer les clés de l'entreprise par leur domaine (`stocks.seuil`).
- **Limites de requêtes** : `socle/limites.ts` (`limiter`, `limits.upload`…). Une route de l'entreprise n'importe jamais `socle/security.ts` (il lit `entreprise.csp` : dépendance circulaire, le serveur ne démarre pas).
- **Images** : `socle/images.ts` (`...recevoirImage` puis `enregistrerImage(dossier, req.file)`, `retirerImage()`) : contrôle du contenu réel, 15 Mo / 25 Mpx, réencodage WebP, stockage distant en prod (disque local en dev, toujours). Ne jamais écrire un fichier envoyé ailleurs. Aucun ajout d'image par lien (ni téléchargement par le serveur, ni adresse d'une image hébergée ailleurs) : seul un fichier envoyé au site entre.

## Identité du site : `site.json` et `server/src/socle/site.ts`

- `site.json` (racine) : `nom` et `description` obligatoires ; `couleur` (facultative, `#rrggbb`) et `discord` (facultatif, `https://…`) contrôlées ; **toute autre clé texte est libre** (`slogan`, `secteur`, `adresse`, `horaires`…). `url` est réservée. Le serveur refuse de démarrer sur une valeur invalide.
- `site.ts` remplace `{{cle}}` au moment de servir les `.html`, `.css`, `.txt`, `.xml` (racine et `gestion/`). `{{Cle}}` = même valeur avec majuscule initiale ; `{{url}}` = `BASE_URL` (le domaine n'est écrit nulle part en dur). Valeurs échappées pour le HTML. Rendu mis en cache en production, relu à chaque requête en dev. Un `{{cle}}` inconnu est laissé tel quel et signalé dans les journaux.
- **Piège** : ne jamais placer un `{{…}}` dans une **chaîne JavaScript** d'un `<script>` en ligne (une apostrophe — « l'entreprise » — casserait le script). En JS, lire le nom via `socle.nomSite` (tiré de `<meta name="application-name" content="{{nom}}">`).
- Chaque page de `gestion/` reprend : `<meta name="application-name" content="{{nom}}">`, `/theme.css` avant ses propres feuilles, `/socle/socle.js` avant ses scripts.

## Stack et commandes

- Serveur : Node 22, Express 5, TypeScript (ESM), Prisma 7 + PostgreSQL 17, sessions `connect-pg-simple`, `sharp`, `multer`, `helmet`, `express-rate-limit`. Une nouvelle dépendance npm se discute dans le modèle (`server/package.json` est mutualisé) ; côté navigateur, une bibliothèque se copie dans `assets/vendor/` ou `gestion/vendor/`.
- Dev (Docker Desktop) : `docker compose up` → http://localhost:3000, gestion : http://localhost:3000/gestion/. `compose.override.yaml` monte le code, lance `tsx`, active `DEV_LOGIN` (connexion sans Discord : `/auth/discord` ouvre le compte « Dev local », propriétaire ; `/auth/discord?compte=<ID Discord>` un compte existant, pour essayer chaque niveau d'accès). Après modification de `server/src` : `docker compose restart app`.
- Vérifier le typage : `docker exec -w /app/server <SITE_ID ou site>-app npx tsc -p . --noEmit` (sous Git Bash Windows, préfixer `MSYS_NO_PATHCONV=1`).
- Tests : `server/test/*.test.ts` (`node:test`, lancés par tsx, ni typés ni dans l'image) : `docker exec -w /app/server <SITE_ID ou site>-app npm test`. Pour ce dont une erreur ne se voit pas à l'écran : calculs d'argent, analyse de fichiers reçus, contrôles de sécurité. Ceux du socle s'appellent `socle-*.test.ts` (arrivent avec les mises à jour du modèle, ne pas les modifier dans un site) ; les autres sont ceux du site. À lancer avant chaque commit qui touche le code testé.
- Migration : modifier `server/prisma/schema/entreprise.prisma`, puis `docker compose exec app npx prisma migrate dev --name <description>` et **committer le dossier créé** (la prod applique les migrations au démarrage, `prisma migrate deploy`). Une migration ne s'annule pas : retour arrière = restauration d'une sauvegarde. Les migrations du socle portent `_socle_` dans leur nom et arrivent par la mise à jour depuis le modèle ; ne jamais en modifier une.
- Prod : voir `server/README.md` (VPS, nginx, certbot, `.env` avec `COMPOSE_FILE=compose.yaml` qui écarte l'override de dev).

## Webhooks du bot Discord entreprise

- Le bot [roxwood-network-entreprise](https://github.com/poulpizar01/roxwood-network-entreprise) pousse des événements signés (`absence.updated`, `order.updated`, `recruitment.updated`, `monitoring.*`, `custom`). Le socle les reçoit sur `POST /webhooks/bot` (`socle/routes/webhooks.ts`) : signature HMAC vérifiée contre `BOT_WEBHOOK_SECRETS`, serveur Discord contrôlé, dédoublonnage des nouvelles tentatives, puis appel de `entreprise.webhooks[type]`. Détail et formes des événements : `docs/webhooks.md`.
- Un traitement doit être **idempotent** à l'échelle métier (un même événement métier peut revenir avec un contenu différent : `absence.updated` est renvoyé à chaque changement de statut) et ne jamais faire confiance au contenu au-delà de sa forme (le bot relaie des saisies d'utilisateurs Discord).

## Sécurité (à préserver)

- `helmet` avec une CSP stricte (`socle/security.ts`) : scripts, styles et polices depuis le site uniquement, **scripts en ligne seulement avec le jeton (nonce) de la réponse**, que `site.ts` ajoute à chaque `<script>` des pages servies — un `<script>` écrit dans une page fonctionne tel quel, mais un attribut `onclick=…` ou un script inséré par `innerHTML` ne s'exécute jamais (écouteurs en JS uniquement) ; images depuis le site, Discord et l'origine de `STORAGE_URL`. Traitement des images : `sharp.cache(false)` et `sharp.concurrency(1)` (`socle/images.ts`) — pic mesuré ~190 Mo pour 25 Mpx, PNG 16 bits compris ; ne pas relever les 25 mégapixels sans relever `APP_MEMORY`. Une exception (carte, service d'images) se déclare dans `entreprise.csp` (origine `https://` seule) et dans `confidentialite.html` ; elle se justifie dans le commit.
- Toute donnée venant d'un utilisateur, de Discord ou du bot s'insère par `textContent`, ou par `socle.esc()` dans un gabarit HTML. Une URL construite depuis une donnée n'accepte que `https:` ou une adresse du site.
- Appel ou relais vers une adresse réglée depuis la gestion (carte, service tiers) : jamais vers le serveur lui-même ni le réseau interne — `socle/adresses.ts` (`hoteInterdit` à la saisie, `requeteHttps` pour l'appel : adresse recontrôlée à chaque connexion, jamais `fetch`). Le site n'appelle jamais une adresse donnée par un simple utilisateur.
- Message posté sur Discord par le bot : toujours par `posterMessage` (mentions limitées aux personnes visées) — un titre saisi contenant `@everyone` notifierait sinon tout le serveur.
- Requêtes qui modifient des données : refusées si l'en-tête `Origin` n'est pas celui de `BASE_URL`.
- Réponses de `/api` et `/auth` : `Cache-Control: no-store` (rien de personnel ne reste dans le cache d'un ordinateur partagé).
- Seuls `gestion/`, `socle/`, `assets/`, `/uploads` (dev) et les fichiers de premier niveau (`*.html|css|js|txt|xml`) sont servis : jamais `server/`, `site.json`, `compose.yaml`, `.env`, `docs/`. Vérifier avec `curl` qu'un nouveau fichier sensible reste en 404. Une vitrine à plusieurs pages les garde à la racine.
- Sessions : cookie `site.sid` `HttpOnly`, `SameSite=Lax` (`None` avec FolkOS), `Secure` en HTTPS, 7 jours ; nouvelle session à chaque connexion. Le middleware de session ne tourne que sur `/api`, `/auth` et les pages HTML de `gestion/` : une route qui lit `req.session` vit sous `/api` ou `/auth`.
- Connexion de dev (`DEV_LOGIN=1`) : trois verrous indépendants, à garder tous — refusée si `BASE_URL` n'est pas `http://localhost`, refusée dans l'image de production (`NODE_ENV=production`), et la route n'accepte qu'une requête arrivée directement sur la machine.
- Ordinateur en jeu (FolkOS, `docs/folkos.md`) : facultatif, activé par `FOLKOS_HOTE`. Il ouvre l'affichage en iframe (`frame-ancestors`), passe le cookie en `SameSite=None` (le contrôle d'`Origin` devient la seule barrière contre les requêtes d'un autre site) et autorise le SDK de l'opérateur. La connexion « IG » (`/auth/folkos`) n'est acceptée qu'après une connexion Discord de moins de 30 jours : ne pas l'assouplir, c'est ce qui coupe l'accès en jeu d'un employé parti du serveur Discord.
- Aucun secret dans le dépôt ni dans une page : variables d'environnement seulement (`.env`, lu dans `src/entreprise/` avec les aides de `socle/config.ts`). Une variable de l'entreprise se documente dans la dernière section de `.env.example`.

## Déploiement : pièges connus

- Guide complet : `server/README.md`. Ordre de mise en service : site installé, propriétaire du serveur Discord connecté le premier, grades créés (avec leur rôle Discord), puis les employés se connectent.
- `config.ts` refuse de démarrer sur un `.env` incomplet ou douteux : vérifier le `.env` de prod avant une mise à jour qui touche `config.ts`.
- Base : en prod, le site se connecte avec `site_app` (propriétaire des tables, pas super-utilisateur), créé par le service `db-roles` ; en dev il garde `site`. Une migration qui exige un super-utilisateur (`CREATE EXTENSION`…) passerait en dev et échouerait en prod. Restaurer une sauvegarde avec `psql -U site_app`.
- Sauvegardes : sans les sessions, fichiers en `600`. Ne stocker aucun secret en base hors de la table `session` sans l'exclure aussi de `pg_dump` (`compose.yaml`).
- Aucune ressource tierce dans les pages : `confidentialite.html` l'affirme, la garder vraie (et la compléter dès que le site enregistre autre chose).
- `SITE_ID` et `HOST_PORT` uniques par VPS. Ne pas tester la connexion avant le certificat (cookie `Secure`).
- Règles de l'hébergement (VPS) : aucun volume Docker de médias (les images vont au stockage distant, obligatoire en prod) ; un fichier nginx par site nommé `<domaine>.conf`, avec un bloc HTTP réservé au défi ACME (certificat), `include snippets/deny-hidden.conf`, `X-Forwarded-Proto` et `X-Forwarded-Host` transmis ; une route longue ou un flux SSE a son bloc `location` dans le bloc HTTPS. Modèle : `server/deploy/nginx.conf.example`, ordre de mise en place : `docs/nginx.md`.
- Ne jamais copier `.env.example` en dev (sa ligne `COMPOSE_FILE` désactive l'override de dev).

## Vérifier un changement visuel

Le site doit rester propre de 360 px à l'écran large : aucun débordement horizontal (un tableau défile dans sa carte, pas la page), menu utilisable à toutes les largeurs. Après un changement de mise en page, contrôler au minimum 375, 768, 1 024 et 1 280 px, vitrine et gestion, menu ouvert compris.

## Audits

`/audit [angle]` (`.claude/skills/audit/`) lance les prompts de `docs/audits.md` : accès et sessions, navigateur, webhooks et intégrations, fiabilité, socle — chacun dans un agent séparé, puis un rapport fusionné. À lancer avant une mise en prod ou après une grosse fonctionnalité. Dans un site, un défaut trouvé dans un fichier du socle se corrige **dans le modèle**.

## Git

- Commits en français, préfixés par le domaine (`Socle : …`, `Gestion : …`, `Vitrine : …`, `Docker : …`, `Docs : …`), corps expliquant le pourquoi.
- Ne pas committer : `.env`, `uploads/`, `backups/`, `node_modules/`, `server/src/generated/`, `server/dist/` (déjà ignorés).

## Propre à ce site

Les notes métier de chaque site (ce que fait l'entreprise, ses tables, ses pages, ses pièges) vivent dans `ENTREPRISE.md`, personnalisable, importé ci-dessous. Ce fichier-ci reste celui du modèle.

@ENTREPRISE.md
