# Dynasty 8 — hébergement sur le serveur FlashbackFA (FolkOS)

Site de l'agence immobilière Dynasty 8 (site public + espace agents), à
servir sur **https://dynasty8.fbfa.fr** et à embarquer dans l'ordinateur en
jeu (FolkOS). Contact : Thomas (Dynasty 8 / Roxwood Network).

## En deux mots
- **Stack** : Node.js 22 (Express) + PostgreSQL 17, le tout en Docker Compose.
  Aucun fichier persistant sur ce serveur → un seul volume à sauvegarder :
  `postgres_data`. Les nouvelles photos (annonces, profils) sont hébergées sur
  **storage.fbfa.fr** (voir « Photos » plus bas) ; les anciennes restent en
  base (base64) ou sous forme de lien tant qu'elles ne sont pas migrées.
- **Pack à utiliser** : `deploy/operateur/` (sans Caddy — votre reverse proxy
  termine le HTTPS). Le pack `deploy/vps/` est l'ancien déploiement autonome.
- **Port** : l'app écoute en local sur `127.0.0.1:3010` (réglable, `PORT_LOCAL`).

## Installation
```bash
git clone <dépôt> /opt/dynasty8      # ou copie du dossier fourni
cd /opt/dynasty8/deploy/operateur
cp .env.example .env                 # puis remplir TOUTES les valeurs
chmod 600 .env                       # secrets : lisible par vous seul
bash ../verifier-env.sh .env         # contrôle des droits et du propriétaire
docker compose up -d --build
```
Le fichier `.env` n'est **plus** fourni dans le dépôt : il contient des secrets
et doit rester hors de Git. Il vous est transmis par message privé.

`docker compose up` lance d'abord le service **migration** (compte
administrateur PostgreSQL), qui applique le schéma et crée le compte
applicatif restreint, puis l'application. Voir « Base de données » ci-dessous.

Le conteneur applicatif tourne sous l'utilisateur non privilégié `node`
(uid 1000), jamais en root. Si votre compte est membre du groupe `docker`,
aucune de ces commandes n'a besoin de `sudo`.

## Reprise des données actuelles
La sauvegarde `pg_dump -Fc` de la base **n'est plus dans le dépôt** : elle
contient des données réelles (membres, ventes avec noms RP, journaux). Elle
vous est transmise séparément, par un canal privé, et ne doit jamais être
commitée (les `*.dump` sont ignorés par Git). Pour la charger (écrase la base
vide fraîchement créée) :
```bash
cd /opt/dynasty8/deploy/operateur
set -a; source .env; set +a
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < dynasty8_XXXX.dump
# pg_restore recrée les tables : il faut réaccorder les droits du compte applicatif
docker compose run --rm migration
docker compose up -d app
```

## Reverse proxy (https://dynasty8.fbfa.fr → http://127.0.0.1:3010)
- Transmettre `Host`, `X-Forwarded-Proto: https` et `X-Forwarded-Host` (l'app est
  en `trust proxy` : elle reconstruit les URL d'API — retour OAuth Discord,
  cookies de session — à partir de `X-Forwarded-Host` s'il est présent, sinon
  de `Host`).
- **Ne pas** ajouter `X-Frame-Options`, **ne pas** écraser `Content-Security-Policy` :
  l'app pose sur chaque réponse
  `Content-Security-Policy: frame-ancestors 'self' https://*.fbfa.fr https://fbfa.fr https://cfx-nui-external-iframe nui://game nui:`
- Taille de requête : une photo est envoyée seule, en binaire (8 Mo maximum
  par défaut), mais une annonce qui contient encore d'anciennes photos base64
  peut peser jusqu'à ~30 Mo à l'enregistrement → garder `client_max_body_size 32m`
  (nginx) ou équivalent tant que la migration n'est pas faite. L'application
  refuse elle-même tout corps plus gros (413) avant de le lire en entier.
- WebSockets : non utilisés.

Exemple nginx :
```nginx
server {
    listen 443 ssl http2;
    server_name dynasty8.fbfa.fr;
    # ssl_certificate ... ;
    client_max_body_size 32m;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Variables `.env`
| Variable | Qui la fournit | Rôle |
|---|---|---|
| `POSTGRES_*` | vous (valeurs aléatoires) | compte **administrateur** de la base : sert uniquement au service `migration` |
| `APP_DB_USER`, `APP_DB_PASSWORD` | vous (valeurs aléatoires) | compte **applicatif restreint** avec lequel le site tourne (créé par `migration`) |
| `SESSION_SECRET` | vous (valeur aléatoire) | signature des cookies de session |
| `DISCORD_CLIENT_ID/SECRET`, `STATS_BOT_SECRET` | Dynasty 8, transmis hors dépôt | connexion Discord de l'espace agents, bot de ventes |
| `DISCORD_REDIRECT_URI` | fixe | `https://dynasty8.fbfa.fr/api/auth/discord/callback` |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | vous | SSO « Se connecter IG » |
| `FBFA_STORAGE_TOKEN` | vous (jeton `storage.fbfa.fr`) | import des photos d'annonces et de profils |
| `FBFA_NETTOYAGE` (+ réglages `FBFA_*` facultatifs, voir `.env.example`) | Dynasty 8 | `simulation` par défaut — ne passer à `actif` qu'avec l'accord de la Direction |

`id` écoutant en `127.0.0.1` sur l'hôte, l'app le joint via
`host.docker.internal` (déclaré dans `compose.yaml`) :
`FOLKOS_ID_BASE=http://host.docker.internal:<port>`. Si `id` n'accepte que
`127.0.0.1` comme origine, passer le service `app` en `network_mode: host`
(et `DATABASE_URL` sur `localhost:5432` avec un `ports: 127.0.0.1:5432:5432`
sur postgres) — dites-nous ce que vous préférez.

## Intégration FolkOS déjà faite côté site
- Aucun `alert/confirm/prompt/print`, aucun `beforeunload`.
- `fbfa-game.js` (typing `field`, `escape: false` — le site s'ouvre comme une
  **page** du navigateur FolkOS) et `fbfa-bridge.js` chargés seulement en
  iframe, depuis `https://computer.game.fbfa.fr` (constante `FOLKOS_HOTE` dans
  `public/layout.js` — **à confirmer**).
- Cookies de session `SameSite=None; Secure`. Liens `_blank` neutralisés en jeu.
- Endpoint SSO : **`https://dynasty8.fbfa.fr/api/folkos`** (reçoit
  `?folkos_ticket=`, vérifie auprès de `id` `/sso/verify`, retrouve le compte
  par `discord_id`, honore `?next=` relatif). À déclarer dans le broker
  `access`, slug suggéré : `dynasty8`.

## À nous confirmer
1. L'hôte FolkOS exact (`FOLKOS_HOTE`) et que le site s'ouvre bien comme page (sinon `escape: true`).
2. Le port de `id` et la méthode retenue (host.docker.internal ou network host).
3. Le slug déclaré dans le broker.

## Base de données : migration et droits
- Le site **ne crée plus aucune table au démarrage**. Le schéma est appliqué
  une fois, par le service `migration` (compte administrateur), qui :
  1. applique `schema.postgres.sql` (idempotent, jamais destructif) ;
  2. crée le compte `APP_DB_USER` s'il n'existe pas, ou met à jour son mot de passe ;
  3. lui accorde `SELECT`, `INSERT`, `UPDATE`, `DELETE` sur les tables et
     `USAGE` sur les séquences, et lui **retire** le droit de créer quoi que ce soit ;
  4. vérifie que ce compte ne peut effectivement pas créer de table.
- L'application démarre avec `DB_SCHEMA_AUTO=0` : elle vérifie que les tables
  et colonnes attendues sont là et **refuse de démarrer** sinon, avec un
  message indiquant la commande à lancer.
- À relancer à la main après une mise à jour du code ou une restauration :
  ```bash
  docker compose run --rm migration            # applique schéma + droits
  docker compose exec app node scripts/appliquer-schema.js   # vérifie, sans rien écrire
  ```
- En cas d'oubli, le conteneur `app` s'arrête avec :
  « Démarrage refusé : schéma PostgreSQL incomplet (…) ».

## Photos : stockage storage.fbfa.fr
Fonctionnement (détails dans `src/medias.js`) :
- L'espace agents réduit chaque photo dans le navigateur, puis l'envoie à
  `POST /api/biens/photo` ou `POST /api/profil/photo`. Le serveur vérifie la
  session et les droits, contrôle réellement le fichier (JPEG/PNG/WebP), le
  dépose sous `dynasty8/{biens|profils}/AAAA/MM/{uuid}.{ext}` et renvoie son URL
  publique `https://storage.fbfa.fr/view/{id}`. Le jeton ne quitte jamais le serveur.
- Chaque fichier est suivi en base (tables `medias`, `medias_references`). Il
  reste **temporaire** tant que l'annonce ou le profil n'est pas enregistré ;
  le rattachement se fait dans la même transaction que l'enregistrement.
- Une photo retirée n'est supprimée du stockage qu'après l'enregistrement
  validé, s'il ne reste aucune autre référence, et après un délai de grâce
  (24 h). Les imports jamais enregistrés sont traités après 24 h. La suppression
  se fait **par clé**. Les liens collés, les anciennes photos base64 et les
  fichiers envoyés avant ce suivi ne sont **jamais** supprimés.
- Tâche horaire intégrée au serveur, pilotée par `FBFA_NETTOYAGE` :
  `simulation` (défaut : écrit dans les journaux ce qu'elle ferait),
  `actif`, `desactive`. Lancement manuel avec compte rendu :
  ```bash
  docker compose exec app node scripts/nettoyer-medias-fbfa.js            # simulation
  docker compose exec app node scripts/nettoyer-medias-fbfa.js --apply    # réel (après accord)
  ```
- Suivi : `GET /api/medias/etat` (Direction) donne le nombre et le volume de
  médias par état, en lecture de la base uniquement.

### Points du service à confirmer avec le vrai jeton
Le contrat ne précise ni le format de `GET /api/usage`, ni si
`GET /api/objects` renvoie la clé des objets, ni les champs de
`GET /api/object/{clé}`. Le site ne s'appuie sur aucun de ces points. Pour les
relever (lecture seule, le jeton n'est pas affiché) :
```bash
docker compose exec app node scripts/fbfa-diagnostic.js --prefix dynasty8/
```
Le suivi du quota distant ne sera ajouté à l'espace Direction qu'une fois ce
format confirmé.

### Migration des anciennes photos base64 (sur accord de la Direction)
Ne concerne que les images `data:image/…;base64` stockées en base (annonces et
profils) ; jamais `public/img` ni les liens externes.
1. **Sauvegarde** : `docker compose exec -T postgres pg_dump -Fc -U dynasty8 dynasty8 > avant-migration_$(date +%F).dump`
2. **Simulation** (aucune écriture, compte rendu JSON dans `rapports/`) :
   `docker compose exec app node scripts/migrer-images-fbfa.js`
3. **Essai limité** : `docker compose exec app node scripts/migrer-images-fbfa.js --apply --limite 5`
4. **Migration** : `docker compose exec app node scripts/migrer-images-fbfa.js --apply`
   (relançable : une coupure ou une erreur n'altère rien, la relance reprend ;
   une image n'est remplacée qu'après confirmation de son envoi).
5. **Retour arrière** si besoin : `… migrer-images-fbfa.js --annuler` (simulation)
   puis `--annuler --apply`. Les valeurs d'origine sont restaurées depuis la
   table `medias_migration_sauvegarde` ; les copies distantes deviennent
   orphelines et suivent le nettoyage différé. En dernier recours : restaurer
   le dump de l'étape 1.

Les comptes rendus sont écrits dans le conteneur (`/app/rapports/`) : les
récupérer avec `docker compose cp app:/app/rapports ./rapports`.

## Exploitation
- Journaux : `docker compose logs -f app` (nettoyage des photos : lignes `[medias]`)
- Mise à jour : `git pull && docker compose up -d --build app`
- Sauvegarde : `docker compose exec -T postgres pg_dump -Fc -U dynasty8 dynasty8 > dynasty8_$(date +%F).dump`
