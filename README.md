# Dynasty 8 — Plateforme immobilière RP FlashbackFA

**Dynasty 8** est la plateforme web de l'agence immobilière RP du serveur **FlashbackFA**. Le projet réunit un site public destiné aux joueurs et un espace agents complet pour gérer le catalogue, l'équipe, les statistiques, la comptabilité et les outils internes de l'agence.

> **Projet fictif / RolePlay** — les biens, prix, transactions, salaires et données présentés dans l'application appartiennent à l'univers GTA RP et n'ont aucune valeur réelle. Ce projet communautaire n'est pas affilié à Rockstar Games ni à Take-Two Interactive.

## Site actuel

- **Instance publique :** https://dynasty8.poulpizar.workers.dev/
- **Espace agents :** https://dynasty8.poulpizar.workers.dev/admin.html
- **Serveur RP :** FlashbackFA
- **Développement :** Roxwood Network

L'URL `workers.dev` correspond à l'instance Cloudflare historique. Le dépôt contient également toute l'architecture nécessaire pour fonctionner sous **Node.js + PostgreSQL**, notamment sur Railway ou sur un VPS Docker.

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
      src/index.js
          │
          ├── Cloudflare Workers + D1
          │
          └── Node.js / Express + PostgreSQL
                     │
                     └── src/db-pg.js
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

`src/index.js` contient l'API principale en utilisant les objets web standards `Request` / `Response`.

Ce choix permet au même code métier de fonctionner :

- directement dans **Cloudflare Workers** ;
- derrière le serveur **Express** de `server.js`.

### Mode Cloudflare

Le fichier `wrangler.toml` configure :

- le Worker `dynasty8` ;
- les fichiers statiques du dossier `public/` ;
- le passage prioritaire des routes `/api/*` dans le Worker ;
- la base **Cloudflare D1** liée sous le binding `DB`.

Commandes :

```bash
npm install
npm run dev
npm run deploy
```

Le mode Cloudflare reste conservé dans le dépôt afin de garder l'ancienne infrastructure exploitable pendant les migrations.

### Mode Node.js + PostgreSQL

Le serveur `server.js` permet d'exécuter l'application sur un hébergement Node.js classique.

Il :

- sert les fichiers de `public/` avec Express ;
- transmet `/api/*` au même back-end `src/index.js` ;
- utilise PostgreSQL via `src/db-pg.js` ;
- applique automatiquement `schema.postgres.sql` au démarrage ;
- conserve la compatibilité avec les requêtes initialement écrites pour D1/SQLite.

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
- Caddy pour le reverse proxy et HTTPS ;
- un modèle `.env.example` ;
- des scripts de sauvegarde et restauration PostgreSQL.

La procédure détaillée se trouve dans [`deploy/vps/README-VPS.md`](deploy/vps/README-VPS.md).

---

## Variables d'environnement

Selon le mode utilisé, l'application peut nécessiter les variables suivantes :

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=...
STATS_BOT_SECRET=...
```

Option PostgreSQL disponible pour certains environnements :

```env
PGSSL=disable
```

ou

```env
PGSSL=require
```

`SESSION_SECRET`, les identifiants Discord, les mots de passe de base de données et `STATS_BOT_SECRET` sont des **secrets** : ils ne doivent jamais être ajoutés au dépôt Git.

---

## Base de données et migrations

Le dépôt conserve deux familles de schémas :

- `schema.sql` pour Cloudflare D1 / SQLite ;
- `schema.postgres.sql` pour PostgreSQL.

Plusieurs migrations fonctionnelles sont également conservées dans le dépôt, notamment pour :

- Discord OAuth ;
- profils d'équipe ;
- agenda ;
- comptabilité ;
- rémunération ;
- statistiques ;
- ventes / locations ;
- DOT ;
- VIP PLUS.

Le serveur Node applique automatiquement le schéma PostgreSQL au démarrage avec des opérations non destructives prévues pour être rejouables.

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

- ne jamais commiter de fichier `.env` contenant de vraies valeurs ;
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
│   └── db-pg.js               # Adaptateur PostgreSQL
├── deploy/vps/                # Pack Docker Compose pour VPS
├── notes/                     # Documentation technique complémentaire
├── scripts/                   # Scripts d'administration / contrôle
├── tests/                     # Tests automatisés
├── server.js                  # Serveur Node.js / Express
├── schema.sql                 # Schéma Cloudflare D1
├── schema.postgres.sql        # Schéma PostgreSQL
├── wrangler.toml              # Configuration Cloudflare Workers
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

---

## État du projet

Le projet est **actif** et continue d'évoluer. L'ancienne architecture Cloudflare est conservée, tandis que la version Node.js/PostgreSQL permet désormais une migration vers une infrastructure plus classique et maîtrisable.

La priorité est de conserver une seule logique applicative tout en pouvant changer d'hébergeur sans réécrire tout le site.
