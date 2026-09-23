# Déploiement sur le VPS Dynasty 8 (Docker Compose)

Pack autonome : `migration` (applique le schéma, une fois), `app` (le site,
publié uniquement sur `127.0.0.1:3010`) et `postgres` (base, volume
persistant, jamais exposée).

Le reverse proxy est **nginx, installé sur l'hôte** (plus de conteneur Caddy
depuis sept. 2026) : il proxifie tout vers l'application, pages comprises.
Configuration prête à copier : `nginx-dynasty8.conf`.

Pour l'hébergement chez l'opérateur FlashbackFA (dynasty8.fbfa.fr, ordinateur
en jeu), voir plutôt `../operateur/`.

Le pack ne dépend d'**aucune machine en particulier** : ni adresse IP ni nom
de domaine ne figurent dans le dépôt. Voir « Changer de serveur » plus bas.

## Contenu
- `Dockerfile` — construit l'application Node.js.
- `compose.yaml` — les 3 services (`migration`, `app`, `postgres`).
- `nginx-dynasty8.conf` — configuration du reverse proxy, à copier dans `/etc/nginx/sites-available/`. `server_name _` : elle accepte n'importe quelle adresse, donc rien à y changer en cas de déménagement.
- `installer-vps.sh` — installation (ou reprise) sur un serveur neuf : contrôle les outils, le `.env` et les droits, puis construit et démarre. N'appelle jamais `sudo` lui-même et ne touche jamais à la base.
- `.env.example` — modèle des variables (copier en `.env`, jamais commité). En HTTP simple, garder `COOKIES_HTTP=1`.
- `cible.exemple.bat` — modèle de `cible.bat` (non versionné) : le serveur visé par `mettre-en-ligne-vps.bat`.
- `backup.sh` / `restore.sh` — sauvegarde/restauration de la base (`pg_dump`/`pg_restore`). Lancer avec `bash backup.sh`.

## Mise en ligne au quotidien
Depuis le PC : double-clic sur `mettre-en-ligne-vps.bat` à la racine du projet
(copie les fichiers par `scp` puis reconstruit le conteneur `app`), puis Ctrl+F5.
Le script affiche le serveur visé avant d'envoyer quoi que ce soit.

Le serveur visé vient de `deploy/vps/cible.bat` (copie de `cible.exemple.bat`,
exclue de Git). Changer de machine = modifier ce fichier — ou simplement le
`HostName` de l'alias `dynasty8-vps` dans `%USERPROFILE%\.ssh\config`. À
défaut de `cible.bat`, les variables d'environnement `D8_VPS`, `D8_VPSURL` et
`D8_RACINE` sont utilisées, puis les valeurs par défaut.

## Première installation
```bash
cd /opt/dynasty8/deploy/vps
cp .env.example .env            # puis remplir les vraies valeurs
chmod 600 .env                  # secrets : lisible par vous seul
cd /opt/dynasty8
bash deploy/vps/installer-vps.sh verifier    # outils, .env, droits — ne modifie rien
bash deploy/vps/installer-vps.sh installer   # construit et démarre
sudo bash deploy/vps/installer-vps.sh nginx  # pose le reverse proxy
bash deploy/vps/backup.sh                    # première sauvegarde de test
```
Les étapes restent faisables à la main (`sudo docker compose up -d --build`) :
le script ne fait rien d'autre, il vérifie seulement avant.
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
Raccourci équivalent : `sudo bash deploy/vps/installer-vps.sh nginx`.

Le fichier fourni écoute en HTTP sur n'importe quel nom d'hôte (`server_name _` :
adresse IP comme domaine, donc rien à changer en cas de déménagement) et
proxifie vers `127.0.0.1:3010` (`PORT_LOCAL` dans `.env`). Il transmet `Host`,
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

## Changer de serveur
Une seule valeur dépend de la machine : `DISCORD_REDIRECT_URI` dans le `.env`
(et `COOKIES_HTTP` / `PGSSL` si l'on passe en HTTPS). Le code, `compose.yaml`
et `nginx-dynasty8.conf` sont identiques d'un serveur à l'autre.

1. **Ancien serveur** : `bash deploy/vps/backup.sh`, puis rapatrier sur le PC
   le `.dump` créé dans `backups/` **et** le fichier `.env` (il contient les
   secrets ; jamais par Git, jamais par Discord en clair).
2. **Nouveau serveur** : docker + plugin compose + nginx, un compte non root,
   puis `git clone https://github.com/poulpizar01/dynasty8 /opt/dynasty8`.
   Le dépôt étant public, le clone suffit : aucune clé à installer.
3. Déposer le `.env` dans `deploy/vps/`, `chmod 600 .env`, et y corriger
   `DISCORD_REDIRECT_URI` avec la nouvelle adresse publique.
4. `bash deploy/vps/installer-vps.sh verifier` puis `installer`, puis
   `sudo bash deploy/vps/installer-vps.sh nginx`.
5. **Données** : copier le `.dump` dans `deploy/vps/backups/`, puis
   `bash deploy/vps/restore.sh backups/le_fichier.dump` et enfin
   `sudo docker compose run --rm migration` (la restauration écrase les
   droits du compte applicatif : cette commande les réaccorde).
6. **Discord** : ajouter la nouvelle URL de redirection dans le portail
   développeur (RoxwoodLegal → OAuth2 → Redirects). Garder l'ancienne tant que
   l'ancien serveur sert encore : les deux peuvent coexister.
7. **PC** : mettre à jour `deploy/vps/cible.bat` (ou le `HostName` de l'alias
   SSH) pour que `mettre-en-ligne-vps.bat` vise la nouvelle machine.
8. **En jeu (FolkOS)** : l'ordinateur en jeu pointe vers l'ancienne adresse —
   prévenir l'opérateur FlashbackFA. Le SSO FolkOS n'écoute que sur
   `127.0.0.1` : le site doit tourner sur la machine FolkOS elle-même, sinon
   « Se connecter IG » restera indisponible (le reste fonctionne).
9. **Photos** : rien à déplacer, elles sont chez `storage.fbfa.fr`. Seules les
   anciennes photos encore en base64 vivent dans la base, donc dans le dump.
10. **Vérifier avant de couper l'ancien serveur** : connexion Discord, ajout
    d'une photo d'annonce, WebMap, `/api/medias/etat`, et une dernière
    sauvegarde côté ancien serveur.

## Exploitation
- Journaux : `sudo docker compose logs -f app`
- Sauvegarde : `bash backup.sh` (fichiers dans `backups/`, exclus de Git)
