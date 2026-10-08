# Dynasty 8 — plateforme immobilière RP (FlashbackFA)

Site public et espace agents de l'agence immobilière **Dynasty 8**, sur le
serveur GTA RP **FlashbackFA** : catalogue des biens, équipe, messagerie
interne, statistiques de ventes, comptabilité et outils de la Direction.

> **Projet fictif / RolePlay.** Les biens, prix, transactions et salaires
> présentés appartiennent à l'univers GTA RP et n'ont aucune valeur réelle.
> Projet communautaire, non affilié à Rockstar Games ni à Take-Two Interactive.

- **Site** : https://dynasty8.fbfa.fr/ — **espace agents** : `/admin.html`
- **Serveur RP** : FlashbackFA · **développement** : Roxwood Network

**Node.js 22 + Express 5 + PostgreSQL**, front en HTML/CSS/JavaScript natif.
Aucune étape de build, aucun framework : deux dépendances en tout (`express`,
`pg`). Le site est aussi consultable depuis l'ordinateur en jeu (FolkOS).

---

## Démarrage local

```bash
npm install
DATABASE_URL=postgres://user:motdepasse@127.0.0.1:5432/dynasty8 \
SESSION_SECRET=une-valeur-aleatoire-longue \
npm start                      # http://localhost:3000
```

Sans `DB_SCHEMA_AUTO`, le serveur applique `schema.postgres.sql` au démarrage :
pratique en local, à condition que le compte PostgreSQL soit administrateur.
Les packs de déploiement règlent `DB_SCHEMA_AUTO=0` — le serveur se contente
alors de **vérifier** le schéma et refuse de démarrer s'il manque une table ou
une colonne, en indiquant la commande à lancer.

La connexion à l'espace agents passe uniquement par Discord. Pour l'utiliser
en local, définir aussi `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et
`DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback`, et
déclarer cette même URL dans le portail Discord (RoxwoodLegal → OAuth2 →
Redirects), qui accepte plusieurs URL de redirection.

Tests : `npm test` (voir [Tests](#tests)).

---

## Ce que fait le site

### Pages publiques

| Page | Contenu |
|---|---|
| Accueil | présentation de l'agence, statistiques du catalogue, biens mis en avant, coups de cœur, accès WebMap |
| Catalogue | habitations, intérieurs meublés / non meublés, garages, biens exclusifs, fiche détaillée par bien (photos, prix vente et/ou location) |
| Cohérences RP | règles de cohérence par zone (habitation, garage, Cayo Perico, Roxwood), reliées à la WebMap |
| VIP PLUS | fonctionnement du système VIP PLUS de FlashbackFA côté immobilier |
| Agence | services, équipe et profils publics des agents, FAQ, confidentialité |

### Espace agents (`/admin.html`)

Connexion par **Discord OAuth2** : le compte est reconnu ou placé en attente,
la Direction valide la demande et attribue un grade, et les droits affichés
découlent ensuite de ce grade.

- **Annonces** — créer, modifier, masquer, republier ou supprimer un bien
  selon ses droits ; photos multiples ; disponibilité vente / location ;
  recherche, filtres, vue liste ou grille.
- **Messagerie interne** — discussions entre agents, présence en ligne et
  indicateur de frappe (`/api/chat/*`).
- **Agenda privé** — semaine par semaine, visible du seul compte concerné.
- **Profil agent** — photo, poste, spécialité, biographie affichés sur la
  page équipe.
- **Statistiques et rémunérations** — volumes de ventes et locations reçus du
  bot ; « Chiffres du tableur » : ventes, locations et primes de chaque agent
  lues dans le Google Sheets de la Direction, archivées chaque dimanche à
  23:59 (heure de Paris) sous le numéro de la semaine et consultables
  ensuite semaine par semaine.
- **RH** — source de vérité de l'identité de chaque employé : prénom, nom,
  ID employé (saisi à la main, unique), ID et pseudo Discord, téléphone, RIB,
  grade, statut, dates d'arrivée et de départ. Effectif par statut et par
  grade, recherche et filtres. Un employé n'est jamais supprimé : il passe
  « Inactif » (date de départ posée), garde son historique et peut être
  réactivé. Les autres modules (ventes, tableur, statistiques, DOT) ne
  stockent que le lien vers la fiche et y lisent l'identité. Les droits
  (voir, ajouter, modifier, désactiver, réactiver, données sensibles) se
  règlent par grade ; Patron, Co Patron et Développeur web les ont tous et
  sont seuls à régler cette matrice. Téléphone et RIB ne sortent du serveur
  que pour un grade qui a la permission « données sensibles ».
- **Comptabilité (Direction)** — mise en forme de relevés collés depuis un
  tableur ou un bot ; paramètres de rémunération par grade (salaires,
  commissions, paliers de primes) ; préparation de la déclaration DOT
  hebdomadaire (chiffre d'affaires, dépenses, retraits, primes, salariés).
- **Paramètres** — tous les liens du site se règlent ici, sans rien écrire
  dans le code et sans redémarrage : WebMap, Google
  Sheets de la synchronisation, registre, Discord de l'agence, boutique VIP,
  liens du pied de page (Patron, Co Patron et Développeur web). On y trouve
  aussi l'état de la synchronisation du tableur (Direction).
  On y règle aussi la **hiérarchie des grades** (rang de chaque grade ;
  Patron et Développeur web au même rang), qui ordonne tous les tableaux et
  fixe les droits de Comptes & accès : on ne gère que les comptes d'un grade
  inférieur au sien, et seuls Patron, Co Patron et Développeur web nomment à
  ces trois grades.
  L'**Apparence** (Direction) remplace les images de la marque — logo,
  emblème, lettrage, icônes, image de partage — ou rétablit celles d'origine.
- **Comptes & accès (Direction)** — validation des demandes, grades,
  activation ou désactivation d'un accès, dernière visite, permissions.

Un seul endroit définit chaque montant : les primes sont **recalculées** à
partir des barèmes du site (`src/stats-calc.js`), jamais lues depuis une
source extérieure, même quand cette source contient une colonne « montant ».

### Depuis l'ordinateur en jeu (FolkOS)

Le site est affiché dans une iframe du navigateur FiveM. Ce qui en découle,
côté code : `Content-Security-Policy: frame-ancestors …` (sources lues dans
`FRAME_ANCESTORS`) sur **toutes** les
réponses (et jamais `X-Frame-Options`, qui donnerait une page blanche sans
message), cookies de session en `Secure; SameSite=None`, aucune boîte de
dialogue native, clavier géré par le SDK de l'opérateur (`fbfa-game.js`), et
connexion « IG » par le SSO FolkOS (`/api/folkos`). Les effets WebGL
(three.js, servi localement depuis `public/vendor/`) sont désactivés en jeu :
le site reste identique, sans la poussière d'or ni l'aurore.

---

## Architecture

```text
Navigateur  ─────────────►  nginx (reverse proxy, sur l'hôte)
                                   │
                                   ▼
                            server.js (Express)
                          fichiers public/   +   /api/*
                                   │
                                   ▼
                             src/index.js
                                   │
                            src/db-pg.js  ──►  PostgreSQL
```

`src/index.js` contient toute l'API, écrite avec les objets web standards
`Request` / `Response` — héritage de la première version hébergée sur
Cloudflare Workers (retirée en septembre 2026), qui a permis de changer
d'hébergement sans réécrire le code métier. `server.js` est l'enveloppe
Express : fichiers statiques, en-têtes de sécurité, limites de taille et
tâches de fond (nettoyage des photos, synchronisation du tableur).

| Module | Rôle |
|---|---|
| `src/index.js` | routes `/api/*`, sessions, permissions, logique métier |
| `src/db-pg.js` | adaptateur PostgreSQL (requêtes en style `?1`, transactions) |
| `src/schema.js` | lecture et vérification de `schema.postgres.sql` |
| `src/fbfa-storage.js` | client du stockage d'objets `storage.fbfa.fr` |
| `src/images.js` | validation réelle des fichiers image (JPEG, PNG, WebP) |
| `src/medias.js` | cycle de vie des photos : envoi, rattachement, nettoyage |
| `src/stats-calc.js` | calculs de primes, quotas et semaines ISO |
| `src/google-sheets.js` | lecture du tableur de la Direction (export CSV) |
| `src/rh.js` | fiches employés, effectif, permissions RH (`/api/rh/*`) |
| `src/grades.js` | la seule définition des grades : niveau d'accès, couleur, rang (hiérarchie réglable dans Paramètres) et règles contre l'élévation de droits |
| `src/reglages.js` | liens du site réglables dans l'onglet Paramètres (`/api/reglages`, `/api/liens`) |
| `src/apparence.js` | images de la marque remplacées dans Paramètres → Apparence (`/api/apparence`), relayées à l'adresse de l'image d'origine |
| `src/corps-requete.js` | limite de taille des requêtes, avant lecture complète |
| `src/entetes-proxy.js` | choix de l'hôte public derrière le reverse proxy |
| `src/limite-debit.js` | limitation de débit par adresse et par route |
| `src/util-crypto.js` | signatures et comparaisons à temps constant |

Front (`public/`) : une page HTML par rubrique, `biens.js` pour le catalogue,
`admin.js` pour l'espace agents, `layout.js` pour la navigation et les outils
communs, `aurora.js` pour le fond animé, `style.css` pour tout le design.

---

## Base de données

Un seul fichier de schéma, `schema.postgres.sql`, écrit en opérations non
destructives (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) et
rejouable : une table ou une colonne s'ajoute simplement à ce fichier.

**Deux comptes PostgreSQL, deux rôles :**

| | Compte admin (`POSTGRES_USER`) | Compte applicatif (`APP_DB_USER`) |
|---|---|---|
| Utilisé par | la migration, à la demande | le site, en permanence |
| Droits | propriétaire de la base | `SELECT`, `INSERT`, `UPDATE`, `DELETE` + `USAGE` sur les séquences |
| Peut créer une table | oui | **non** |

Le compte applicatif est créé, et ses droits accordés, par le bloc final de
`schema.postgres.sql`, exécuté par `psql` avec le compte administrateur :

```bash
docker compose run --rm migration    # packs Docker : applique le schéma et les droits
```

En installation systemd, même fichier, même `psql` : commande dans
[`deploy/systemd/README-SYSTEMD.md`](deploy/systemd/README-SYSTEMD.md).

Sauvegarde et restauration : `pg_dump -Fc` / `pg_restore` dans le conteneur
`postgres` (commandes dans le README VPS, section « Exploitation »). Une restauration écrase les droits du compte
applicatif : relancer la migration juste après.

---

## Photos — stockage `storage.fbfa.fr`

Les photos importées depuis l'espace agents (`POST /api/biens/photo`,
`POST /api/profil/photo`) sont contrôlées par le serveur — type réel du
fichier vérifié en lisant ses octets, dimensions bornées, taille refusée
avant lecture complète du corps — puis déposées sur `storage.fbfa.fr` ; seule
l'URL publique est enregistrée en base.

Chaque fichier est suivi (`medias`, `medias_references`) : **temporaire** tant
que le contenu n'est pas enregistré, puis **rattaché**. Une photo retirée
n'est supprimée à distance qu'après vérification en base, absence de toute
autre référence et un délai de grâce. Le nettoyage est en **simulation par
défaut** (`FBFA_NETTOYAGE=simulation`) : il écrit un rapport sans rien
supprimer. Les anciennes photos base64 et les liens collés restent affichés
et ne sont jamais supprimés.

Les images de la marque (Paramètres → Apparence) suivent le même chemin :
l'image envoyée telle quelle (un PNG garde sa transparence) part sur le
stockage, seule son URL est enregistrée (`apparence_images`). Les pages
gardent les adresses d'origine (`/img/logo-full.png`…) : le serveur y relaie
l'image réglée depuis le stockage, ou sert le fichier livré s'il n'y en a pas
— ou si le stockage ne répond pas. Le dossier du projet reste en lecture seule.

Procédures (diagnostic du service, migration des photos base64, nettoyage) :
section « Photos » de [`deploy/operateur/README-OPERATEUR.md`](deploy/operateur/README-OPERATEUR.md).

---

## Intégrations externes

- **Bot de ventes** — un bot Discord envoie les ventes et locations faites en
  jeu à une API protégée par `STATS_BOT_SECRET`. Chaque événement porte un
  `eventId` : un renvoi réseau ne compte jamais deux fois la même vente.
  Chaque vente est rattachée à sa fiche RH par l'ID Discord du vendeur
  (`discordId`, optionnel) ou, à défaut, par son pseudo.
  Configuration : [`notes/bot-ventes-configuration.md`](notes/bot-ventes-configuration.md).
- **Bot Discord « Roxwood Network Entreprise »** (recrutement) — le bot
  ([dépôt](https://github.com/poulpizar01/roxwood-network-entreprise)) fait
  foi : il pousse son webhook `recruitment.updated`, signé HMAC-SHA256
  (`X-Signature-256`), sur `POST /api/rh/bot/candidatures`. Quand le staff
  valide une candidature dans Discord, la fiche RH est créée aussitôt à partir
  du formulaire ; une embauche constatée seulement en jeu attend
  l'approbation de RH. Un ticket ne
  crée jamais deux fiches, un compte Discord non plus. Le grade d'arrivée, le
  serveur Discord autorisé et la question du formulaire qui donne chaque champ
  de la fiche se règlent dans l'onglet Ressources humaines.
  Configuration : [`notes/bot-recrutement-configuration.md`](notes/bot-recrutement-configuration.md).
- **Google Sheets de la Direction** — lecture seule de l'export CSV d'un
  classeur partagé par lien (ni compte de service, ni clé), toutes les 20
  minutes. RH fait foi : chaque ligne est rattachée à la fiche RH de même
  « Prénom Nom », sans créer de fiche ni changer de grade ; une ligne sans
  fiche est signalée dans RH (« À rattacher »). Ventes et locations
  alimentent « Chiffres du tableur », « Mon profil » et la DOT.
- **WebMap FlashbackFA** — proxifiée par `/api/carte`. L'adresse réelle se
  règle dans l'onglet Paramètres, jamais dans le dépôt, qui est public ; sans
  elle, le bouton affiche « carte indisponible » et le reste du site
  fonctionne. Dans l'espace agents, l'onglet « WebMap » affiche la carte
  dans la page, sans ouvrir de nouvel onglet ; les cookies posés par la
  carte sont préfixés `wm_` et limités au chemin `/api/carte`.

Les deux adresses qui suffiraient, à elles seules, à lire des données de
l'agence — la WebMap et le classeur — sont pour cette raison hors du dépôt,
et un test vérifie qu'elles n'y reviennent pas.

---

## Déploiement

Trois packs, un seul cœur applicatif. **Aucune adresse de serveur ne figure
dans le dépôt** : changer de machine est une opération de configuration.

| Pack | Pour quoi |
|---|---|
| [`deploy/vps/`](deploy/vps/README-VPS.md) | VPS autonome : Docker Compose (app + PostgreSQL) derrière nginx installé sur l'hôte |
| [`deploy/operateur/`](deploy/operateur/README-OPERATEUR.md) | serveur de l'opérateur FlashbackFA : proxy externe, SSO FolkOS, ordinateur en jeu |
| [`deploy/systemd/`](deploy/systemd/README-SYSTEMD.md) | serveur sans Docker : service systemd sous un compte Linux dédié, derrière nginx |

Installation ou reprise sur une machine neuve :

```bash
git clone https://github.com/poulpizar01/dynasty8 /opt/dynasty8
cd /opt/dynasty8/deploy/vps && cp .env.example .env && chmod 600 .env   # puis remplir
cd /opt/dynasty8
stat -c '%a %U' .env                 # attendu : 600 et votre compte
sudo docker compose up -d --build             # construit et démarre
```

Mise à jour au quotidien, sur le serveur :

```bash
cd /opt/dynasty8 && git pull
cd deploy/vps && sudo docker compose up -d --build app
```

Marche à suivre complète
pour déménager (sauvegarde, restauration, redirection Discord, FolkOS,
vérifications) : section « Changer de serveur » du
[README VPS](deploy/vps/README-VPS.md).

Dans les trois cas, Node écoute en local (`127.0.0.1:3010` par défaut) et
nginx proxifie tout, pages comprises :

```nginx
location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP         $remote_addr;
}
```

Ces en-têtes ne sont pas décoratifs : l'application reconstruit ses URL
(retour OAuth Discord, cookies de session) à partir d'eux — voir
`src/entetes-proxy.js`.

---

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | base PostgreSQL — **compte applicatif restreint** en production |
| `DB_SCHEMA_AUTO` | `0` : le serveur vérifie le schéma sans rien créer (recommandé) |
| `SESSION_SECRET` | signature des cookies de session — **obligatoire** : le serveur refuse de démarrer si elle est vide, trop courte ou laissée à une valeur d'exemple |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` | connexion Discord — l'URL de redirection est la **seule** valeur liée à la machine |
| `STATS_BOT_SECRET` | authentification du bot de ventes |
| `RECRUTEMENT_WEBHOOK_SECRET` | secret de l'abonnement « Candidatures » du bot Discord (candidatures acceptées → fiches RH) ; vide = réception désactivée |
| `FBFA_STORAGE_BASE` / `FBFA_STORAGE_TOKEN` | stockage des photos (CDN) : adresse du service et jeton, **les deux** requis ; sinon l'envoi de photos est indisponible (l'espace agents l'indique), le reste fonctionne. Aucune adresse n'est écrite dans le code |
| `SITE_URL_PUBLIQUE` | facultatif : adresse publique du site pour les balises de partage (`og:url`, `og:image`) ; vide = l'adresse par laquelle le visiteur arrive |
| `FOLKOS_SDK_ORIGINE` | hôte du SDK de l'ordinateur en jeu (clavier, Échap), donné aux pages par le serveur ; vide = SDK non chargé |
| `FRAME_ANCESTORS` | sites autorisés à afficher le site dans un cadre (CSP `frame-ancestors`, en plus du site lui-même) ; vide = pas d'affichage dans l'ordinateur en jeu |
| `FOLKOS_ID_BASE` / `FOLKOS_CLIENT_ID` / `FOLKOS_CLIENT_SECRET` | SSO de l'ordinateur en jeu |
| `ORIGINES_AUTORISEES` | origines admises en écriture, en plus du site lui-même |
| `PORT` / `PORT_LOCAL` | port d'écoute |
| `HOST` | facultatif : adresse d'écoute (`127.0.0.1` imposé par l'unité systemd) |
| `NODE_ENV` | `production` : le détail des erreurs n'est jamais envoyé au navigateur (imposé par le Dockerfile et l'unité systemd) |
| `COOKIES_HTTP` | `1` en HTTP simple (cookies non `Secure`) — jamais en HTTPS |
| `PGSSL` | `disable` ou `require` selon l'hébergement |

Réglages facultatifs du stockage des photos : `FBFA_STORAGE_PREFIXE`,
`FBFA_PHOTO_TAILLE_MAX`, `FBFA_STORAGE_DELAI_MS`,
`FBFA_IMPORTS_EN_ATTENTE_MAX`, `FBFA_NETTOYAGE`,
`FBFA_NETTOYAGE_DELAI_HEURES`. `API_TAILLE_CORPS_MAX` borne les requêtes
`/api/*` (32 Mo par défaut). Valeurs par défaut commentées dans chaque
`deploy/*/.env.example` ; un test vérifie que chaque variable lue par le
serveur y est documentée.

`SESSION_SECRET`, les identifiants Discord, les mots de passe PostgreSQL,
`STATS_BOT_SECRET`, `RECRUTEMENT_WEBHOOK_SECRET` et `FBFA_STORAGE_TOKEN` sont
des **secrets** : jamais dans Git, transmis hors dépôt.

---

## Sécurité

Ce qui est en place dans le code :

- **Écritures** : toute requête modifiante dont l'`Origin` n'est ni le site
  ni une origine déclarée est refusée (les cookies sont `SameSite=None` pour
  l'ordinateur en jeu, ce qui rend ce contrôle indispensable).
- **Sessions** : cookie signé, `HttpOnly`, horodatage d'émission ; la
  déconnexion invalide réellement les cookies déjà émis.
- **Débit** : limitation par adresse et par route (connexion, webhook, proxy
  de la carte, API).
- **Corps de requête** : taille refusée dès l'en-tête `Content-Length`, puis
  pendant la lecture du flux.
- **Appels sortants** : tous bornés par un délai (Discord, FolkOS, WebMap,
  stockage, tableur) — aucune requête ne peut rester en vol indéfiniment.
- **Images** : type réel contrôlé en lisant les octets, pas le nom de fichier
  ni le type déclaré.
- **Base** : le site tourne avec un compte sans droit de création.
- **Conteneur** : l'application tourne sous l'utilisateur `node`, jamais root,
  avec un système de fichiers en lecture seule (`read_only`, `/tmp` en
  mémoire) ; elle n'écrit jamais sur le disque (photos sur le CDN, journaux
  sur la sortie standard). En systemd : `ProtectSystem=strict`.
- **En-têtes** : `X-Content-Type-Options`, `Referrer-Policy`, et une CSP dont
  la directive `frame-ancestors` autorise l'ordinateur en jeu.

Règles d'exploitation : ne jamais commiter de `.env` ni de sauvegarde
(`*.dump`) ; protéger les `.env` du serveur (`chmod 600`, propriétaire =
compte qui lance le service, à vérifier avec `stat -c '%a %U' .env`) ;
garder PostgreSQL inaccessible depuis Internet ; sauvegarder avant toute
migration.

---

## Tests

```bash
npm test
```

Les tests qui ont besoin d'une vraie base PostgreSQL (droits, rattachement
des photos, nettoyage, migration — toujours avec un **faux** service de
stockage, jamais le vrai) sont ignorés tant que `TEST_DATABASE_URL` n'est pas
défini :

```bash
docker run -d --name d8-test-pg -e POSTGRES_USER=d8 -e POSTGRES_PASSWORD=d8test \
  -p 127.0.0.1:55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://d8:d8test@127.0.0.1:55432/postgres npm test
```

Une base jetable est créée puis supprimée pour chaque fichier de test. Sont
couverts notamment : calculs de primes et de quotas, compatibilité
PostgreSQL, idempotence des événements du bot, contrôle d'origine, délais des
appels sortants, limitation de débit, invalidation des sessions, validation
des images, cycle de vie et migration des photos, vérification du schéma,
absence d'adresse de WebMap dans le dépôt, et garde-fous des scripts de
déploiement.

---

## Structure

```text
dynasty8/
├── public/                     # site et espace agents (HTML, CSS, JS natif)
├── src/                        # API et logique métier (voir Architecture)
├── tests/                      # tests automatisés (npm test)
├── deploy/
│   ├── vps/                    # Docker Compose autonome + nginx
│   ├── operateur/              # serveur FlashbackFA (proxy externe, FolkOS)
│   ├── systemd/                # service systemd, sans Docker
│   └── POUR-NICOLAS.md         # dossier d'hébergement remis à l'opérateur
├── notes/                      # configuration des bots
├── server.js                   # serveur Express
└── schema.postgres.sql         # schéma PostgreSQL (rejouable)
```

---

## Développement

Avant une modification importante :

1. travailler depuis une branche, ou disposer d'un commit de sauvegarde ;
2. vérifier que les calculs de statistiques et de rémunération sont intacts ;
3. tester l'authentification et les permissions si l'espace agents est touché ;
4. essayer une migration sur une **copie** de la base d'abord ;
5. ne jamais se servir des données de production comme terrain d'essai.

Le projet est **actif**. L'architecture Cloudflare d'origine a été retirée en
septembre 2026 : une seule façon de lancer le site, Node.js + PostgreSQL.
