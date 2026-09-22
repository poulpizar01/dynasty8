# Déploiement sur le VPS Dynasty 8 (Docker Compose)

Pack autonome : `migration` (applique le schéma, une fois), `app` (le site,
publié uniquement sur `127.0.0.1:3010`) et `postgres` (base, volume
persistant, jamais exposée).

Le reverse proxy est **nginx, installé sur l'hôte** (plus de conteneur Caddy
depuis sept. 2026) : il proxifie tout vers l'application, pages comprises.
Configuration prête à copier : `nginx-dynasty8.conf`.

Pour l'hébergement chez l'opérateur FlashbackFA (dynasty8.fbfa.fr, ordinateur
en jeu), voir plutôt `../operateur/`.

## Contenu
- `Dockerfile` — construit l'application Node.js.
- `compose.yaml` — les 3 services (`migration`, `app`, `postgres`).
- `nginx-dynasty8.conf` — configuration du reverse proxy, à copier dans `/etc/nginx/sites-available/`.
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

## Reverse proxy nginx (sur l'hôte)
```bash
sudo apt install nginx                                  # si nginx n'est pas déjà là
sudo cp /opt/dynasty8/deploy/vps/nginx-dynasty8.conf /etc/nginx/sites-available/dynasty8
sudo ln -s /etc/nginx/sites-available/dynasty8 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default             # si le site par défaut gêne
sudo nginx -t && sudo systemctl reload nginx
```
Le fichier fourni écoute en HTTP sur l'adresse IP et proxifie vers
`127.0.0.1:3010` (`PORT_LOCAL` dans `.env`). Il transmet `Host`,
`X-Forwarded-Host`, `X-Forwarded-Proto` et `X-Forwarded-For` : l'application en
a besoin pour reconstruire ses URL (retour OAuth Discord, cookies de session).

Le jour où un domaine pointera vers ce VPS : `sudo certbot --nginx -d <domaine>`
complète le fichier tout seul ; retirer ensuite `COOKIES_HTTP=1` du `.env` et
relancer l'app (les cookies redeviennent « Secure », indispensable en jeu).

Ne jamais ajouter `X-Frame-Options` ni écraser `Content-Security-Policy` :
l'app pose elle-même `frame-ancestors` pour l'ordinateur en jeu, et un en-tête
ajouté par le proxy afficherait une page blanche en jeu, sans message.

### Migration depuis l'ancien conteneur Caddy
```bash
cd /opt/dynasty8/deploy/vps
sudo docker compose down                 # libère les ports 80/443 pris par Caddy
sudo docker volume rm vps_caddy_data vps_caddy_config   # facultatif
# installer nginx comme ci-dessus, puis :
sudo docker compose up -d --build
```

## Exploitation
- Journaux : `sudo docker compose logs -f app`
- Sauvegarde : `bash backup.sh` (fichiers dans `backups/`, exclus de Git)
