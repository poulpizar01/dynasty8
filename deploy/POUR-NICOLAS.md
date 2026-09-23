# Dynasty 8 — hébergement sur le VPS FlashbackFA

Site public + espace agents de l'agence immobilière Dynasty 8, à servir sur
**https://dynasty8.fbfa.fr**, et à embarquer dans l'ordinateur en jeu (FolkOS).
Contact : Thomas / Paul (Dynasty 8).

Ce document est fait pour être lu de bout en bout avant la première
installation. Il suit la même organisation que `web-map-multipoints`, que vous
hébergez déjà : mêmes conventions de service, même port local, même séparation
entre commandes applicatives et commandes système.

---

## En deux mots

| | |
|---|---|
| Techno | Node.js 22 + Express, PostgreSQL 17, **pas de build** (HTML/CSS/JS natif) |
| Service | `dynasty8-api.service` |
| Port local | `127.0.0.1:3010` (réglable, `PORT`) |
| Compte Linux | `dev` (paramétrable, **jamais root**) |
| Reverse proxy | nginx, configuration fournie |
| Dépôt | `https://github.com/poulpizar01/dynasty8` (privé) |

Trois différences avec `web-map-multipoints`, toutes volontaires :

- **Aucune étape de build.** Le site est en JavaScript natif : `npm ci` suffit,
  il n'y a ni `pnpm`, ni `next build`, ni dossier `.next`.
- **Aucun `sudo` dans les scripts.** Chaque commande dit si elle se lance avec
  le compte applicatif ou en root, et refuse de s'exécuter sous la mauvaise
  identité plutôt que de deviner.
- **Deux comptes PostgreSQL.** Le site tourne avec un compte restreint qui ne
  peut pas créer de table ; seule la migration utilise le compte administrateur.

---

## Prérequis serveur

- Debian/Ubuntu avec systemd et nginx ;
- **Node.js 22+ installé à l'échelle du système** (`/usr/bin/node`). Un Node
  installé par nvm sous `/root` n'est pas lisible par `dev` : le service
  échouerait au démarrage avec `status=203/EXEC`. Le script refuse d'ailleurs
  un `NODE_BIN` situé sous `/root` ou dans un `.nvm` ;
- PostgreSQL 14+ (17 conseillé) ;
- `git`.

Contrôle rapide, en root :

```bash
/usr/bin/node --version                    # doit afficher v22 ou plus
runuser -u dev -- /usr/bin/node --version  # doit fonctionner aussi
```

## Utilisateur Linux

Le service tourne sous un compte sans privilège. Par défaut `dev` ; si vous
utilisez un autre compte, tout se règle avec `DEPLOY_USER`.

```bash
# root — seulement si le compte n'existe pas déjà
useradd --create-home --shell /bin/bash dev
install -d -o dev -g dev /opt/dynasty8
```

Le script refuse `root`, refuse un compte d'uid 0, refuse un compte inexistant,
et ne retombe jamais sur l'utilisateur courant.

## Installation

```bash
# dev
git clone https://github.com/poulpizar01/dynasty8 /opt/dynasty8
cd /opt/dynasty8
npm ci --omit=dev
cp deploy/systemd/.env.example .env
chmod 600 .env
nano .env                                   # voir la section suivante
./deploy/systemd/deploy.sh verifier         # contrôles, n'écrit rien

# root
cd /opt/dynasty8 && DEPLOY_USER=dev ./deploy/systemd/deploy.sh setup
systemctl start dynasty8-api
systemctl status dynasty8-api
```

`setup` (alias de `installer`) affiche l'utilisateur, le binaire Node, le port
et le fichier de secrets, puis demande confirmation avant d'écrire l'unité.

Réglages disponibles, en variables d'environnement ou dans
`deploy/systemd/deploy.conf` (ignoré par Git) : `DEPLOY_USER` (`dev`),
`NODE_BIN` (`/usr/bin/node`), `SERVICE_NAME` (`dynasty8-api`), `APP_DIR`,
`ENV_FILE`, `PORT` (`3010`).

## Fichier `.env`

Modèle commenté : `deploy/systemd/.env.example`. Il n'est **pas** dans le
dépôt : Paul vous le transmet par message privé, déjà rempli.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | compte PostgreSQL **applicatif** (droits restreints) |
| `DATABASE_URL_ADMIN` | compte **administrateur**, migrations uniquement |
| `APP_DB_USER`, `APP_DB_PASSWORD` | compte applicatif, créé par la migration |
| `SESSION_SECRET` | signature des cookies (`openssl rand -hex 32`) |
| `DISCORD_CLIENT_ID` | `1546523997980852294` (application « RoxwoodLegal ») |
| `DISCORD_CLIENT_SECRET` | secret OAuth de cette application |
| `DISCORD_REDIRECT_URI` | `https://dynasty8.fbfa.fr/api/auth/discord/callback` |
| `STATS_BOT_SECRET` | clé du bot de ventes (`POST /api/stats/ventes`) |
| `ROXWOOD_WEBHOOK_SECRETS` | webhooks du bot Roxwood Network Entreprise |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | SSO « Se connecter IG » |
| `FBFA_STORAGE_TOKEN` | stockage des photos sur `storage.fbfa.fr` |

`PORT`, `NODE_ENV` et `DB_SCHEMA_AUTO` sont imposés par l'unité systemd : ne
pas les mettre dans `.env`.

L'URL de redirection Discord doit être déclarée **à l'identique** dans
l'application RoxwoodLegal (portail développeur → OAuth2 → Redirects), sinon la
connexion échoue avec `invalid redirect_uri`.

## Permissions

```bash
# dev
chmod 600 .env
./deploy/systemd/deploy.sh verifier
```

Le contrôle refuse de continuer si `.env` est lisible par d'autres comptes,
s'il appartient à quelqu'un d'autre que `dev`, s'il est suivi par Git, ou s'il
manque une variable essentielle. Aucune valeur de secret n'est affichée, ni à
l'écran ni dans les journaux.

## Base de données

Deux comptes, deux usages :

| | Compte admin (`POSTGRES_USER`) | Compte applicatif (`APP_DB_USER`) |
|---|---|---|
| Utilisé par | la migration, à la demande | le site, en permanence |
| Droits | propriétaire de la base | `SELECT`, `INSERT`, `UPDATE`, `DELETE` + `USAGE` sur les séquences |
| Peut créer des tables | oui | **non** |

```bash
# root, une seule fois
su - postgres -c "createuser --pwprompt dynasty8_admin"
su - postgres -c "createdb --owner dynasty8_admin dynasty8"
```

Le compte applicatif n'est pas à créer à la main : la migration le crée à
partir de `APP_DB_USER` / `APP_DB_PASSWORD`, lui accorde les droits ci-dessus,
lui retire tout droit de création, puis vérifie qu'il ne peut effectivement
plus créer de table.

## Migrations

```bash
# dev — à chaque fois que le schéma change
npm run migrate            # applique le schéma + les droits
npm run migrate:verifier   # contrôle seul, n'écrit rien
```

Il n'y a **pas de registre de migrations** façon `_applied_migrations` : le
schéma de Dynasty 8 tient dans un seul fichier (`schema.postgres.sql`) écrit
entièrement en `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Le
rejouer est sans effet, et sans risque sur les données. C'est plus simple à
exploiter qu'une suite de fichiers numérotés, au prix de ne pas pouvoir
« défaire » une migration — d'où la sauvegarde avant chaque opération.

Au démarrage, le site **ne crée rien** : il vérifie que les tables et colonnes
attendues sont là et refuse de démarrer sinon, en indiquant la commande à
lancer. En cas d'oubli, le journal affiche :
`Démarrage refusé : schéma PostgreSQL incomplet (…)`.

## Service systemd

L'unité est générée à partir de `deploy/systemd/dynasty8-api.service.modele`,
avec les chemins réels de la machine. Pour la relire avant installation :

```bash
# dev
./deploy/systemd/deploy.sh unite
```

Elle fixe `User=dev`, `WorkingDirectory`, `EnvironmentFile`, un `ExecStart` en
chemin absolu (`/usr/bin/node /opt/dynasty8/server.js`), `Restart=always` /
`RestartSec=5`, et un durcissement compatible avec ce que le site écrit :
`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, et `ReadWritePaths`
limité à `/opt/dynasty8/rapports` (comptes rendus des scripts). Elle est
validée par `systemd-analyze verify`.

## nginx

Configuration prête à copier : `deploy/vps/nginx-dynasty8.conf`.

```bash
# root
cp /opt/dynasty8/deploy/vps/nginx-dynasty8.conf /etc/nginx/sites-available/dynasty8
ln -s /etc/nginx/sites-available/dynasty8 /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Trois points importants :

- transmettre `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`
  et `X-Real-IP` : le site reconstruit ses URL à partir de ces en-têtes (retour
  OAuth Discord, cookies de session) ;
- `client_max_body_size 32m` : une annonce contenant encore d'anciennes photos
  en base peut peser jusqu'à ~30 Mo à l'enregistrement. Le site refuse lui-même
  au-delà, avant de lire le corps de la requête ;
- **ne jamais ajouter `X-Frame-Options` ni écraser `Content-Security-Policy`.**
  Le site pose lui-même `frame-ancestors … nui://game …` sur chaque réponse,
  pour pouvoir s'afficher dans l'ordinateur en jeu. Un en-tête ajouté par le
  proxy donnerait une page blanche en jeu, sans message d'erreur.

Le domaine passe en HTTPS avec `certbot --nginx -d dynasty8.fbfa.fr` ; retirez
ensuite `COOKIES_HTTP=1` du `.env` s'il y figure.

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

Équivalent en une commande côté `dev` : `./deploy/systemd/deploy.sh update`
(alias de `maj`) — elle rappelle la commande root à lancer ensuite.

## Logs

```bash
# root
journalctl -u dynasty8-api -f
journalctl -u dynasty8-api -n 200
```

Lignes à connaître : `Schéma PostgreSQL vérifié`, `Dynasty 8 en écoute sur le
port`, `[medias]` (nettoyage différé des photos), `[sync-sheet]` (synchro
Google Sheets, sans conséquence si elle échoue), `[erreur-api]`.

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
schéma.

## Sauvegarde et restauration

```bash
# avant toute migration
pg_dump -Fc -U dynasty8_admin -h 127.0.0.1 dynasty8 > ~/sauvegardes/dynasty8_$(date +%F).dump

# restauration
pg_restore -U dynasty8_admin -h 127.0.0.1 -d dynasty8 --clean --if-exists ~/sauvegardes/dynasty8_AAAA-MM-JJ.dump
npm run migrate    # pg_restore recrée les tables : réaccorde les droits du compte applicatif
```

Les dumps contiennent des données réelles (membres, ventes avec noms RP,
journaux) : ils restent **hors du dépôt**, dans un emplacement privé.

## Ce dont j'ai besoin de vous

1. l'hôte exact de l'ordinateur en jeu (FolkOS) qui embarque le site — le code
   utilise `https://computer.game.fbfa.fr`, à confirmer ;
2. le port du validateur SSO `id` et la méthode d'accès retenue, pour remplir
   `FOLKOS_ID_BASE` ;
3. le slug déclaré dans le broker `access` (suggestion : `dynasty8`) ;
4. un jeton pour `storage.fbfa.fr` (hébergement des photos), et si possible la
   sortie de `node scripts/fbfa-diagnostic.js --prefix dynasty8/` : elle est en
   lecture seule, n'affiche jamais le jeton, et nous permet de finir le suivi
   du quota côté Direction.

## Pour aller plus loin

- Procédure détaillée systemd : `deploy/systemd/README-SYSTEMD.md`
- Variante Docker Compose (si vous préférez) : `deploy/operateur/README-OPERATEUR.md`
- Fonctionnement du stockage des photos, nettoyage et migration des anciennes
  images : section « Photos » du même document.
