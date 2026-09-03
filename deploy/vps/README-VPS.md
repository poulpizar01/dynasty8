# Déploiement sur un VPS (Docker Compose) — préparation uniquement

Ce dossier prépare une migration future vers un VPS. **Rien ici n'est utilisé
par Railway** (Railway construit directement depuis la racine du dépôt avec
son propre système, Railpack — ce dossier ne le change pas).

## Contenu
- `Dockerfile` — construit l'application Node.js (identique au code qui tourne sur Railway).
- `compose.yaml` — 3 services : `app` (le site), `postgres` (base, volume persistant, jamais exposée publiquement), `caddy` (HTTPS automatique + domaine).
- `Caddyfile` — à modifier avec le vrai nom de domaine.
- `.env.example` — modèle des variables à renseigner (copier en `.env`, jamais commité).
- `backup.sh` / `restore.sh` — sauvegarde/restauration de la base (`pg_dump`/`pg_restore`).

## Ce qui a été vérifié pendant la préparation
- Aucun fichier persistant généré par le site en dehors de la base PostgreSQL (pas d'upload de fichiers dans le code) — seul le volume `postgres_data` est donc nécessaire aujourd'hui.
- Le serveur applique lui-même son schéma (`schema.postgres.sql`) et l'import unique des données réelles au démarrage — aucune commande de migration séparée à lancer, comme sur Railway.

## Points à renseigner avant un vrai déploiement (pas encore faits)
1. Un vrai VPS avec Docker + Docker Compose installés.
2. Un nom de domaine pointant vers ce VPS (à mettre dans `Caddyfile`).
3. `deploy/vps/.env` rempli avec de vraies valeurs (mot de passe PostgreSQL, `SESSION_SECRET`, identifiants Discord, `STATS_BOT_SECRET`).
4. Si vous gardez les mêmes identifiants Discord que Railway : ajouter cette nouvelle URL de redirection dans le panneau développeur Discord (Railway continue de fonctionner en parallèle avec la sienne).
5. Une politique de sauvegarde régulière (ex. `backup.sh` via une tâche planifiée), non mise en place ici.
6. Bascule finale du domaine et arrêt de Railway/Cloudflare : décision et exécution manuelles, hors périmètre de cette préparation.

## Démarrage (le jour venu)
```bash
cd deploy/vps
cp .env.example .env   # puis remplir les vraies valeurs
docker compose up -d --build
./backup.sh             # première sauvegarde de test
```
