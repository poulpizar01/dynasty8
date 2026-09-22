# Dynasty 8 — Plateforme immobilière RP FlashbackFA

**Dynasty 8** est la plateforme web de l'agence immobilière RP du serveur **FlashbackFA**. Le projet réunit un site public destiné aux joueurs et un espace agents complet pour gérer le catalogue, l'équipe, les statistiques, la comptabilité et les outils internes de l'agence.

> **Projet fictif / RolePlay** — les biens, prix, transactions, salaires et données présentés dans l'application appartiennent à l'univers GTA RP et n'ont aucune valeur réelle. Ce projet communautaire n'est pas affilié à Rockstar Games ni à Take-Two Interactive.

## Site actuel

- **Instance publique :** https://dynasty8.fbfa.fr/
- **Espace agents :** https://dynasty8.fbfa.fr/admin.html
- **Serveur RP :** FlashbackFA
- **Développement :** Roxwood Network

Le site tourne sous **Node.js (Express) + PostgreSQL**, en Docker Compose : sur le VPS Dynasty 8 (`deploy/vps/`) ou sur le serveur de l'opérateur FlashbackFA qui l'embarque dans l'ordinateur en jeu FolkOS (`deploy/operateur/`).

---

## Fonctionnalités publiques

### Accueil

- présentation premium de Dynasty 8 ;
- statistiques dynamiques du catalogue ;
- vitrine des biens mis en avant ;
- sélection **Nos coups de cœur** avec filtres et carrousel ;
- accès rapide aux principales catégories ;
- guide de fonctionnement de l'agence ;
- intégration de la WebMap FlashbackFA.

### Catalogue immobilier

Le catalogue est alimenté depuis la base de données et comprend notamment :

- **habitations** ;
- intérieurs **meublés / non meublés** ;
- **garages** ;
- **biens exclusifs** ;
- fiches détaillées pour chaque bien ;
- prix de vente et/ou de location ;
- photos multiples ;
- mise en avant de biens favoris ;
- recherche et filtres selon les pages.

### Cohérences RP

Une section dédiée permet de consulter les règles et informations de cohérence pour différentes zones :

- Habitation ;
- Garage ;
- Cayo Perico ;
- Roxwood.

Ces pages sont reliées à la WebMap afin d'aider les joueurs à localiser les secteurs concernés.

### VIP PLUS

Le site possède une page dédiée au système **VIP PLUS** de FlashbackFA et à son utilisation dans le cadre des biens immobiliers concernés.

### Agence

Le site comprend également :

- les services proposés par Dynasty 8 ;
- la page **Notre équipe** ;
- les profils publics des agents ;
- une FAQ ;
- les informations de confidentialité ;
- les liens Discord et WebMap utiles.

---

## Espace agents

L'espace `/admin.html` est réservé aux membres Dynasty 8.

### Authentification Discord

La connexion se fait avec **Discord OAuth2** :

1. l'utilisateur se connecte avec son compte Discord ;
2. son compte est reconnu ou placé en attente ;
3. la Direction peut valider la demande et attribuer le bon grade ;
4. les droits affichés dans l'espace agents dépendent ensuite du grade du membre.

Il n'y a donc plus de système principal basé sur un simple code d'accès manuel comme dans les premières versions du projet.

### Gestion des annonces

Les agents autorisés peuvent :

- créer un bien ;
- modifier un bien ;
- masquer ou republier une annonce ;
- supprimer une annonce selon leurs droits ;
- gérer les catégories et informations du bien ;
- ajouter plusieurs photos ;
- choisir les disponibilités vente/location ;
- rechercher et filtrer le catalogue ;
- basculer entre une vue liste et une vue grille.

### Agenda privé

Chaque membre dispose d'un **agenda personnel** :

- visible uniquement par son propre compte ;
- navigation semaine par semaine ;
- création, modification et suppression d'événements ;
- accès rapide à la semaine actuelle.

### Profil agent

Chaque membre peut gérer les informations affichées publiquement sur la page équipe :

- photo ;
- intitulé du poste ;
- spécialité ;
- biographie.

### Comptabilité — Direction

L'espace Direction comprend plusieurs outils internes.

#### Tablettes

Import et mise en forme de relevés provenant d'un tableur ou d'un bot Discord afin d'obtenir des tableaux propres et exploitables.

#### Paramètres de rémunération

Configuration de la rémunération par grade, notamment :

- salaires fixes ;
- commissions ;
- paliers de primes sur les ventes ;
- paliers de primes sur les locations ;
- droits associés aux grades.

#### Déclaration DOT

Outil de préparation de la déclaration hebdomadaire avec :

- chiffre d'affaires ;
- dépenses déductibles ;
- retraits ;
- primes ;
- tableau des salariés ;
- données prêtes à copier dans les documents RP de la DOT.

### Statistiques et rémunérations

Le site peut recevoir automatiquement les ventes et locations depuis un **bot externe** via l'API prévue à cet effet.

L'espace Statistiques permet ensuite d'obtenir :

- un récapitulatif semaine par semaine ;
- les volumes de ventes et locations ;
- un récapitulatif par agent ;
- le quota réalisé ;
- les primes vente/location ;
- le total à verser ;
- le référentiel des agents et de leurs identités RP.

Les événements envoyés par le bot possèdent un identifiant unique afin d'éviter qu'une même vente soit comptabilisée deux fois lors d'un renvoi réseau.

### Bot Roxwood Network — Direction (lecture seule)

L'onglet **Outils → Bot Roxwood Network** affiche l'état et le journal du bot Discord [Roxwood Network Entreprise](https://github.com/poulpizar01/roxwood-network-entreprise) : candidatures (dernier statut, recruteur, réponses au formulaire), demandes d'absence, commandes clients (facture, total, paiement) et logs de monitoring FiveM (prises de service, coffre, factures, ventes run).

Le bot n'a pas d'API de lecture : il **pousse** ses événements au site (webhooks signés HMAC-SHA256, `POST /api/bot-roxwood/webhook`), le site les stocke (`bot_roxwood_evenements`) et l'onglet les affiche. **Rien n'est modifiable depuis le site** : toute action se fait dans Discord. Configuration : [`notes/bot-roxwood-configuration.md`](notes/bot-roxwood-configuration.md) (variable `ROXWOOD_WEBHOOK_SECRETS`).

### Comptes & accès — Direction

La Direction peut :

- valider les demandes Discord ;
- créer ou administrer des comptes ;
- attribuer les grades ;
- activer ou désactiver un accès ;
- consulter la dernière visite ;
- gérer les permissions liées aux rôles internes.

---

## Architecture du projet

Le projet a été conçu pour conserver le même cœur applicatif entre plusieurs environnements d'hébergement.

```text
Navigateur
   │
   ├── fichiers publics : public/
   │
   └── /api/*
          │
          ▼
      server.js (Express)
          │
          ▼
      src/index.js  ──►  src/db-pg.js  ──►  PostgreSQL
```

### Front-end

Le site public et l'espace agents sont construits en **HTML, CSS et JavaScript natif**.

Principaux fichiers :

```text
public/
├── index.html          # Accueil
├── habitation.html     # Catalogue habitations
├── interieurs.html     # Hub intérieurs
├── garages.html        # Garages
├── exclusifs.html      # Biens exclusifs
├── bien.html           # Fiche d'un bien
├── coherences.html     # Hub cohérences
├── coherence.html      # Fiche de cohérence
├── vip.html            # VIP PLUS
├── services.html       # Services
├── equipe.html         # Équipe
├── faq.html            # FAQ
├── admin.html          # Interface agents
├── admin.js            # Logique de l'espace agents
├── biens.js            # Catalogue / fiches de biens
├── layout.js           # Navigation, footer et outils communs
└── style.css           # Design global
```

### Back-end partagé

`src/index.js` contient l'API principale, écrite avec les objets web standards `Request` / `Response` (héritage de la première version hébergée sur Cloudflare Workers, abandonnée en septembre 2026 — le code métier n'a pas eu à être réécrit).

### Serveur Node.js + PostgreSQL

Le serveur `server.js` :

- sert les fichiers de `public/` avec Express ;
- transmet `/api/*` au même back-end `src/index.js` ;
- utilise PostgreSQL via `src/db-pg.js` ;
- applique automatiquement `schema.postgres.sql` au démarrage ;
- traduit à la volée les requêtes écrites en style SQLite (`?1`, `datetime('now')`…) vers PostgreSQL (`src/db-pg.js`).

Prérequis :

- **Node.js 22+** ;
- une base **PostgreSQL** ;
- les variables d'environnement nécessaires.

Installation :

```bash
npm install
npm start
```

### Déploiement VPS

Un pack de déploiement est disponible dans :

```text
deploy/vps/
```

Il contient :

- un `Dockerfile` pour l'application ;
- `compose.yaml` ;
- PostgreSQL avec volume persistant ;
- un exemple de configuration nginx (reverse proxy, HTTPS via certbot) ;
- un modèle `.env.example` ;
- des scripts de sauvegarde et restauration PostgreSQL.

La procédure détaillée se trouve dans [`deploy/vps/README-VPS.md`](deploy/vps/README-VPS.md).

---

## Variables d'environnement

Selon le mode utilisé, l'application peut nécessiter les variables suivantes :

```env
DATABASE_URL=postgresql://...   # compte APPLICATIF restreint (pas d'admin)
DB_SCHEMA_AUTO=0                # le serveur ne crée aucune table (recommandé)
SESSION_SECRET=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=...
STATS_BOT_SECRET=...
ROXWOOD_WEBHOOK_SECRETS=...   # secrets des webhooks du bot Roxwood (séparés par des virgules)
FBFA_STORAGE_TOKEN=...        # stockage des photos sur storage.fbfa.fr
```

Réglages facultatifs du stockage des photos (valeurs par défaut dans `deploy/*/.env.example`) : `FBFA_STORAGE_PREFIXE`, `FBFA_PHOTO_TAILLE_MAX`, `FBFA_STORAGE_DELAI_MS`, `FBFA_IMPORTS_EN_ATTENTE_MAX`, `FBFA_NETTOYAGE` (`simulation` par défaut, `actif`, `desactive`) et `FBFA_NETTOYAGE_DELAI_HEURES`. `API_TAILLE_CORPS_MAX` borne la taille des requêtes `/api/*` (32 Mo par défaut).

Option PostgreSQL disponible pour certains environnements :

```env
PGSSL=disable
```

ou

```env
PGSSL=require
```

`SESSION_SECRET`, les identifiants Discord, les mots de passe de base de données, `STATS_BOT_SECRET`, `ROXWOOD_WEBHOOK_SECRETS` et `FBFA_STORAGE_TOKEN` sont des **secrets** : ils ne doivent jamais être ajoutés au dépôt Git.

---

## Photos — stockage storage.fbfa.fr

Les photos d'annonces et de profils importées depuis l'espace agents sont envoyées au serveur (`POST /api/biens/photo`, `POST /api/profil/photo`), contrôlées, puis déposées sur `storage.fbfa.fr` ; seule leur URL publique est enregistrée. Chaque fichier est suivi en base (`medias`, `medias_references`) : temporaire jusqu'à l'enregistrement du contenu, puis rattaché ; une photo retirée n'est supprimée à distance qu'après validation en base, sans autre référence et après un délai de grâce. Les anciennes photos base64 et les liens collés restent affichés et ne sont jamais supprimés.

Code : `src/fbfa-storage.js` (client de l'API), `src/images.js` (validation des fichiers), `src/medias.js` (cycle de vie, nettoyage), `src/migration-medias.js`. Procédures (nettoyage, migration des photos base64, diagnostic du service) : section « Photos » de [`deploy/operateur/README-OPERATEUR.md`](deploy/operateur/README-OPERATEUR.md).

---

## Base de données

Un seul fichier de schéma : `schema.postgres.sql`, écrit en opérations non destructives (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`…) et rejouable : une nouvelle table ou colonne s'ajoute simplement à ce fichier.

**Deux comptes PostgreSQL, deux rôles** (depuis sept. 2026) :

| | Compte admin (`POSTGRES_USER`) | Compte applicatif (`APP_DB_USER`) |
|---|---|---|
| Utilisé par | le service `migration` du compose, à la demande | le site, en permanence |
| Droits | propriétaire de la base | `SELECT`, `INSERT`, `UPDATE`, `DELETE` + `USAGE` sur les séquences |
| Peut créer des tables | oui | **non** |

```bash
node scripts/appliquer-schema.js            # vérifie, n'écrit rien
node scripts/appliquer-schema.js --apply    # applique le schéma + les droits (compte admin)
```

Le serveur, lui, démarre avec `DB_SCHEMA_AUTO=0` : il **vérifie** que les tables et colonnes attendues existent (liste déduite du fichier SQL, `src/schema.js`) et refuse de démarrer sinon, en indiquant la commande à lancer. `DB_SCHEMA_AUTO=1` (défaut historique) applique le schéma au démarrage — pratique en développement local, mais le compte doit alors être administrateur.

Sauvegarde / restauration : `deploy/vps/backup.sh` et `restore.sh` (`pg_dump` / `pg_restore`). Après une restauration, relancer la migration pour réaccorder les droits du compte applicatif.

---

## API bot — statistiques

Une API protégée par `STATS_BOT_SECRET` permet à un bot externe d'envoyer les ventes et locations effectuées en jeu.

Points importants :

- authentification par secret côté serveur ;
- réception automatisée des données ;
- stockage de l'historique ;
- calculs hebdomadaires ;
- rapprochement avec les agents ;
- mécanisme d'idempotence via `eventId` pour éviter les doublons lors d'un retry réseau.

La documentation spécifique au bot est disponible dans le dossier `notes/`.

---

## Sécurité

Quelques règles essentielles :

- ne jamais commiter de fichier `.env` ni de sauvegarde de base (`*.dump`) : ils sont ignorés par Git et transmis hors dépôt (les anciens commits en contiennent encore — voir `scripts/purger-historique-secrets.sh`) ;
- protéger les `.env` sur le serveur : `chmod 600`, propriétaire = compte qui lance le service (`bash deploy/verifier-env.sh <chemin>`) ;
- faire tourner le site avec le compte PostgreSQL restreint, jamais avec le compte administrateur ;
- le conteneur applicatif tourne sous l'utilisateur `node` (uid 1000), jamais en root ;
- ne jamais exposer `SESSION_SECRET` ;
- ne jamais exposer `DISCORD_CLIENT_SECRET` ;
- ne jamais exposer `STATS_BOT_SECRET` ;
- utiliser un compte Discord distinct par membre ;
- attribuer uniquement les droits nécessaires à chaque grade ;
- conserver PostgreSQL inaccessible directement depuis Internet sur un déploiement VPS ;
- effectuer des sauvegardes régulières de la base avant toute migration importante.

---

## Structure principale

```text
Dynasty8/
├── public/                    # Site et interface agents
├── src/
│   ├── index.js               # API / logique applicative principale
│   ├── db-pg.js               # Adaptateur PostgreSQL (+ transactions)
│   ├── fbfa-storage.js        # Client du stockage storage.fbfa.fr
│   ├── images.js              # Validation des fichiers image
│   ├── medias.js              # Suivi, rattachement et nettoyage des photos
│   ├── migration-medias.js    # Migration des anciennes photos base64
│   ├── bot-roxwood.js         # Réception signée des webhooks du bot Roxwood (lecture seule)
│   └── corps-requete.js       # Limite de taille des requêtes /api/*
├── deploy/
│   ├── vps/                   # Docker Compose autonome (app + PostgreSQL, derrière nginx)
│   └── operateur/             # Docker Compose pour le serveur FlashbackFA (proxy externe, SSO FolkOS)
├── notes/                     # Documentation technique complémentaire
├── scripts/                   # Scripts d'administration (à lancer à la main)
├── tests/                     # Tests automatisés (`npm test`)
├── server.js                  # Serveur Node.js / Express
├── schema.postgres.sql        # Schéma PostgreSQL (appliqué au démarrage)
├── mettre-en-ligne-vps.bat    # Mise en ligne sur le VPS depuis Windows
├── package.json
└── README.md
```

---

## Développement

Avant une modification importante :

1. travailler depuis une branche ou disposer d'un commit de sauvegarde ;
2. vérifier que les changements n'altèrent pas les calculs de statistiques ou de rémunération ;
3. tester l'authentification et les permissions si l'espace agents est concerné ;
4. tester les migrations sur une copie de la base avant toute opération sensible ;
5. ne jamais utiliser les données de production comme terrain d'essai.

Le dépôt contient des tests automatisés pour plusieurs comportements critiques, notamment la compatibilité PostgreSQL, la robustesse de connexion et la prévention des doublons statistiques.

Tests : `npm test`. Les tests des photos qui ont besoin d'une vraie base PostgreSQL (droits, rattachement, nettoyage, migration — avec un faux service de stockage, jamais le vrai) sont ignorés sans `TEST_DATABASE_URL` :

```bash
docker run -d --name d8-test-pg -e POSTGRES_USER=d8 -e POSTGRES_PASSWORD=d8test -p 127.0.0.1:55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://d8:d8test@127.0.0.1:55432/postgres npm test
```

Une base jetable est créée puis supprimée pour chaque fichier de test.

---

## État du projet

Le projet est **actif** et continue d'évoluer. L'architecture Cloudflare d'origine a été retirée du dépôt en septembre 2026 : une seule façon de lancer le site, Node.js + PostgreSQL en Docker Compose.
