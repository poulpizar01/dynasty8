# Dynasty 8 — nouvelle version : installation et bascule sur le VPS FlashbackFA

Pour l'opérateur du VPS. À lire en entier avant de commencer. Contact : Paul (Dynasty 8).

Le site **https://dynasty8.fbfa.fr** change de version : même adresse, même contenu pour les visiteurs et les agents, mais une autre façon de tourner sur la machine. L'installation se fait **à côté** de l'ancienne version, sans coupure ; seule la bascule finale coupe le site, une vingtaine de minutes.

## Ce qui change

| | Ancienne version | Nouvelle version |
|---|---|---|
| Exécution | service systemd `dynasty8-api`, Node sur la machine | **Docker Compose** : conteneurs `dynasty8-app` (site), `dynasty8-db` (PostgreSQL 17), `dynasty8-backup` (sauvegarde quotidienne) |
| Base | PostgreSQL de la machine, base `dynasty8` | PostgreSQL dans son conteneur ; les données sont reprises une fois, par un script |
| Schéma | `schema.postgres.sql` appliqué à la main | migrations appliquées au démarrage du site |
| Port local | `127.0.0.1:3010` | `127.0.0.1:3011` (les deux tournent en même temps pendant l'installation) |
| Dossier | `/opt/dynasty8` | un nouveau dossier, par exemple `/opt/dynasty8-site` |
| nginx | `/etc/nginx/sites-available/dynasty8` | `dynasty8.fbfa.fr.conf`, plus `carte.dynasty8.fbfa.fr.conf` pour la WebMap |
| WebMap | relayée sous `/api/carte` | relayée sur son propre sous-domaine, **carte.dynasty8.fbfa.fr** (DNS et certificat à créer) |

> **Ne plus faire `git pull` dans `/opt/dynasty8`.** La branche `main` du dépôt contient désormais la nouvelle version : tirée dans l'ancien dossier, elle arrêterait l'ancien site au prochain redémarrage. L'ancien dossier reste tel quel jusqu'au nettoyage final.

Guide générique du modèle sur lequel repose le site, pour le quotidien (mises à jour, journaux, sauvegardes, restauration) : [server/README.md](../server/README.md). Rôle de chaque réglage nginx : [docs/nginx.md](../docs/nginx.md).

## À confirmer avant de commencer

1. **Docker** sur le VPS (`docker compose version`). Sinon : `curl -fsSL https://get.docker.com | sudo sh`. Le compte qui lance les commandes doit être dans le groupe `docker` (équivalent root : à réserver au compte d'administration, pas forcément à `dev`).
2. **DNS** : un enregistrement `carte.dynasty8.fbfa.fr` vers l'IP du VPS (`dig +short carte.dynasty8.fbfa.fr`).
3. **Port 3011 libre** : `ss -ltnp | grep 3011` ne doit rien afficher (sinon prendre un autre port et le changer dans le `.env` et les deux fichiers nginx).
4. **Hôte de l'ordinateur en jeu** (`FOLKOS_HOTE`) : `https://computer.game.fbfa.fr` ?
5. **Services de la machine joignables depuis le conteneur** : le validateur SSO `id` (et la WebMap, si elle tourne sur ce VPS). Le site ne tourne plus sur la machine : `127.0.0.1` désigne désormais le conteneur lui-même. Deux possibilités :
   - leur adresse publique en `https://`, si elles en ont une ;
   - `http://host.docker.internal:<port>` (nom déjà déclaré dans `compose.yaml`), à condition que le service écoute aussi sur l'adresse du pont Docker (`ip -4 addr show docker0`, en général `172.17.0.1`) et que le pare-feu laisse passer `172.16.0.0/12` vers ce port.
6. **`/etc/nginx/snippets/deny-hidden.conf`** : les fichiers nginx l'incluent. S'il n'existe pas sur la machine, le créer avec :
   ```nginx
   location ~ /\.(?!well-known/) { return 404; }
   ```

## Les secrets à réunir

Le `.env` de la nouvelle version reprend la plupart des valeurs de l'ancien (`/opt/dynasty8/.env`). Correspondance :

| Nouvelle variable | Valeur |
|---|---|
| `COMPOSE_FILE`, `SITE_ID`, `HOST_PORT` | `compose.yaml`, `dynasty8`, `3011` |
| `BASE_URL` | `https://dynasty8.fbfa.fr` |
| `SESSION_SECRET`, `POSTGRES_PASSWORD` | **nouveaux** : `openssl rand -hex 32` chacun. `POSTGRES_PASSWORD` ne se change plus une fois la base créée |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | ceux de l'ancien `.env` (application RoxwoodLegal, `1546523997980852294`) |
| `DISCORD_GUILD_ID` | **nouveau** : l'ID du serveur Discord de Dynasty 8 (Paul). Seuls ses membres peuvent se connecter, et son propriétaire a tous les droits sur le site |
| `STORAGE_URL` | `https://storage.fbfa.fr` |
| `STORAGE_TOKEN` | ancien `FBFA_STORAGE_TOKEN` |
| `STORAGE_PREFIX` | `dynasty8/` (même dossier qu'avant ; les nouveaux fichiers ont des noms à eux) |
| `BOT_WEBHOOK_SECRETS` | **nouveau**, créé au moment de la bascule (étape 3.5) ; remplace `RECRUTEMENT_WEBHOOK_SECRET` |
| `FOLKOS_HOTE` | l'hôte de l'ordinateur en jeu (point 4 ci-dessus) |
| `FOLKOS_CADRES` | `https://*.fbfa.fr https://fbfa.fr` (les pages qui pouvaient déjà encadrer le site) |
| `FOLKOS_ID_BASE` | adresse du validateur `id` **vue depuis le conteneur** (point 5) |
| `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | ceux de l'ancien `.env` |
| `STATS_BOT_SECRET` | celui de l'ancien `.env` (le bot de ventes ne change rien) |
| `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_GID`, `COHERENCES_SHEET_URL` | ceux de l'ancien `.env` |
| `WEBMAP_ORIGIN` | celui de l'ancien `.env`, **vu depuis le conteneur** (point 5) |
| `WEBMAP_HOTE` | `carte.dynasty8.fbfa.fr` |

Disparaissent : `DATABASE_URL`, `APP_DB_USER`, `APP_DB_PASSWORD` (la base est dans Docker), `DISCORD_REDIRECT_URI` (déduite de `BASE_URL`), `COOKIES_HTTP`, `ORIGINES_AUTORISEES`, `PGSSL`, `DB_SCHEMA_AUTO`, tous les `FBFA_*` sauf le jeton.

Le site **refuse de démarrer** sur un réglage incomplet ou mal formé, et dit lequel dans `docker logs dynasty8-app`.

## 1. Installer, sans couper l'ancien site

```bash
sudo install -d -o $USER -g $USER /opt/dynasty8-site
git clone -b main https://github.com/poulpizar01/dynasty8 /opt/dynasty8-site
cd /opt/dynasty8-site
cp .env.example .env && chmod 600 .env
mkdir -m 700 backups
nano .env                       # tableau ci-dessus ; BOT_WEBHOOK_SECRETS reste vide pour l'instant
docker compose up -d --build
```

Vérifier :
```bash
docker compose ps               # app, db et backup « Up », db « healthy », puis app « healthy » (1 à 2 min)
docker logs dynasty8-app        # se termine par « Dynasty 8 en écoute sur le port 3000 (https://dynasty8.fbfa.fr) »
curl -s http://127.0.0.1:3011/healthz
```

Le nouveau site n'est encore joignable par personne (nginx envoie toujours vers l'ancien) : c'est voulu. La reprise exige une base où **personne ne s'est encore connecté**.

**Discord** : dans l'application RoxwoodLegal (portail développeur → OAuth2 → Redirects), **ajouter** `https://dynasty8.fbfa.fr/auth/discord/callback`, sans retirer l'ancienne (`…/api/auth/discord/callback`), qui sert jusqu'à la bascule et en cas de retour en arrière.

## 2. Sous-domaine de la WebMap, sans couper l'ancien site

Fichier prêt : [`deploy/nginx/carte.dynasty8.fbfa.fr.conf`](nginx/carte.dynasty8.fbfa.fr.conf). nginx refuse un bloc HTTPS dont le certificat n'existe pas : on l'installe d'abord sans ce bloc.

```bash
sudo cp deploy/nginx/carte.dynasty8.fbfa.fr.conf /etc/nginx/sites-available/
sudo nano /etc/nginx/sites-available/carte.dynasty8.fbfa.fr.conf   # retirer tout ce qui suit « # --- bloc HTTPS » (le garder de côté)
sudo ln -s /etc/nginx/sites-available/carte.dynasty8.fbfa.fr.conf /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d carte.dynasty8.fbfa.fr
sudo nano /etc/nginx/sites-available/carte.dynasty8.fbfa.fr.conf   # remettre le bloc HTTPS
sudo nginx -t && sudo systemctl reload nginx
```

Contrôle : https://carte.dynasty8.fbfa.fr affiche la WebMap. Une erreur `502` à cet endroit vient en général de `WEBMAP_ORIGIN` injoignable depuis le conteneur (point 5).

## 3. Bascule (coupure d'environ 20 minutes)

### 3.1 Arrêter l'ancien site
```bash
sudo systemctl stop dynasty8-api        # plus aucune écriture dans l'ancienne base
```

### 3.2 Reprendre les données
Suivre [`deploy/REPRISE.md`](REPRISE.md) : sauvegarde de l'ancienne base (`pg_dump`), restauration à côté de la nouvelle, essai, puis reprise. **Garder le compte rendu** affiché par la reprise et l'envoyer à Paul : il liste les photos perdues à remettre.

### 3.3 Faire pointer le domaine vers la nouvelle version
Fichier prêt : [`deploy/nginx/dynasty8.fbfa.fr.conf`](nginx/dynasty8.fbfa.fr.conf). Le certificat de `dynasty8.fbfa.fr` existe déjà : le fichier s'installe en entier.
```bash
sudo ls /etc/letsencrypt/live/dynasty8.fbfa.fr/     # fullchain.pem et privkey.pem doivent y être
sudo cp deploy/nginx/dynasty8.fbfa.fr.conf /etc/nginx/sites-available/
sudo rm /etc/nginx/sites-enabled/dynasty8           # lien de l'ancienne configuration (le fichier reste dans sites-available)
sudo ln -s /etc/nginx/sites-available/dynasty8.fbfa.fr.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run                        # le renouvellement passe par le nouveau bloc HTTP (défi ACME)
```

### 3.4 Première connexion (avec Paul)
1. Le **propriétaire du serveur Discord** de Dynasty 8 se connecte le premier : https://dynasty8.fbfa.fr/gestion/. Il a tous les droits.
2. Dans **Gestion → Grades**, il lie chaque grade repris à son **rôle Discord**. Tant qu'un grade n'a pas de rôle, ses agents gardent l'accès qu'ils avaient (comptes repris), mais un nouvel arrivant attend d'être validé à la main. À l'inverse, dès qu'un grade est lié à un rôle, un agent qui n'a pas ce rôle sur Discord perd le grade à sa connexion suivante : vérifier les rôles Discord des agents avant de lier.
3. Les agents se reconnectent par Discord, comme avant. La connexion « IG » dans l'ordinateur en jeu fonctionne pour tout agent qui s'est connecté par Discord depuis moins de 30 jours (règle volontaire : un agent parti du serveur Discord perd ainsi aussi l'accès en jeu).

### 3.5 Bot Discord (candidatures)
L'abonnement change d'adresse et de mode de signature. Dans le salon panneau du bot : **Monitoring** →
- retirer l'abonnement « Candidatures » qui vise `…/api/rh/bot/candidatures` ;
- **Ajouter un webhook** : type **Candidatures** (`recruitment.updated`), URL `https://dynasty8.fbfa.fr/webhooks/bot` ;
- copier le secret affiché (une seule fois) dans `BOT_WEBHOOK_SECRETS` du `.env`, puis `docker compose up -d`.

Le bot de ventes, lui, ne change rien : même adresse (`/api/stats/ventes`), même clé.

### 3.6 Ordinateur en jeu (broker `access`)
L'adresse du SSO devient `https://dynasty8.fbfa.fr/auth/folkos`. L'ancienne (`/api/folkos`) y renvoie : rien ne casse à la bascule, la déclaration du broker peut être mise à jour plus tard.

### 3.7 Vérifications
- https://dynasty8.fbfa.fr : la vitrine et le catalogue s'affichent, avec leurs photos ; le lien WebMap ouvre la carte.
- Connexion Discord, puis une page de l'espace agents (Statistiques, Ressources humaines).
- Dans l'ordinateur en jeu : le site s'affiche et « Se connecter IG » fonctionne. Une page blanche vient presque toujours de `FOLKOS_HOTE` ou `FOLKOS_CADRES`.
- Envoi d'une photo sur une annonce. Un refus « L'envoi d'images n'est pas encore configuré » vient de `STORAGE_URL` ou `STORAGE_TOKEN`.
- `docker logs dynasty8-backup` : une première sauvegarde a été écrite dans `backups/`.

## Retour en arrière (si la bascule échoue)

L'ancienne base n'a pas été modifiée par la reprise. Pour revenir à l'ancien site :
```bash
sudo rm /etc/nginx/sites-enabled/dynasty8.fbfa.fr.conf
sudo ln -s /etc/nginx/sites-available/dynasty8 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl start dynasty8-api
```
Puis recréer dans le bot l'abonnement « Candidatures » vers `…/api/rh/bot/candidatures` (et son secret dans l'ancien `.env`). Ce qui a été saisi sur la nouvelle version entre-temps est perdu. Pour retenter plus tard : `docker compose down -v` dans `/opt/dynasty8-site` (efface la nouvelle base), puis reprendre à l'étape 1 (`docker compose up -d --build`).

## Nettoyage, une semaine après une bascule réussie

```bash
sudo systemctl disable dynasty8-api
sudo rm /etc/systemd/system/dynasty8-api.service && sudo systemctl daemon-reload
sudo rm /etc/nginx/sites-available/dynasty8
# ancienne base : une dernière sauvegarde, gardée en lieu sûr, puis
sudo -u postgres dropdb dynasty8
sudo rm -r /opt/dynasty8                          # ancien dossier, avec son .env
```
Dans RoxwoodLegal, retirer la redirection `…/api/auth/discord/callback`.

Les anciennes photos restent sur `storage.fbfa.fr` sous leur adresse : le nouveau site les affiche, mais ne les supprime pas quand un agent les retire d'une annonce (il ne gère que les fichiers qu'il a lui-même envoyés). Un ménage dans `dynasty8/` sur le stockage est possible plus tard, avec la liste des photos encore utilisées.

## Au quotidien

Dans `/opt/dynasty8-site` :
- mise à jour : `git pull && docker compose up -d --build`, puis `docker image prune -f` ;
- journaux : `docker logs -f dynasty8-app` ;
- état : `docker compose ps` ;
- sauvegardes : `backups/`, une par jour, 7 jours gardés. Restauration et copie hors du serveur : [server/README.md](../server/README.md#sauvegardes-de-la-base).
