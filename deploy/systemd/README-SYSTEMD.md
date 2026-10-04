# Dynasty 8 — déploiement systemd + nginx (sans Docker)

Pour un VPS où les applications tournent sous un compte Linux dédié (`dev`),
derrière nginx, avec PostgreSQL installé sur la machine. Les deux autres packs
restent disponibles : `../vps/` (Docker Compose) et `../operateur/` (serveur
FlashbackFA).

Aucun script : tout passe par les outils du système (`systemctl`, `psql`,
`git`, `npm`). Chaque bloc de commandes indique s'il se lance avec le compte
applicatif ou en root.

| | Compte `dev` | root |
|---|---|---|
| Code, dépendances, schéma | `git pull`, `npm ci`, `psql` | — |
| Service systemd | — | installation de l'unité, `systemctl` / `journalctl` |

---

## Prérequis serveur
- Debian/Ubuntu avec systemd et nginx ;
- **Node.js 22+ installé à l'échelle du système** (`/usr/bin/node`), pas via
  nvm sous `/root` : un binaire dans `/root/.nvm/...` n'est pas lisible par
  `dev` et le service échouerait avec `status=203/EXEC` ;
- PostgreSQL 14+ (17 conseillé), avec son client `psql` ;
- `git`.

Vérification rapide (en root) : `/usr/bin/node --version` doit afficher `v22`
ou plus, et `runuser -u dev -- /usr/bin/node --version` doit fonctionner.

## Utilisateur Linux
Le service tourne sous un compte **sans privilège**, jamais root : c'est
l'unité systemd qui l'impose (`User=dev`), à chaque démarrage.

```bash
# root
useradd --create-home --shell /bin/bash dev        # s'il n'existe pas déjà
install -d -o dev -g dev /opt/dynasty8
```

## Installation du code
```bash
# dev
git clone <URL-du-depot> /opt/dynasty8
cd /opt/dynasty8
npm ci --omit=dev
cp deploy/systemd/.env.example .env
chmod 600 .env
nano .env                                    # remplir les valeurs
```

## Configuration `.env`
Modèle commenté : [`.env.example`](.env.example). Variables indispensables :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | compte PostgreSQL **applicatif** (droits restreints) — le seul que lit le site |
| `APP_DB_USER`, `APP_DB_PASSWORD` | ce même compte, créé/mis à jour par l'application du schéma |
| `SESSION_SECRET` | signature des cookies de session (`openssl rand -hex 32`) |
| `DISCORD_CLIENT_ID` | `1546523997980852294` (application **RoxwoodLegal**) |
| `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | OAuth de l'espace agents |
| `STATS_BOT_SECRET` | clé du bot de ventes (`POST /api/stats/ventes`) |
| `FOLKOS_*` | SSO « Se connecter IG » |
| `FBFA_STORAGE_TOKEN` | stockage externe des photos |

`PORT`, `NODE_ENV` et `DB_SCHEMA_AUTO` sont imposés par l'unité systemd : ne
pas les mettre dans `.env`. Mot de passe `APP_DB_PASSWORD` : lettres et
chiffres uniquement (il entre dans une URL et dans `PGOPTIONS`).

## Permissions du `.env`
```bash
# dev
stat -c '%a %U' .env       # attendu : « 600 dev »
git check-ignore .env      # attendu : « .env » (exclu de Git)
```
Tout autre mode que `600` (ou `400`), ou un autre propriétaire que `dev`, est à
corriger avant d'aller plus loin : le fichier contient tous les secrets.

## PostgreSQL
Deux comptes, deux usages :

```bash
# root (une fois)
su - postgres -c "createuser --createrole --pwprompt dynasty8_admin"   # --createrole : pour créer le compte du site
su - postgres -c "createdb --owner dynasty8_admin dynasty8"
```

Le compte **applicatif** n'est pas à créer à la main : le bloc final de
`schema.postgres.sql` s'en charge, avec uniquement `SELECT`, `INSERT`,
`UPDATE`, `DELETE` et `USAGE` sur les séquences — jamais `CREATE`.

## Application du schéma
Le serveur **ne crée aucune table au démarrage** : il vérifie le schéma et
refuse de démarrer s'il est incomplet. Le schéma s'applique avec `psql` et le
compte administrateur, qui demande son mot de passe. Le nom et le mot de passe
du compte applicatif lui sont transmis par `PGOPTIONS`, lus dans le `.env` :

```bash
# dev — à l'installation, à chaque changement du schéma, après une restauration
cd /opt/dynasty8
APP_DB_USER=$(grep -m1 '^APP_DB_USER=' .env | cut -d= -f2-)
APP_DB_PASSWORD=$(grep -m1 '^APP_DB_PASSWORD=' .env | cut -d= -f2-)
PGOPTIONS="-c dynasty8.compte_app=$APP_DB_USER -c dynasty8.mdp_app=$APP_DB_PASSWORD -c dynasty8.exiger_compte_app=on" \
  psql -h 127.0.0.1 -U dynasty8_admin -d dynasty8 -v ON_ERROR_STOP=1 --quiet -f schema.postgres.sql
```
Rejouable sans risque (tout est écrit « si ça n'existe pas déjà »). La commande
échoue si `APP_DB_USER` est vide, si le compte est à créer sans mot de passe,
ou si le compte applicatif peut encore créer des tables.

## Installation du service
L'unité [`dynasty8-api.service`](dynasty8-api.service) s'installe telle quelle
pour le cas standard (`dev`, `/opt/dynasty8`, `/usr/bin/node`). Si l'un de ces
points diffère, adapter les lignes `User`/`Group`, `WorkingDirectory`,
`EnvironmentFile` et `ExecStart` du fichier installé.

```bash
# root
install -m 644 /opt/dynasty8/deploy/systemd/dynasty8-api.service /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/dynasty8-api.service    # aucune ligne = aucune erreur
systemctl daemon-reload
systemctl enable --now dynasty8-api
systemctl status dynasty8-api
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3010/   # 200 attendu
```
L'unité fixe `User=dev`, `WorkingDirectory`, `EnvironmentFile`, un `ExecStart`
en chemin absolu, `Restart=always` / `RestartSec=5`, et un durcissement
(`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`…). L'application
n'écrivant jamais sur disque, aucun dossier ne lui est ouvert en écriture.

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

## Mise à jour
```bash
# dev
cd /opt/dynasty8
git pull
npm ci --omit=dev
# … puis la commande psql d'« Application du schéma », si le schéma a changé

# root
systemctl restart dynasty8-api
```
Si l'unité elle-même a changé dans le dépôt : la réinstaller (section
« Installation du service ») avant le `restart`.

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
Le schéma n'évoluant que par ajouts, revenir en arrière sur le code ne le casse
pas. Pour annuler une évolution du schéma, restaurer la sauvegarde
correspondante.

## Backup / restauration
```bash
# sauvegarde, avant toute évolution du schéma
pg_dump -Fc -U dynasty8_admin -h 127.0.0.1 dynasty8 > ~/sauvegardes/dynasty8_$(date +%F).dump

# restauration
pg_restore -U dynasty8_admin -h 127.0.0.1 -d dynasty8 --clean --if-exists ~/sauvegardes/dynasty8_AAAA-MM-JJ.dump
```
`pg_restore` recrée les tables et efface donc les droits du compte applicatif :
relancer ensuite la commande d'« Application du schéma ». Les dumps contiennent
des données réelles (membres, ventes, noms RP) : les garder **hors du dépôt**,
dans un emplacement privé et sauvegardé.

## Sécurité
- service sous `dev`, jamais root ; `.env` en `chmod 600` appartenant à `dev`,
  exclu de Git ;
- compte PostgreSQL applicatif sans droit de création ;
- secrets jamais commités (`.env`, `*.dump`, `*.sql.gz`, `*.backup` ignorés) ;
- l'historique Git a été purgé des anciens `.env` et dumps (sept. 2026) ;
  les secrets qu'ils contenaient restent à changer s'ils ne l'ont pas été ;
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
