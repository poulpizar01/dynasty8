# Dynasty 8 — déploiement systemd + nginx (sans Docker)

Pour un VPS où les applications tournent sous un compte Linux dédié (`dev`),
derrière nginx, avec PostgreSQL installé sur la machine. Les deux autres packs
restent disponibles : `../vps/` (Docker Compose) et `../operateur/` (serveur
FlashbackFA).

Tout passe par `deploy/systemd/deploy.sh`, qui **n'appelle jamais `sudo`** :
chaque commande indique si elle se lance avec le compte applicatif ou en root,
et refuse de s'exécuter sous la mauvaise identité.

| | Compte `dev` | root |
|---|---|---|
| Code, dépendances, migrations | `git pull`, `npm ci`, `npm run migrate` | — |
| Service systemd | — | `systemctl` / `journalctl`, installation de l'unité |

---

## Prérequis serveur
- Debian/Ubuntu avec systemd et nginx ;
- **Node.js 22+ installé à l'échelle du système** (`/usr/bin/node`), pas via
  nvm sous `/root` : un binaire dans `/root/.nvm/...` n'est pas lisible par
  `dev` et le service échouerait avec `status=203/EXEC` ;
- PostgreSQL 14+ (17 conseillé) ;
- `git`.

Vérification rapide (en root) : `/usr/bin/node --version` doit afficher `v22`
ou plus, et `runuser -u dev -- /usr/bin/node --version` doit fonctionner.

## Utilisateur Linux
Le service tourne sous un compte **sans privilège**, jamais root.

```bash
# root
useradd --create-home --shell /bin/bash dev        # s'il n'existe pas déjà
install -d -o dev -g dev /opt/dynasty8
```

Le compte utilisé est explicite (`DEPLOY_USER`) : le script refuse `root`,
refuse un compte d'uid 0, refuse un compte inexistant, et ne retombe jamais
sur l'utilisateur courant.

## Installation

```bash
# dev
git clone <URL-du-depot> /opt/dynasty8
cd /opt/dynasty8
npm ci --omit=dev
cp deploy/systemd/.env.example .env
chmod 600 .env
nano .env                                    # remplir les valeurs
```

Réglages du déploiement (valeurs par défaut entre parenthèses) :
`DEPLOY_USER` (`dev`), `NODE_BIN` (`/usr/bin/node`), `SERVICE_NAME`
(`dynasty8-api`), `APP_DIR` (racine du dépôt), `ENV_FILE` (`$APP_DIR/.env`),
`PORT` (`3010`). Ils se passent en variables d'environnement, ou se fixent une
fois pour toutes dans `deploy/systemd/deploy.conf` (ignoré par Git) :

```bash
# deploy/systemd/deploy.conf
DEPLOY_USER=dev
NODE_BIN=/usr/bin/node
PORT=3010
```

## Configuration `.env`
Modèle commenté : [`.env.example`](.env.example). Variables indispensables :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | compte PostgreSQL **applicatif** (droits restreints) |
| `DATABASE_URL_ADMIN` | compte **administrateur**, utilisé seulement par les migrations |
| `APP_DB_USER`, `APP_DB_PASSWORD` | compte applicatif créé/mis à jour par la migration |
| `SESSION_SECRET` | signature des cookies de session (`openssl rand -hex 32`) |
| `DISCORD_CLIENT_ID` | `1546523997980852294` (application **RoxwoodLegal**) |
| `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | OAuth de l'espace agents |
| `STATS_BOT_SECRET` | clé du bot de ventes (`POST /api/stats/ventes`) |
| `ROXWOOD_WEBHOOK_SECRETS` | webhooks du bot Roxwood Network Entreprise |
| `FOLKOS_*` | SSO « Se connecter IG » |
| `FBFA_STORAGE_TOKEN` | stockage externe des photos |

`PORT`, `NODE_ENV` et `DB_SCHEMA_AUTO` sont imposés par l'unité systemd : ne
pas les mettre dans `.env`.

## Permissions
```bash
# dev
chmod 600 .env
./deploy/systemd/deploy.sh verifier
```
Le contrôle refuse de continuer si `.env` est lisible par d'autres comptes,
s'il appartient à quelqu'un d'autre que `dev`, s'il est suivi par Git, ou s'il
manque une variable essentielle. **Aucune valeur de secret n'est affichée.**

## PostgreSQL
Deux comptes, deux usages (voir `scripts/appliquer-schema.js`) :

```bash
# root (une fois)
su - postgres -c "createuser --pwprompt dynasty8_admin"
su - postgres -c "createdb --owner dynasty8_admin dynasty8"
```

Le compte **applicatif** n'est pas à créer à la main : la migration s'en charge
à partir de `APP_DB_USER` / `APP_DB_PASSWORD`, avec uniquement `SELECT`,
`INSERT`, `UPDATE`, `DELETE` et `USAGE` sur les séquences — jamais `CREATE`.

## Migrations
Le serveur **ne crée plus aucune table au démarrage** : il vérifie le schéma et
refuse de démarrer s'il est incomplet.

```bash
# dev — à chaque fois que le schéma change
npm run migrate            # applique schema.postgres.sql + droits du compte applicatif
npm run migrate:verifier   # contrôle seul, n'écrit rien
```

## Installation systemd
```bash
# dev : vérifier et relire l'unité qui sera installée
./deploy/systemd/deploy.sh verifier
./deploy/systemd/deploy.sh unite

# root : installer, activer
cd /opt/dynasty8 && DEPLOY_USER=dev ./deploy/systemd/deploy.sh installer
systemctl start dynasty8-api
systemctl status dynasty8-api
```
L'unité générée fixe `User=dev`, `WorkingDirectory`, `EnvironmentFile`, un
`ExecStart` en chemin absolu, `Restart=always` / `RestartSec=5`, et un
durcissement (`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`,
`ReadWritePaths` limité à `rapports/`). Modèle : `dynasty8-api.service.modele`.

## Configuration nginx
nginx écoute en 80/443 et proxifie **tout** vers Node (pages comprises), sur le
port local `3010` :

```nginx
server {
    listen 443 ssl http2;
    server_name dynasty8.exemple.fr;
    # ssl_certificate ... (certbot --nginx)

    client_max_body_size 32m;   # annonces contenant encore des photos base64

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```
Fichier prêt à copier : [`../vps/nginx-dynasty8.conf`](../vps/nginx-dynasty8.conf)
(même port). L'application est en `trust proxy` et utilise `X-Forwarded-Proto`
et `X-Forwarded-Host` pour reconstruire ses URL (retour OAuth, cookies).
**Ne jamais** ajouter `X-Frame-Options` ni écraser `Content-Security-Policy` :
l'app pose elle-même `frame-ancestors` pour l'ordinateur en jeu.

## Premier démarrage
```bash
# dev
npm run migrate
./deploy/systemd/deploy.sh verifier
# root
systemctl start dynasty8-api && systemctl status dynasty8-api
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3010/       # 200 attendu
```

## Mise à jour
```bash
# dev
cd /opt/dynasty8
git pull
npm ci --omit=dev
npm run migrate          # seulement si le schéma a changé

# root
systemctl restart dynasty8-api
```
Équivalent côté `dev` : `./deploy/systemd/deploy.sh maj` (elle rappelle la
commande root à lancer ensuite).

## Logs
```bash
# root
journalctl -u dynasty8-api -f             # en direct
journalctl -u dynasty8-api -n 200         # dernières lignes
journalctl -u dynasty8-api --since today
```
Lignes utiles : `Schéma PostgreSQL vérifié`, `Dynasty 8 en écoute sur le port`,
`[medias]` (nettoyage des photos), `[sync-sheet]`, `[erreur-api]`.

## Rollback
```bash
# dev
git log --oneline -5
git checkout <commit-precedent>
npm ci --omit=dev
# root
systemctl restart dynasty8-api
```
Les migrations étant additives, revenir en arrière sur le code ne casse pas le
schéma. Pour annuler une migration, restaurer la sauvegarde correspondante.

## Backup / restauration
```bash
# sauvegarde, avant toute migration
pg_dump -Fc -U dynasty8_admin -h 127.0.0.1 dynasty8 > ~/sauvegardes/dynasty8_$(date +%F).dump

# restauration
pg_restore -U dynasty8_admin -h 127.0.0.1 -d dynasty8 --clean --if-exists ~/sauvegardes/dynasty8_AAAA-MM-JJ.dump
npm run migrate    # pg_restore recrée les tables : réaccorde les droits du compte applicatif
```
Les dumps contiennent des données réelles (membres, ventes, noms RP) : les
garder **hors du dépôt**, dans un emplacement privé et sauvegardé.

## Sécurité
- service sous `dev`, jamais root ; `.env` en `chmod 600` appartenant à `dev` ;
- compte PostgreSQL applicatif sans droit de création ;
- secrets jamais commités (`.env`, `*.dump`, `*.sql.gz`, `*.backup` ignorés) ;
- l'historique Git contient encore d'anciens secrets : voir
  `scripts/purger-historique-secrets.sh`, et changer les secrets concernés ;
- PostgreSQL et Node n'écoutent que sur `127.0.0.1` : seul nginx est exposé.

## Discord OAuth
Application **RoxwoodLegal** — Application/Client ID `1546523997980852294`.
Dans le portail développeur Discord, onglet OAuth2 :
1. ajouter l'URL de redirection **exacte** du site, par exemple
   `https://dynasty8.exemple.fr/api/auth/discord/callback` ;
2. reporter la même valeur dans `DISCORD_REDIRECT_URI` ;
3. générer un *Client Secret*, à mettre dans `DISCORD_CLIENT_SECRET`
   (jamais dans le dépôt) ;
4. portée utilisée par le site : `identify` uniquement.

Une redirection non déclarée donne `invalid redirect_uri` côté Discord ; un
`DISCORD_CLIENT_ID` erroné affiche « La connexion Discord n'est pas encore
configurée ».
