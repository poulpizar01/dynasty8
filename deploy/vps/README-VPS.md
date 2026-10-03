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
- `.env.example` — modèle des variables (copier en `.env`, jamais commité). En HTTP simple, garder `COOKIES_HTTP=1`.

## Mise en ligne au quotidien
Sur le serveur, dans un dossier installé par `git clone` (voir « Première
installation ») :
```bash
cd /opt/dynasty8 && git pull
cd deploy/vps && sudo docker compose up -d --build app
```
Le serveur tourne alors exactement sur ce qui est dans le dépôt. Puis Ctrl+F5
dans le navigateur.

## Première installation
```bash
cd /opt/dynasty8/deploy/vps
cp .env.example .env            # puis remplir les vraies valeurs
chmod 600 .env                  # secrets : lisible par vous seul
bash ../verifier-env.sh .env    # contrôle des droits et du propriétaire
sudo docker compose up -d --build
```
`docker compose up` lance d'abord le service **migration** (compte
administrateur PostgreSQL) : il applique `schema.postgres.sql` et crée le
compte applicatif restreint (`APP_DB_USER`), avec lequel le site tourne
ensuite — l'application ne crée plus aucune table elle-même et refuse de
démarrer si le schéma n'est pas appliqué. Après une restauration
de sauvegarde, relancer `sudo docker compose run --rm migration` pour
réaccorder les droits.

Le conteneur tourne sous l'utilisateur non privilégié `node`. Si votre compte
est dans le groupe `docker`, retirez les `sudo` de ces commandes.

## Photos (storage.fbfa.fr)
Renseigner `FBFA_STORAGE_TOKEN` dans `.env` pour activer l'import des photos.
Fonctionnement, nettoyage (`FBFA_NETTOYAGE`, en simulation par défaut),
diagnostic du service et migration des anciennes photos base64 : voir la
section « Photos » de `../operateur/README-OPERATEUR.md` (mêmes commandes,
précédées de `sudo`). Faire une sauvegarde (voir « Exploitation ») avant
toute opération sur la base.

## Reverse proxy nginx (sur l'hôte)
```bash
sudo apt install nginx                                  # si nginx n'est pas déjà là
sudo cp /opt/dynasty8/deploy/vps/nginx-dynasty8.conf /etc/nginx/sites-available/dynasty8
sudo ln -s /etc/nginx/sites-available/dynasty8 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default             # si le site par défaut gêne
sudo nginx -t && sudo systemctl reload nginx
```
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

1. **Ancien serveur** : faire une sauvegarde (voir « Exploitation »), puis
   rapatrier sur le PC le `.dump` **et** le fichier `.env` (il contient les
   secrets ; jamais par Git, jamais par Discord en clair).
2. **Nouveau serveur** : docker + plugin compose + nginx, un compte non root,
   puis `git clone https://github.com/poulpizar01/dynasty8 /opt/dynasty8`.
   Le dépôt étant public, le clone suffit : aucune clé à installer.
3. Déposer le `.env` dans `deploy/vps/`, `chmod 600 .env`, et y corriger
   `DISCORD_REDIRECT_URI` avec la nouvelle adresse publique.
4. `bash deploy/verifier-env.sh deploy/vps/.env`, puis
   `sudo docker compose up -d --build` et la configuration nginx.
5. **Données** : restaurer le `.dump` (voir « Exploitation ») puis
   `sudo docker compose run --rm migration` (la restauration écrase les
   droits du compte applicatif : cette commande les réaccorde).
6. **Discord** : ajouter la nouvelle URL de redirection dans le portail
   développeur (RoxwoodLegal → OAuth2 → Redirects). Garder l'ancienne tant que
   l'ancien serveur sert encore : les deux peuvent coexister.
7. **En jeu (FolkOS)** : l'ordinateur en jeu pointe vers l'ancienne adresse —
   prévenir l'opérateur FlashbackFA. Le SSO FolkOS n'écoute que sur
   `127.0.0.1` : le site doit tourner sur la machine FolkOS elle-même, sinon
   « Se connecter IG » restera indisponible (le reste fonctionne).
8. **Photos** : rien à déplacer, elles sont chez `storage.fbfa.fr`. Seules les
   anciennes photos encore en base64 vivent dans la base, donc dans le dump.
9. **Vérifier avant de couper l'ancien serveur** : connexion Discord, ajout
   d'une photo d'annonce, WebMap, `/api/medias/etat`, et une dernière
   sauvegarde côté ancien serveur.

## Exploitation
- Journaux : `sudo docker compose logs -f app`
- Sauvegarde : `sudo docker compose exec -T postgres pg_dump -Fc -U dynasty8 dynasty8 > dynasty8_$(date +%F).dump`
- Restauration (écrase la base) : `sudo docker compose exec -T postgres pg_restore -U dynasty8 -d dynasty8 --clean --if-exists < fichier.dump`,
  puis `sudo docker compose run --rm migration` pour réaccorder les droits
