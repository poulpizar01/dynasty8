# Dynasty 8 — hébergement sur le serveur FlashbackFA (FolkOS)

Site de l'agence immobilière Dynasty 8 (site public + espace agents), à
servir sur **https://dynasty8.fbfa.fr** et à embarquer dans l'ordinateur en
jeu (FolkOS). Contact : Thomas (Dynasty 8 / Roxwood Network).

## En deux mots
- **Stack** : Node.js 22 (Express) + PostgreSQL 17, le tout en Docker Compose.
  Aucun fichier persistant hors de la base (les photos sont stockées en base
  ou par lien) → un seul volume à sauvegarder : `postgres_data`.
- **Pack à utiliser** : `deploy/operateur/` (sans Caddy — votre reverse proxy
  termine le HTTPS). Le pack `deploy/vps/` est l'ancien déploiement autonome.
- **Port** : l'app écoute en local sur `127.0.0.1:3010` (réglable, `PORT_LOCAL`).

## Installation
```bash
git clone <dépôt> /opt/dynasty8      # ou copie du dossier fourni
cd /opt/dynasty8/deploy/operateur
# le fichier .env est déjà fourni dans ce dossier : ne reste qu'à remplir les 3 lignes FOLKOS_*
docker compose up -d --build
```
Le serveur crée/met à jour lui-même son schéma au démarrage : aucune migration
à lancer à la main.

## Reprise des données actuelles
La sauvegarde `pg_dump -Fc` de la base actuelle est fournie dans ce dossier
(`deploy/operateur/dynasty8_AAAAMMJJ_HHMMSS.dump`). Pour la charger (écrase la base vide fraîchement créée) :
```bash
cd /opt/dynasty8/deploy/operateur
set -a; source .env; set +a
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < dynasty8_XXXX.dump
```

## Reverse proxy (https://dynasty8.fbfa.fr → http://127.0.0.1:3010)
- Transmettre `Host` et `X-Forwarded-Proto: https` (l'app est en `trust proxy`).
- **Ne pas** ajouter `X-Frame-Options`, **ne pas** écraser `Content-Security-Policy` :
  l'app pose sur chaque réponse
  `Content-Security-Policy: frame-ancestors 'self' https://*.fbfa.fr https://fbfa.fr https://cfx-nui-external-iframe nui://game nui:`
- Taille de requête : les photos d'annonces sont envoyées en base64 par l'espace
  agents (jusqu'à 10 photos) → prévoir `client_max_body_size 30m` (nginx) ou
  équivalent.
- WebSockets : non utilisés.

Exemple nginx :
```nginx
server {
    listen 443 ssl http2;
    server_name dynasty8.fbfa.fr;
    # ssl_certificate ... ;
    client_max_body_size 30m;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Variables `.env`
| Variable | Qui la fournit | Rôle |
|---|---|---|
| `POSTGRES_*`, `SESSION_SECRET` | vous (valeurs aléatoires) | base et signature des sessions |
| `DISCORD_CLIENT_ID/SECRET`, `STATS_BOT_SECRET` | déjà renseignés dans `.env` | connexion Discord de l'espace agents, bot de ventes |
| `DISCORD_REDIRECT_URI` | fixe | `https://dynasty8.fbfa.fr/api/auth/discord/callback` |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | vous | SSO « Se connecter IG » |

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

## Exploitation
- Journaux : `docker compose logs -f app`
- Mise à jour : `git pull && docker compose up -d --build app`
- Sauvegarde : `docker compose exec -T postgres pg_dump -Fc -U dynasty8 dynasty8 > dynasty8_$(date +%F).dump`
