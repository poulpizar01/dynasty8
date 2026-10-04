# Serveur et déploiement

Express + PostgreSQL + Discord OAuth. Sert aussi la vitrine et la gestion (racine du dépôt). Pour créer un site à partir du modèle et pour le développement, voir le [README de la racine](../README.md).

Documentation détaillée : [API](../docs/api.md) · [webhooks du bot](../docs/webhooks.md) · [nginx](../docs/nginx.md) · [stockage des images](../docs/stockage.md).

## Production
Tout tourne dans Docker, avec le même [`compose.yaml`](../compose.yaml) qu'en dev (site + base + sauvegardes). Le site n'écoute que sur `127.0.0.1:<HOST_PORT>` ; **nginx**, sur la machine, l'expose en HTTPS.

Les commandes ci-dessous visent un VPS Debian / Ubuntu, avec un utilisateur qui a `sudo`. `<depot>` est l'adresse du dépôt **du site** (pas celle du modèle), `<SITE_ID>` l'identifiant choisi dans `.env`.

### 1. Avant de commencer
- **Domaine** : un enregistrement DNS `A` (et `AAAA` si le VPS a une IPv6) du domaine vers l'IP du VPS. Vérifier avec `dig +short <domaine>` : certbot échoue tant que le domaine ne pointe pas sur la machine.
- **Application Discord** : créée et configurée (voir [Application Discord](#application-discord)), avec la redirection `https://<domaine>/auth/discord/callback`.
- **Stockage des images** (si le site en reçoit) : adresse et jeton du service (voir [docs/stockage.md](../docs/stockage.md)).

### 2. Préparer le VPS (une seule fois par machine)
```bash
# Docker (script officiel : Docker Engine + docker compose), démarré avec la machine
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER            # puis se déconnecter / reconnecter pour utiliser docker sans sudo
# nginx, certbot, git
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git
# pare-feu : SSH + web (si ufw est utilisé ; sinon, ouvrir 80 et 443 dans le pare-feu de l'hébergeur)
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

### 3. Installer le site
```bash
git clone -b main <depot> <SITE_ID> && cd <SITE_ID>
cp .env.example .env && chmod 600 .env
mkdir -m 700 backups                        # sauvegardes de la base : lisibles par vous seul
nano .env                                   # remplir : tout est expliqué dans le fichier
docker compose up -d --build
```
- Le serveur suit la branche `main` : c'est elle qui est déployée.
- `SITE_ID` et `HOST_PORT` doivent être **uniques sur la machine** : chaque site a ses propres conteneurs (`<SITE_ID>-app`, `<SITE_ID>-db`, `<SITE_ID>-backup`, et `<SITE_ID>-db-roles`, qui ne tourne qu'un instant à chaque démarrage) et son propre port. `ss -ltnp` liste les ports déjà pris.
- Générer `SESSION_SECRET` (32 caractères au moins, sinon le site refuse de démarrer) et `POSTGRES_PASSWORD` avec `openssl rand -hex 32` (le mot de passe de la base ne se change plus une fois la base créée).

Vérifier : `docker compose ps` (les trois services `Up`, la base `healthy`) et `docker logs <SITE_ID>-app`, qui doit finir par `<nom du site> en écoute sur le port 3000 (https://<domaine>)`. Le premier démarrage crée les tables (migrations Prisma).

### 4. nginx et HTTPS
Un fichier `/etc/nginx/sites-available/<domaine>.conf` tiré de [`server/deploy/nginx.conf.example`](deploy/nginx.conf.example) : un bloc HTTP réservé au défi ACME (certificat) et un bloc HTTPS pour le site. Au premier déploiement, le bloc HTTPS n'est ajouté qu'une fois le certificat obtenu (`certbot certonly --webroot`) : commandes dans l'ordre dans [docs/nginx.md](../docs/nginx.md#mise-en-place).

**Ne pas tester la connexion avant le certificat** : avec `BASE_URL` en `https://`, le cookie de session n'est envoyé qu'en HTTPS, la connexion Discord échoue donc en `http://`. Rôle de chaque réglage nginx, plusieurs sites, dépannage : [docs/nginx.md](../docs/nginx.md).

### 5. Première connexion
La base de prod démarre **vide** (rien n'est repris du dev). Dans cet ordre :
1. Le **propriétaire du serveur Discord** se connecte le premier (`https://<domaine>/gestion/`) : il est validé d'office avec tous les droits.
2. Dans Gestion → Grades, il crée les grades de l'entreprise, du sommet à la base : libellé, couleur, permissions, et le **rôle Discord** qui donne chaque grade (facultatif, mais c'est ce qui évite de valider chaque employé à la main).
3. Les employés se connectent : ceux qui portent un rôle lié à un grade entrent directement ; les autres attendent la validation (Gestion → Comptes).
4. Webhooks du bot (si l'entreprise utilise [roxwood-network-entreprise](https://github.com/poulpizar01/roxwood-network-entreprise)) : voir [docs/webhooks.md](../docs/webhooks.md).

Le domaine n'est écrit nulle part dans les fichiers : `robots.txt`, `sitemap.xml` et les aperçus de partage le prennent dans `BASE_URL`.

### Au quotidien (dans le dossier du site)
- Mise à jour après un push sur `main` : `git pull && docker compose up -d --build` (les nouvelles migrations sont appliquées au démarrage), puis `docker image prune -f` pour effacer les anciennes images.
- Changer la configuration : modifier `.env`, puis `docker compose up -d`.
- Logs : `docker logs -f <SITE_ID>-app` (limités à 3 × 10 Mo par service, voir `compose.yaml`).
- Mémoire et processeur : chaque conteneur a un plafond (site 512 Mo et 1 processeur, base 256 Mo et 1 processeur, sauvegardes 128 Mo). `docker stats` montre la consommation réelle ; pour les ajuster, décommenter `APP_MEMORY`, `DB_MEMORY`… dans `.env`, puis `docker compose up -d`.
- État : `docker compose ps` — le site y apparaît `healthy` quand il répond et joint la base (contrôle toutes les 30 s sur `/healthz`). S'il reste `unhealthy` : `docker compose restart app` (Docker redémarre seul un conteneur arrêté, pas un conteneur malade).

Le `.env` contient `COMPOSE_FILE=compose.yaml` : les commandes ci-dessus ignorent ainsi les réglages de dev (`compose.override.yaml`).

### Revenir en arrière après une mise à jour ratée
Les migrations de la base ne s'annulent pas : revenir à un ancien commit ne suffit pas si la mise à jour en contenait une.
1. Revenir au code précédent : `git log --oneline`, puis `git checkout <commit>` et `docker compose up -d --build`.
2. Si la mise à jour contenait une migration (`server/prisma/migrations/`) : restaurer la dernière sauvegarde **antérieure** à la mise à jour (voir ci-dessous). Les écritures faites entre-temps sont perdues.
3. Une fois le problème corrigé sur `main` : `git checkout main && git pull && docker compose up -d --build`.

Faire une sauvegarde juste avant une mise à jour qui touche la base : `docker compose restart backup`.

### Sauvegardes de la base
Le service `backup` (dans `compose.yaml`) sauvegarde la base au démarrage puis toutes les 24 h, dans le dossier `backups/` du site sur la machine (7 jours conservés). C'est un dossier et non un volume Docker : il survit à un `docker compose down -v`. Les images n'y sont pas (elles sont sur le stockage d'images), les sessions non plus : après une restauration, chacun se reconnecte.

Une sauvegarde contient les données de l'entreprise et les identifiants Discord des employés : les fichiers ne sont lisibles que par le propriétaire du dossier `backups/`. Le dossier est créé à l'installation (`mkdir -m 700 backups`) : s'il a été créé par Docker, il appartient à root ; le rendre : `sudo chown -R $USER: backups && chmod 700 backups`.
- Sauvegarde immédiate : `docker compose restart backup`
- Restaurer (remplace le contenu actuel de la base) :
  ```bash
  docker compose stop app
  # 1. base vidée : une sauvegarde ne retire que ce qu'elle contient. Sans cette étape, une table créée depuis (par une
  #    migration, lors d'une mise à jour ratée) resterait en place et bloquerait le démarrage suivant (« already exists »).
  docker exec <SITE_ID>-db psql -U site -d site -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public AUTHORIZATION site_app'
  # 2. restauration, en une seule transaction : à la première erreur, rien n'est écrit (pas de base à moitié restaurée)
  gunzip -c backups/site-AAAA-MM-JJ_HHhMM.sql.gz | docker exec -i <SITE_ID>-db psql -U site_app -d site -v ON_ERROR_STOP=1 --single-transaction
  docker compose start app
  ```
  `-U site_app` et non `-U site` pour la restauration : les tables recréées doivent appartenir au compte du site. Restaurées par erreur avec `site`, le site ne peut plus les lire ; `docker compose up -d` (qui relance `db-roles`) les lui rend. Une sauvegarde en échec n'écrit aucun fichier et le dit dans `docker logs <SITE_ID>-backup` ; les copies précédentes sont alors gardées au-delà de 7 jours.
- Ces copies restent sur la même machine : elles protègent des erreurs de manipulation, **pas de la perte du serveur**. En garder une copie ailleurs, par exemple sur un stockage objet (S3, Backblaze B2, Scaleway…) avec [rclone](https://rclone.org), **chiffrée** (remote `crypt` par-dessus celui du stockage objet, mot de passe gardé ailleurs que sur le VPS) :
  ```bash
  # crontab -e : chaque nuit à 4 h, copie des sauvegardes du site hors du serveur (copy : n'efface rien là-bas)
  0 4 * * * rclone copy ~/<dossier-du-site>/backups sauvegardes:<SITE_ID>/ --max-age 48h >> ~/rclone-<SITE_ID>.log 2>&1
  ```
- Le `.env` contient les secrets (base, Discord, stockage, webhooks) : il doit rester lisible par vous seul (`chmod 600 .env` ; `ls -l .env` doit afficher `-rw-------`).

## Application Discord
Une par site.
1. https://discord.com/developers/applications → New Application (nom de l'entreprise)
2. OAuth2 → Client ID / Client Secret → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` dans `.env`
3. OAuth2 → Redirects → ajouter `https://<domaine>/auth/discord/callback`
4. `DISCORD_GUILD_ID` = ID du serveur Discord de l'entreprise (mode développeur → clic droit sur le serveur → Copier l'identifiant). Seuls ses membres peuvent se connecter.
5. Le **propriétaire du serveur Discord** est propriétaire du site : validé d'office, toutes les permissions quel que soit son grade (vérifié à chaque connexion).
6. Grades : Gestion → Grades. L'identifiant d'un rôle Discord se copie en mode développeur (Paramètres du serveur → Rôles → clic droit → Copier l'identifiant). Rôles et grades sont relus à chaque connexion (au plus tard 7 jours, durée d'une session).

## Images
- **Dev** : les images envoyées sont écrites dans `uploads/` à la racine du dépôt, sur le poste.
- **Prod** : `STORAGE_URL`, `STORAGE_TOKEN` et `STORAGE_PREFIX` (un par site) sont **obligatoires** pour envoyer des images : elles partent sur le service de stockage (CDN) et la base garde leur URL publique. Sans eux, le site fonctionne mais refuse tout envoi. Fonctionnement et contrat attendu du service : [docs/stockage.md](../docs/stockage.md).

Toutes les variables : [`.env.example`](../.env.example).
