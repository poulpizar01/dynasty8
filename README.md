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
SESSION_SECRET=valeur-aleatoire \
npm start                      # http://localhost:3000
```

Sans `DB_SCHEMA_AUTO`, le serveur applique `schema.postgres.sql` au démarrage :
pratique en local, à condition que le compte PostgreSQL soit administrateur.
Les packs de déploiement règlent `DB_SCHEMA_AUTO=0` — le serveur se contente
alors de **vérifier** le schéma et refuse de démarrer s'il manque une table ou
une colonne, en indiquant la commande à lancer.

Sous Windows, `lancer-en-local.bat` fait tout d'un double-clic : base
PostgreSQL dans un conteneur Docker (`dynasty8-local-pg`, données
conservées), dépendances, serveur, navigateur. Passer un fichier de
sauvegarde en argument le restaure d'abord. Identifiants Discord et jetons
facultatifs : copier `local.exemple.bat` en `local.bat` (non versionné).

La connexion à l'espace agents passe uniquement par Discord : pour l'utiliser
en local, déclarer `http://localhost:3000/api/auth/discord/callback` dans le
portail Discord (RoxwoodLegal → OAuth2 → Redirects), qui accepte plusieurs
URL de redirection.

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
- **Statistiques et rémunérations** — récapitulatif hebdomadaire, volumes,
  quota par agent, primes vente et location, total à verser, référentiel des
  identités RP.
- **Comptabilité (Direction)** — mise en forme de relevés collés depuis un
  tableur ou un bot ; paramètres de rémunération par grade (salaires,
  commissions, paliers de primes) ; préparation de la déclaration DOT
  hebdomadaire (chiffre d'affaires, dépenses, retraits, primes, salariés).
- **Bot Roxwood Network** — journal du bot Discord, en lecture seule.
- **Comptes & accès (Direction)** — validation des demandes, grades,
  activation ou désactivation d'un accès, dernière visite, permissions.

Un seul endroit définit chaque montant : les primes sont **recalculées** à
partir des barèmes du site (`src/stats-calc.js`), jamais lues depuis une
source extérieure, même quand cette source contient une colonne « montant ».

### Depuis l'ordinateur en jeu (FolkOS)

Le site est affiché dans une iframe du navigateur FiveM. Ce qui en découle,
côté code : `Content-Security-Policy: frame-ancestors …` sur **toutes** les
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
| `src/migration-medias.js` | migration des anciennes photos base64 |
| `src/stats-calc.js` | calculs de primes, quotas et semaines ISO |
| `src/google-sheets.js` | lecture du tableur de la Direction (export CSV) |
| `src/bot-roxwood.js` | réception signée des webhooks du bot Roxwood |
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

```bash
node scripts/appliquer-schema.js            # vérifie, n'écrit rien
node scripts/appliquer-schema.js --apply    # applique le schéma et les droits
```

Sauvegarde et restauration : `deploy/vps/backup.sh` et `restore.sh`
(`pg_dump -Fc` / `pg_restore`). Une restauration écrase les droits du compte
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

Procédures (diagnostic du service, migration des photos base64, nettoyage) :
section « Photos » de [`deploy/operateur/README-OPERATEUR.md`](deploy/operateur/README-OPERATEUR.md).

---

## Intégrations externes

- **Bot de ventes** — un bot Discord envoie les ventes et locations faites en
  jeu à une API protégée par `STATS_BOT_SECRET`. Chaque événement porte un
  `eventId` : un renvoi réseau ne compte jamais deux fois la même vente.
  Configuration : [`notes/bot-ventes-configuration.md`](notes/bot-ventes-configuration.md).
- **Bot Roxwood Network Entreprise** — le bot n'a pas d'API de lecture : il
  **pousse** ses événements (candidatures, absences, commandes, monitoring)
  en webhooks signés HMAC-SHA256 sur `POST /api/bot-roxwood/webhook`. Le site
  les stocke et les affiche ; rien n'est modifiable depuis le site.
  Configuration : [`notes/bot-roxwood-configuration.md`](notes/bot-roxwood-configuration.md).
- **Google Sheets de la Direction** — lecture seule de l'export CSV d'un
  classeur partagé par lien (ni compte de service, ni clé), toutes les 20
  minutes, pour le récapitulatif des ventes par agent.
- **WebMap FlashbackFA** — proxifiée par `/api/carte`. L'adresse réelle vit
  dans `WEBMAP_ORIGIN`, jamais dans le dépôt, qui est public ; sans elle, le
  bouton affiche « carte indisponible » et le reste du site fonctionne.

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
bash deploy/vps/installer-vps.sh verifier     # outils, .env, droits — ne modifie rien
bash deploy/vps/installer-vps.sh installer    # construit et démarre
sudo bash deploy/vps/installer-vps.sh nginx   # reverse proxy
```

Mise à jour au quotidien depuis Windows : `mettre-en-ligne-vps.bat`. Le
serveur visé vient de `deploy/vps/cible.bat` (non versionné, modèle :
`cible.exemple.bat`) et s'affiche avant tout envoi. Marche à suivre complète
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
| `SESSION_SECRET` | signature des cookies de session |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` | connexion Discord — l'URL de redirection est la **seule** valeur liée à la machine |
| `STATS_BOT_SECRET` | authentification du bot de ventes |
| `ROXWOOD_WEBHOOK_SECRETS` | secrets des webhooks du bot Roxwood, séparés par des virgules |
| `FBFA_STORAGE_TOKEN` | stockage des photos ; vide = import désactivé, le reste fonctionne |
| `WEBMAP_ORIGIN` | adresse réelle de la WebMap ; vide = carte indisponible |
| `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_GID` | classeur de la Direction ; vide = synchronisation du tableur désactivée |
| `COHERENCES_SHEET_URL` | tableau des cohérences, servi aux seuls comptes connectés ; vide = onglet masqué |
| `FOLKOS_ID_BASE` / `FOLKOS_CLIENT_ID` / `FOLKOS_CLIENT_SECRET` | SSO de l'ordinateur en jeu |
| `ORIGINES_AUTORISEES` | origines admises en écriture, en plus du site lui-même |
| `PORT` / `PORT_LOCAL` | port d'écoute |
| `COOKIES_HTTP` | `1` en HTTP simple (cookies non `Secure`) — jamais en HTTPS |
| `PGSSL` | `disable` ou `require` selon l'hébergement |

Réglages facultatifs du stockage des photos : `FBFA_STORAGE_PREFIXE`,
`FBFA_PHOTO_TAILLE_MAX`, `FBFA_STORAGE_DELAI_MS`,
`FBFA_IMPORTS_EN_ATTENTE_MAX`, `FBFA_NETTOYAGE`,
`FBFA_NETTOYAGE_DELAI_HEURES`. `API_TAILLE_CORPS_MAX` borne les requêtes
`/api/*` (32 Mo par défaut). Valeurs par défaut commentées dans chaque
`deploy/*/.env.example`.

`SESSION_SECRET`, les identifiants Discord, les mots de passe PostgreSQL,
`STATS_BOT_SECRET`, `ROXWOOD_WEBHOOK_SECRETS` et `FBFA_STORAGE_TOKEN` sont
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
- **Conteneur** : l'application tourne sous l'utilisateur `node`, jamais root.
- **En-têtes** : `X-Content-Type-Options`, `Referrer-Policy`, et une CSP dont
  la directive `frame-ancestors` autorise l'ordinateur en jeu.

Règles d'exploitation : ne jamais commiter de `.env` ni de sauvegarde
(`*.dump`) ; protéger les `.env` du serveur (`chmod 600`, propriétaire =
compte qui lance le service, contrôlé par `bash deploy/verifier-env.sh`) ;
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
├── scripts/                    # administration, à lancer à la main
│   ├── appliquer-schema.js     # vérifie ou applique le schéma et les droits
│   ├── fbfa-diagnostic.js      # état du service de stockage des photos
│   ├── migrer-images-fbfa.js   # migration des photos base64 (simulation par défaut)
│   ├── nettoyer-medias-fbfa.js # nettoyage des photos orphelines
│   └── …                       # outils ponctuels (doublons de ventes, purge de secrets)
├── tests/                      # tests automatisés (npm test)
├── deploy/
│   ├── vps/                    # Docker Compose autonome + nginx
│   ├── operateur/              # serveur FlashbackFA (proxy externe, FolkOS)
│   ├── systemd/                # service systemd, sans Docker
│   ├── POUR-NICOLAS.md         # dossier d'hébergement remis à l'opérateur
│   └── verifier-env.sh         # contrôle des droits d'un .env
├── notes/                      # configuration des bots
├── server.js                   # serveur Express
├── schema.postgres.sql         # schéma PostgreSQL (rejouable)
└── mettre-en-ligne-vps.bat     # mise en ligne depuis Windows
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
