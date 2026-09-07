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
cp .env.example .env      # puis remplir les vraies valeurs
sudo docker compose up -d --build
bash backup.sh            # première sauvegarde de test
```
Le serveur applique lui-même son schéma (`schema.postgres.sql`) au démarrage.

## Exploitation
- Journaux : `sudo docker compose logs -f app`
- Sauvegarde : `bash backup.sh` (fichiers dans `backups/`, exclus de Git)
