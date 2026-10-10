# Dynasty 8 — installation sur le VPS FlashbackFA

Pour l'opérateur du VPS. Première mise en ligne de **https://dynasty8.fbfa.fr** : vitrine de l'agence immobilière et espace agents, aussi affiché dans l'ordinateur en jeu (FolkOS). Contact : la Direction de Dynasty 8.

## En deux mots

| | |
|---|---|
| Exécution | **Docker Compose** : `dynasty8-app` (site Node), `dynasty8-db` (PostgreSQL 17), `dynasty8-backup` (sauvegarde quotidienne) |
| Port local | `127.0.0.1:3010` (`HOST_PORT`) |
| Domaines | `dynasty8.fbfa.fr` (site) et `carte.dynasty8.fbfa.fr` (WebMap du serveur, relayée par le site) |
| nginx | deux fichiers prêts dans [`deploy/nginx/`](nginx/) |
| Base | créée vide au premier démarrage (migrations appliquées par le site) |
| Images envoyées | stockage `storage.fbfa.fr`, jamais sur le disque du VPS |
| Dépôt | https://github.com/poulpizar01/dynasty8, branche `main` |

Guide générique du modèle sur lequel repose le site (mises à jour, journaux, sauvegardes, restauration) : [server/README.md](../server/README.md). Rôle de chaque réglage nginx : [docs/nginx.md](../docs/nginx.md).

## À confirmer avant de commencer

1. **Docker** sur le VPS (`docker compose version`). Sinon : `curl -fsSL https://get.docker.com | sudo sh`. Le compte qui lance les commandes doit être dans le groupe `docker` (équivalent root : à réserver au compte d'administration).
2. **DNS** : `dynasty8.fbfa.fr` et `carte.dynasty8.fbfa.fr` vers l'IP du VPS (`dig +short <domaine>`).
3. **Port 3010 libre** : `ss -ltnp | grep 3010` ne doit rien afficher (sinon prendre un autre port, et le changer dans le `.env` et les deux fichiers nginx).
4. **Hôte de l'ordinateur en jeu** (`FOLKOS_HOTE`) : `https://computer.game.fbfa.fr` ?
5. **Services de la machine joignables depuis le conteneur** : le validateur SSO `id` (et la WebMap, si elle tourne sur ce VPS). Dans le conteneur, `127.0.0.1` désigne le conteneur lui-même. Deux possibilités :
   - leur adresse publique en `https://`, s'ils en ont une ;
   - `http://host.docker.internal:<port>` (nom déclaré dans `compose.yaml`), à condition que le service écoute aussi sur l'adresse du pont Docker (`ip -4 addr show docker0`, en général `172.17.0.1`) et que le pare-feu laisse passer `172.16.0.0/12` vers ce port.
6. **`/etc/nginx/snippets/deny-hidden.conf`** : les fichiers nginx l'incluent. S'il n'existe pas sur la machine, le créer avec :
   ```nginx
   location ~ /\.(?!well-known/) { return 404; }
   ```

## Le fichier `.env`

Modèle commenté : [`.env.example`](../.env.example), à copier en `.env`. Valeurs pour Dynasty 8 :

| Variable | Valeur | Qui la fournit |
|---|---|---|
| `COMPOSE_FILE`, `SITE_ID`, `HOST_PORT` | `compose.yaml`, `dynasty8`, `3010` | — |
| `BASE_URL` | `https://dynasty8.fbfa.fr` | — |
| `SESSION_SECRET`, `POSTGRES_PASSWORD` | `openssl rand -hex 32` chacun ; `POSTGRES_PASSWORD` ne se change plus une fois la base créée | vous |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | application Discord RoxwoodLegal (`1546523997980852294`) | Direction de Dynasty 8 |
| `DISCORD_BOT_TOKEN` | jeton du bot de l'application RoxwoodLegal (onglet Bot → Reset Token), invité sur le serveur de Dynasty 8 sans aucune permission : la page Grades propose alors les rôles Discord par leur nom. Facultatif | vous |
| `DISCORD_GUILD_ID` | ID du serveur Discord de Dynasty 8 : seuls ses membres peuvent se connecter, son propriétaire a tous les droits sur le site | Direction de Dynasty 8 |
| `STORAGE_URL`, `STORAGE_TOKEN`, `STORAGE_PREFIX` | `https://storage.fbfa.fr`, jeton du stockage, `dynasty8/` | vous (jeton) |
| `BOT_WEBHOOK_SECRETS` | secret de l'abonnement « Candidatures » du bot Discord (étape 5) | Dynasty 8, depuis le bot |
| `FOLKOS_HOTE` | hôte de l'ordinateur en jeu (point 4) | vous |
| `FOLKOS_CADRES` | `https://*.fbfa.fr https://fbfa.fr` : autres pages FlashbackFA autorisées à afficher le site | — |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | validateur `id` **vu depuis le conteneur** (point 5), identifiants du site dans le broker `access` | vous |
| `STATS_BOT_SECRET` | `openssl rand -hex 32` ; à transmettre en privé à qui programme le bot de ventes | vous |
| `WEBMAP_HOTE` | `carte.dynasty8.fbfa.fr` (sous-domaine de la carte) | — |

Les **liens** ne se règlent pas dans le `.env` : adresse de la WebMap, Google Sheets du tableur, registre, Discord de l'agence, boutique VIP, partenaire décoration, salon des services et réglages de l'agenda se renseignent après l'installation dans l'espace agents, onglet **Paramètres** (permission « Paramètres du site »). L'adresse de la WebMap doit être publique, en https : le site refuse une adresse du serveur lui-même ou d'un réseau privé.

Le site **refuse de démarrer** sur un réglage incomplet ou mal formé, et dit lequel dans `docker logs dynasty8-app`. Les réglages facultatifs (FolkOS, bots, Google Sheets, WebMap) peuvent rester vides au premier démarrage et être remplis ensuite (`docker compose up -d` après chaque modification du `.env`).

## 1. Installer

```bash
sudo install -d -o $USER -g $USER /opt/dynasty8
git clone -b main https://github.com/poulpizar01/dynasty8 /opt/dynasty8
cd /opt/dynasty8
cp .env.example .env && chmod 600 .env
mkdir -m 700 backups
nano .env
docker compose up -d --build
```

Vérifier :
```bash
docker compose ps               # app, db et backup « Up », db « healthy », puis app « healthy » (1 à 2 min)
docker logs dynasty8-app        # se termine par « Dynasty 8 en écoute sur le port 3000 (https://dynasty8.fbfa.fr) »
curl -s http://127.0.0.1:3010/healthz
```

## 2. nginx et certificats

Pour chacun des deux fichiers de [`deploy/nginx/`](nginx/) (`dynasty8.fbfa.fr.conf`, puis `carte.dynasty8.fbfa.fr.conf`). nginx refuse un bloc HTTPS dont le certificat n'existe pas : il est ajouté après le certificat.

```bash
D=dynasty8.fbfa.fr              # puis D=carte.dynasty8.fbfa.fr
sudo cp deploy/nginx/$D.conf /etc/nginx/sites-available/
sudo nano /etc/nginx/sites-available/$D.conf     # retirer tout ce qui suit « # --- bloc HTTPS » (le garder de côté)
sudo ln -s /etc/nginx/sites-available/$D.conf /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d $D
sudo nano /etc/nginx/sites-available/$D.conf     # remettre le bloc HTTPS
sudo nginx -t && sudo systemctl reload nginx
```

Le certificat se renouvelle seul (`sudo certbot renew --dry-run` pour vérifier). **Ne pas tester la connexion avant le certificat** : le cookie de session n'est envoyé qu'en HTTPS.

Dans les fichiers, ne jamais ajouter `X-Frame-Options` ni `Content-Security-Policy` : le site pose lui-même ceux qui permettent son affichage dans l'ordinateur en jeu, et un en-tête ajouté par nginx donnerait une page blanche en jeu.

## 3. Application Discord

Dans l'application RoxwoodLegal (portail développeur → OAuth2 → Redirects), ajouter `https://dynasty8.fbfa.fr/auth/discord/callback`, à l'identique.

## 4. Première connexion (avec la Direction de Dynasty 8)

1. Le **propriétaire du serveur Discord** de Dynasty 8 se connecte le premier : https://dynasty8.fbfa.fr/gestion/. Il a tous les droits.
2. Dans **Gestion → Grades**, il crée les grades de l'agence et lie chacun à son **rôle Discord**.
3. Les agents se connectent par Discord : ceux qui portent un rôle lié à un grade entrent directement, les autres attendent d'être validés (Gestion → Comptes).
4. La connexion « IG » dans l'ordinateur en jeu fonctionne pour tout agent qui s'est connecté par Discord depuis moins de 30 jours (règle voulue : un agent parti du serveur Discord perd aussi l'accès en jeu).

## 5. Bots et ordinateur en jeu

- **Bot Discord, candidatures** : dans le salon panneau du bot, Monitoring → Ajouter un webhook, type **Candidatures** (`recruitment.updated`), URL `https://dynasty8.fbfa.fr/webhooks/bot`. Le secret, affiché une seule fois, va dans `BOT_WEBHOOK_SECRETS`, puis `docker compose up -d`.
- **Bot de ventes** : `POST https://dynasty8.fbfa.fr/api/stats/ventes`, avec l'en-tête `Authorization: Bearer <STATS_BOT_SECRET>`.
- **Broker `access` (FolkOS)** : adresse du SSO à déclarer, `https://dynasty8.fbfa.fr/auth/folkos` (slug suggéré : `dynasty8`).

## 6. Vérifications

- https://dynasty8.fbfa.fr : la vitrine s'affiche ; le lien WebMap ouvre https://carte.dynasty8.fbfa.fr. Une erreur `502` sur la carte vient en général de `WEBMAP_ORIGIN` injoignable depuis le conteneur (point 5).
- Connexion Discord, puis une page de l'espace agents.
- Envoi d'une photo sur une annonce. Un refus « L'envoi d'images n'est pas encore configuré » vient de `STORAGE_URL` ou `STORAGE_TOKEN`.
- Dans l'ordinateur en jeu : le site s'affiche et « Se connecter IG » fonctionne. Une page blanche vient presque toujours de `FOLKOS_HOTE` ou `FOLKOS_CADRES`.
- `docker logs dynasty8-backup` : une première sauvegarde a été écrite dans `backups/`.

## Au quotidien

Dans `/opt/dynasty8` :
- mise à jour : `git pull && docker compose up -d --build`, puis `docker image prune -f` ;
- journaux : `docker logs -f dynasty8-app` ;
- état : `docker compose ps` ;
- sauvegardes : `backups/`, une par jour, 7 jours gardés. Restauration et copie hors du serveur : [server/README.md](../server/README.md#sauvegardes-de-la-base).
