# Déploiement sur le VPS Dynasty 8 (Docker Compose)

Pack autonome : `app` (le site), `postgres` (base, volume persistant, jamais
exposée), `caddy` (reverse proxy ; HTTP sur l'IP pour l'instant, HTTPS
automatique dès qu'un nom de domaine pointera vers ce VPS).

Pour l'hébergement chez l'opérateur FlashbackFA (dynasty8.fbfa.fr, ordinateur
en jeu), voir plutôt `../operateur/`.

## Contenu
- `Dockerfile` — construit l'application Node.js.
- `compose.yaml` — les 3 services.
- `Caddyfile` — `:80` tant qu'il n'y a pas de domaine sur ce VPS.
- `.env.example` — modèle des variables (copier en `.env`, jamais commité). En HTTP simple, garder `COOKIES_HTTP=1`.
- `backup.sh` / `restore.sh` — sauvegarde/restauration de la base (`pg_dump`/`pg_restore`). Lancer avec `bash backup.sh`.

## Mise en ligne au quotidien
Depuis le PC : double-clic sur `mettre-en-ligne-vps.bat` à la racine du projet
(copie les fichiers par `scp` puis reconstruit le conteneur `app`), puis Ctrl+F5.

## Première installation
```bash
cd /opt/dynasty8/deploy/vps
cp .env.example .env            # puis remplir les vraies valeurs
chmod 600 .env                  # secrets : lisible par vous seul
bash ../verifier-env.sh .env    # contrôle des droits et du propriétaire
sudo docker compose up -d --build
bash backup.sh                  # première sauvegarde de test
```
`docker compose up` lance d'abord le service **migration** (compte
administrateur PostgreSQL) : il applique `schema.postgres.sql` et crée le
compte applicatif restreint (`APP_DB_USER`), avec lequel le site tourne
ensuite — l'application ne crée plus aucune table elle-même et refuse de
démarrer si le schéma n'est pas appliqué. Après une restauration
(`restore.sh`), relancer `sudo docker compose run --rm migration` pour
réaccorder les droits.

Le conteneur tourne sous l'utilisateur non privilégié `node`. Si votre compte
est dans le groupe `docker`, retirez les `sudo` de ces commandes.

## Photos (storage.fbfa.fr)
Renseigner `FBFA_STORAGE_TOKEN` dans `.env` pour activer l'import des photos.
Fonctionnement, nettoyage (`FBFA_NETTOYAGE`, en simulation par défaut),
diagnostic du service et migration des anciennes photos base64 : voir la
section « Photos » de `../operateur/README-OPERATEUR.md` (mêmes commandes,
précédées de `sudo`). Faire `bash backup.sh` avant toute migration.

## Reverse proxy
Ce pack embarque **Caddy** (voir `Caddyfile`), qui gère seul le HTTPS. Si vous
préférez **nginx** (ou qu'un nginx existe déjà sur la machine), retirez le
service `caddy` du `compose.yaml`, publiez le port de l'app en local
(`ports: ["127.0.0.1:3010:3000"]`) et utilisez :

```nginx
server {
    listen 443 ssl http2;
    server_name dynasty8.example.fr;
    # ssl_certificate ... ;
    client_max_body_size 32m;          # annonces contenant encore des photos base64
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;   # l'app reconstruit ses URL avec
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
Dans les deux cas : ne jamais ajouter `X-Frame-Options` ni écraser
`Content-Security-Policy` (l'app pose elle-même `frame-ancestors` pour
l'ordinateur en jeu). Tout est proxifié vers Node, pages comprises : c'est le
serveur Node qui sert `/public` et l'API.

## Exploitation
- Journaux : `sudo docker compose logs -f app`
- Sauvegarde : `bash backup.sh` (fichiers dans `backups/`, exclus de Git)
