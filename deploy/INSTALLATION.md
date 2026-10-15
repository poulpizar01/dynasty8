# Dynasty 8 — mise en production sur le VPS FlashbackFA

Guide pas à pas de la première mise en ligne de **https://dynasty8.fbfa.fr** : vitrine de l'agence immobilière et espace agents, aussi affiché dans l'ordinateur en jeu (FolkOS). À suivre **dans l'ordre** : chaque étape dit quoi faire, ce qu'on doit obtenir, et quoi faire si ce n'est pas le cas. La liste de contrôle finale (§ 11) sert à vérifier que rien n'a été oublié.

Guide générique du modèle sur lequel repose le site (mises à jour, journaux, sauvegardes, restauration) : [server/README.md](../server/README.md). Rôle de chaque réglage nginx : [docs/nginx.md](../docs/nginx.md). Ordinateur en jeu : [docs/folkos.md](../docs/folkos.md).

## En deux mots

| | |
|---|---|
| Exécution | **Docker Compose** : `dynasty8-app` (site Node), `dynasty8-db` (PostgreSQL 17), `dynasty8-backup` (sauvegarde quotidienne), `dynasty8-db-roles` (ne tourne qu'un instant à chaque démarrage) |
| Port local | `127.0.0.1:3010` (`HOST_PORT`), jamais exposé directement : nginx le sert en HTTPS |
| Domaines | `dynasty8.fbfa.fr` (site) et `carte.dynasty8.fbfa.fr` (WebMap du serveur, relayée par le site) |
| nginx | deux fichiers prêts dans [`deploy/nginx/`](nginx/) |
| Base | créée vide au premier démarrage (les migrations sont appliquées par le site) |
| Images envoyées | stockage `storage.fbfa.fr`, jamais sur le disque du VPS |
| Dépôt | https://github.com/poulpizar01/dynasty8, branche `main` |

## 0. Qui fait quoi, et quoi rassembler avant de commencer

| Qui | Rôle |
|---|---|
| **Opérateur du VPS** (vous) | serveur, DNS, nginx, certificats, fichier `.env`, bot Discord, mises à jour |
| **Direction de Dynasty 8** | identifiants Discord de l'agence, première connexion, grades, réglages dans l'espace agents |
| **Opérateur de l'ordinateur en jeu** (FolkOS) | hôte FolkOS, identifiants SSO, déclaration du site dans son broker |
| **Qui programme le bot de ventes** | appelle le site avec une clé que vous lui donnez |

À rassembler avant l'étape 3 (tout ce qui manque peut être ajouté plus tard, sauf les quatre premiers) :

- [ ] `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` de l'application Discord RoxwoodLegal (`1546523997980852294`) — Direction
- [ ] `DISCORD_GUILD_ID` : identifiant du serveur Discord de Dynasty 8 — Direction
- [ ] le jeton du stockage `storage.fbfa.fr` (`STORAGE_TOKEN`) — vous
- [ ] deux secrets générés : `openssl rand -hex 32` (une fois pour `SESSION_SECRET`, une fois pour `POSTGRES_PASSWORD`) — vous
- [ ] le jeton du bot de l'application RoxwoodLegal (`DISCORD_BOT_TOKEN`, § 2) — vous
- [ ] l'hôte FolkOS (`https://computer.game.fbfa.fr` à confirmer) et les identifiants SSO `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` — opérateur FolkOS
- [ ] un troisième secret pour le bot de ventes : `openssl rand -hex 32` (`STATS_BOT_SECRET`) — vous

## 1. Préparer le VPS

1. **Docker** : `docker compose version` doit répondre. Sinon : `curl -fsSL https://get.docker.com | sudo sh`, puis `sudo usermod -aG docker $USER` et se reconnecter. Le groupe `docker` vaut des droits root : à réserver au compte d'administration.
2. **nginx, certbot, git** : `sudo apt update && sudo apt install -y nginx certbot git`.
3. **Pare-feu** : seuls SSH, 80 et 443 ouverts (`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`, ou dans le pare-feu de l'hébergeur). Le port 3010 ne doit **pas** être ouvert.
4. **DNS** : `dynasty8.fbfa.fr` **et** `carte.dynasty8.fbfa.fr` pointent sur l'IP du VPS. Vérifier : `dig +short dynasty8.fbfa.fr` et `dig +short carte.dynasty8.fbfa.fr` affichent l'IP du VPS. Sinon certbot échouera.
5. **Port libre** : `ss -ltnp | grep 3010` n'affiche rien. Sinon, prendre un autre port et le changer dans le `.env` et les deux fichiers nginx.
6. **`/etc/nginx/snippets/deny-hidden.conf`** existe (les fichiers nginx l'incluent). Sinon, le créer avec :
   ```nginx
   location ~ /\.(?!well-known/) { return 404; }
   ```
7. **Services de la machine joignables depuis le conteneur** : le validateur SSO `id` de FolkOS (et la WebMap, si elle tourne sur ce VPS). Dans le conteneur, `127.0.0.1` désigne le conteneur lui-même. Deux possibilités :
   - leur adresse publique en `https://`, s'ils en ont une ;
   - `http://host.docker.internal:<port>` (nom déclaré dans `compose.yaml`), à condition que le service écoute aussi sur l'adresse du pont Docker (`ip -4 addr show docker0`, en général `172.17.0.1`) et que le pare-feu laisse passer `172.16.0.0/12` vers ce port.

   **Tout est sur la même machine** (confirmé) : le site Dynasty 8, l'ordinateur en jeu et le validateur `id` de FolkOS, qui n'écoute qu'en local. Le site doit donc être installé sur ce VPS, et non ailleurs.

## 2. Application et bot Discord

Dans le portail développeur Discord (https://discord.com/developers/applications), application **RoxwoodLegal** :

1. **OAuth2 → Redirects** : ajouter `https://dynasty8.fbfa.fr/auth/discord/callback`, à l'identique (sans barre finale). La connexion demande les autorisations `identify`, `guilds` et `guilds.members.read` : rien à cocher, le site les demande lui-même.
2. **Bot → Reset Token** : copier le jeton (il ne s'affiche qu'une fois) ; c'est `DISCORD_BOT_TOKEN`. Aucune « intention privilégiée » n'est nécessaire (le site n'utilise que l'API, pas la passerelle).
3. **Inviter le bot sur le serveur de Dynasty 8** : ouvrir l'adresse suivante, choisir le serveur, valider :
   `https://discord.com/oauth2/authorize?client_id=1546523997980852294&scope=bot&permissions=19456`
   (droits demandés : *Voir les salons*, *Envoyer des messages*, *Intégrer des liens* ; le site ne lit aucun salon, il n'a pas besoin de voir les anciens messages). Pour limiter les droits, les accorder plutôt salon par salon :
   - catégories des tickets (Ticket Tool) : *Voir le salon*, *Envoyer des messages*, *Intégrer des liens* (les événements d'agenda sont postés dans les tickets) ;
   - aucun droit n'est nécessaire dans le salon des prises et fins de service : le bot en transmet les événements au site par webhook.

   Le bot sert à proposer les rôles, salons et catégories par leur nom (Grades, Paramètres), relire les rôles de chaque agent toutes les 10 minutes (un rôle retiré ou un départ du serveur compte aussitôt), transmettre les prises et fins de service et prévenir sur Discord les personnes destinataires d'un événement d'agenda (dans leur ticket ou en message privé). Sans lui, le site fonctionne, mais ces fonctions restent inactives et un rôle retiré ne compte qu'à la connexion suivante (7 jours au plus).

## 3. Le fichier `.env`

Modèle commenté : [`.env.example`](../.env.example), à copier en `.env` (étape 4). Valeurs pour Dynasty 8 :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `COMPOSE_FILE` | `compose.yaml` (tel que dans `.env.example` : écarte les réglages de développement) | oui |
| `SITE_ID`, `HOST_PORT` | `dynasty8`, `3010` | oui |
| `BASE_URL` | `https://dynasty8.fbfa.fr` (sans barre finale) | oui |
| `SESSION_SECRET` | secret généré (32 caractères au moins) | oui |
| `POSTGRES_PASSWORD` | secret généré ; **ne se change plus** une fois la base créée | oui |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | application RoxwoodLegal (§ 2) | oui |
| `DISCORD_GUILD_ID` | serveur Discord de Dynasty 8 : seuls ses membres se connectent, son propriétaire a tous les droits sur le site | oui |
| `DISCORD_BOT_TOKEN` | jeton du bot (§ 2) | conseillé |
| `STORAGE_URL`, `STORAGE_TOKEN`, `STORAGE_PREFIX` | `https://storage.fbfa.fr`, jeton du stockage, `dynasty8/` | oui pour envoyer des photos |
| `BOT_WEBHOOK_SECRETS` | secret de l'abonnement « Candidatures » du bot Discord (§ 8) | plus tard |
| `STATS_BOT_SECRET` | secret généré, à transmettre **en privé** à qui programme le bot de ventes | plus tard |
| `WEBMAP_HOTE` | `carte.dynasty8.fbfa.fr` | oui pour la WebMap |
| `FOLKOS_HOTE` | hôte de l'ordinateur en jeu, ex. `https://computer.game.fbfa.fr` | oui pour l'affichage en jeu |
| `FOLKOS_CADRES` | `https://*.fbfa.fr https://fbfa.fr` (autres pages FlashbackFA autorisées à afficher le site) | avec `FOLKOS_HOTE` |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | validateur `id` **vu depuis le conteneur** (§ 1.7), identifiants du site chez l'opérateur FolkOS | pour « Se connecter IG » |
| `APP_MEMORY`, `APP_CPUS`, `APP_NODE_HEAP`, `DB_MEMORY`, `DB_CPUS` | à laisser commentés (512 Mo et 1 processeur pour le site, 256 Mo pour la base) ; à relever seulement si `docker stats` montre le site au plafond | non |

**À ne jamais mettre dans le `.env` de production** : `DEV_LOGIN` (connexion sans Discord, réservée au poste de développement : le site refuse de démarrer avec), `DISCORD_BOT_TOKEN=simulation` (faux bot de développement, refusé aussi), ni un fichier `compose.local.yaml` (réglages d'un poste de développement).

Les **liens et réglages de l'agence ne vont pas dans le `.env`** : ils se règlent dans l'espace agents (§ 7).

Le site **refuse de démarrer** sur un réglage incomplet ou mal formé, et dit lequel dans `docker logs dynasty8-app`. Après toute modification du `.env` : `docker compose up -d` (le site redémarre avec les nouvelles valeurs).

## 4. Installer et démarrer

```bash
sudo install -d -o $USER -g $USER /opt/dynasty8
git clone -b main https://github.com/poulpizar01/dynasty8 /opt/dynasty8
cd /opt/dynasty8
cp .env.example .env && chmod 600 .env
mkdir -m 700 backups
nano .env                       # remplir selon le § 3
docker compose up -d --build
```

On doit obtenir :
```bash
docker compose ps               # app, db et backup « Up » ; db « healthy », puis app « healthy » (1 à 2 min)
docker logs dynasty8-app        # se termine par « Dynasty 8 en écoute sur le port 3000 (https://dynasty8.fbfa.fr) »
curl -s http://127.0.0.1:3010/healthz
```
Si `app` redémarre en boucle : `docker logs dynasty8-app` nomme le réglage refusé ; le corriger dans `.env`, puis `docker compose up -d`.

## 5. nginx et certificats

Pour **chacun des deux** fichiers de [`deploy/nginx/`](nginx/) : d'abord `dynasty8.fbfa.fr.conf`, puis `carte.dynasty8.fbfa.fr.conf`. nginx refuse un bloc HTTPS dont le certificat n'existe pas encore : on l'ajoute après avoir obtenu le certificat.

```bash
D=dynasty8.fbfa.fr              # puis recommencer avec D=carte.dynasty8.fbfa.fr
sudo cp deploy/nginx/$D.conf /etc/nginx/sites-available/
sudo nano /etc/nginx/sites-available/$D.conf     # couper tout ce qui suit « # --- bloc HTTPS » (le garder de côté)
sudo ln -s /etc/nginx/sites-available/$D.conf /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d $D
sudo nano /etc/nginx/sites-available/$D.conf     # recoller le bloc HTTPS
sudo nginx -t && sudo systemctl reload nginx
```

On doit obtenir : `curl -sI https://dynasty8.fbfa.fr` répond `200`. Le certificat se renouvelle seul ; `sudo certbot renew --dry-run` le vérifie.

- **Ne pas tester la connexion avant le certificat** : le cookie de session n'est envoyé qu'en HTTPS.
- Dans les fichiers nginx, **ne jamais ajouter** `X-Frame-Options` ni `Content-Security-Policy` : le site pose lui-même ceux qui permettent son affichage dans l'ordinateur en jeu, et un en-tête ajouté par nginx donnerait une page blanche en jeu.

## 6. Première connexion (avec la Direction de Dynasty 8)

Dans cet ordre :

1. Le **propriétaire du serveur Discord** de Dynasty 8 se connecte le premier : https://dynasty8.fbfa.fr/gestion/ → « Se connecter avec Discord ». Il a tous les droits.
2. **Gestion → Grades** : créer les grades de l'agence, **du plus haut au plus bas** (glisser pour réordonner), et lier chacun à son **rôle Discord**, choisi par son nom dans la liste (bot relié). Cocher pour chaque grade ce qu'il peut faire.
3. Les agents se connectent par Discord : qui porte un rôle lié à un grade entre directement ; les autres attendent d'être validés dans **Gestion → Comptes & accès** (signalé dans « À traiter » sur l'accueil).
4. La connexion « IG » dans l'ordinateur en jeu marche pour tout agent qui s'est connecté par Discord depuis moins de 30 jours (règle voulue : un agent parti du serveur Discord perd aussi l'accès en jeu).

## 7. Réglages de l'agence (espace agents, avec la Direction)

Tout se règle depuis l'espace agents, sans toucher au serveur. **Paramètres** (permission « Paramètres du site »), onglet par onglet, bouton « Enregistrer » de chaque onglet :

- **Liens** : registre (intranet), Discord de l'agence, boutique VIP, Discord du partenaire décoration, **présentations Google Slides des quatre cohérences** (Habitation, Garage, Cayo Perico, Roxwood : coller le lien de partage de chaque présentation, partagée à « Tous les utilisateurs disposant du lien »). Un lien vide masque son bouton.
- **Google Sheets et carte** :
  - **Google Sheets de la Direction** : ouvrir l'onglet du récapitulatif, coller l'adresse de la barre du navigateur (elle finit par `gid=…`). Le classeur doit être partagé à « Tous les utilisateurs disposant du lien », en lecture. L'état de la lecture s'affiche en tête de l'onglet (lu toutes les 5 minutes, et aussitôt après un changement de lien).
  - **WebMap** : adresse publique en `https://` de la carte (ex. `https://webmap.dynasty8.fbfa.fr`). Le site refuse une adresse du serveur lui-même ou d'un réseau privé. Cette adresse n'est jamais montrée aux visiteurs.
- **Discord** (bot relié) :
  - **Membres en service** : seulement la clôture automatique d'un service jamais terminé (12 h par défaut). Les prises et fins de service arrivent du bot Discord par webhook (section 8) ; l'état de la réception s'affiche en tête de l'onglet.
  - **Agenda partagé** : seules les catégories où Ticket Tool crée les tickets ; les droits de consultation, création et modification se règlent pour chaque grade dans **Grades**.
- **Apparence** (facultatif) : remplacer logos, icônes et image de partage.

Puis :
- **Comptabilité → Rémunération** (permission « Gérer la comptabilité ») : pour chaque grade, salaire fixe et interrupteurs (salaire, prime de vente, prime de location : un interrupteur coupé ne verse rien), **taux horaire** des grades payés à l'heure (stagiaires) ; puis les **paliers de primes** (ventes, locations). Le relevé Tablettes collé chaque semaine doit contenir la colonne « Heures de service » (format `2h30min`).
- **Ressources humaines → Comment la fiche est remplie** (permission « Régler le recrutement ») : grade donné à l'arrivée et questions du formulaire de candidature du bot qui remplissent prénom, nom, ID employé, téléphone, RIB.

## 8. Bots et ordinateur en jeu

- **Bot Discord, candidatures** : dans le salon panneau du bot, *Monitoring → Ajouter un webhook*, type **Candidatures** (`recruitment.updated`), URL `https://dynasty8.fbfa.fr/webhooks/bot`. Le secret, affiché une seule fois, va dans `BOT_WEBHOOK_SECRETS` du `.env`, puis `docker compose up -d`. Une candidature passée « Acceptée » sur Discord crée la fiche dans Ressources humaines.
- **Bot Discord, membres en service** : dans le panneau *Monitoring → Ajouter un webhook*, choisir le type **Prises et fins de service** (`monitoring.duty`) et la même URL `https://dynasty8.fbfa.fr/webhooks/bot`. Ajouter aussi le secret affiché par le bot à `BOT_WEBHOOK_SECRETS` (secrets séparés par des virgules), puis `docker compose up -d`. Le site ne lit plus de salon Discord pour suivre les services.
- **Bot de ventes** : il envoie chaque vente à `POST https://dynasty8.fbfa.fr/api/stats/ventes`, avec l'en-tête `Authorization: Bearer <STATS_BOT_SECRET>` et un corps JSON (`identite`, `type` : `Vente` ou `Location`, `semaine` au format `S36-26`, `achat`, `loc`, `dateVente` jj/mm/aaaa, et les autres colonnes du registre : voir `server/src/entreprise/stats/ventes.ts`). Réponse `201` (enregistrée) ou `200` (déjà reçue). Tant que ce bot n'est pas en place, les primes viennent du Google Sheets de la Direction.
- **Ordinateur en jeu (FolkOS)** — à transmettre à l'opérateur FolkOS :
  - adresse de connexion « IG » à déclarer dans son broker `access` : **`https://dynasty8.fbfa.fr/auth/folkos`** (slug suggéré : `dynasty8`) ;
  - le site tourne sur la même machine que son validateur `id` (§ 1.7) ;
  - le site respecte déjà son cahier des charges (cadrage complet sans `X-Frame-Options`, cookie `SameSite=None; Secure`, SDK clavier et suivi d'adresse, aucune boîte de dialogue native) : détail dans [docs/folkos.md](../docs/folkos.md), dernier tableau.

## 9. Vérifications

| Vérifier | Résultat attendu | Sinon |
|---|---|---|
| https://dynasty8.fbfa.fr | la vitrine s'affiche, cadenas valide | nginx (§ 5), `docker compose ps` |
| Connexion Discord, puis une page de l'espace agents | connecté, menu complet | redirection Discord (§ 2.1), `DISCORD_*` |
| Gestion → Grades → un grade → Rôle Discord | liste des rôles par leur nom | bot pas invité ou jeton faux (§ 2) |
| Envoi d'une photo sur une annonce | photo affichée | « L'envoi d'images n'est pas encore configuré » : `STORAGE_URL` / `STORAGE_TOKEN` |
| Bouton « WebMap » de la vitrine | la carte s'affiche **dans la page** du site | `502` : adresse de la WebMap injoignable depuis le conteneur ; `503` : pas encore réglée (§ 7) ; certificat de `carte.dynasty8.fbfa.fr` |
| https://carte.dynasty8.fbfa.fr ouvert directement | renvoie vers la page WebMap du site (voulu : la carte ne se consulte que sur le site) | — |
| Une page de cohérence | la présentation Google Slides s'affiche | lien manquant dans Paramètres → Liens, ou présentation non partagée |
| Paramètres → Discord, Paramètres → Google Sheets et carte | états « lu » sans erreur | message affiché dans l'état, droits du bot (§ 2.3) ou partage du classeur |
| Ordinateur en jeu | le site s'affiche ; « Se connecter IG » ouvre une session | page blanche : `FOLKOS_HOTE` / `FOLKOS_CADRES`, console F8 (« ancestor violates frame-ancestors ») ; erreur de connexion : message sur la page de connexion, `FOLKOS_ID_BASE` joignable depuis le conteneur |
| `docker logs dynasty8-backup` | une première sauvegarde dans `backups/` | droits du dossier `backups` (§ 4) |

## 10. Au quotidien

Dans `/opt/dynasty8` :
- **mise à jour** : `git pull && docker compose up -d --build`, puis `docker image prune -f`. Les migrations de la base s'appliquent seules au démarrage. Avant une mise à jour qui touche la configuration, relire le `.env` : le site refuse de démarrer sur un réglage manquant ;
- **journaux** : `docker logs -f dynasty8-app` ; **état** : `docker compose ps` ; **ressources** : `docker stats`;
- **sauvegardes** : `backups/`, une par jour, 7 jours gardés. **Les copier régulièrement hors du serveur** (une sauvegarde qui reste sur la même machine disparaît avec elle). Restauration : [server/README.md](../server/README.md#sauvegardes-de-la-base) ;
- **secret compromis** : le changer dans `.env`, puis `docker compose up -d` (changer `SESSION_SECRET` déconnecte tout le monde ; `POSTGRES_PASSWORD` ne se change pas ainsi).

## 11. Liste de contrôle finale

- [ ] DNS des deux domaines vers le VPS ; ports 80 et 443 ouverts, 3010 fermé
- [ ] `.env` complet (§ 3), en `600`, sans `DEV_LOGIN` ni `simulation`
- [ ] `docker compose ps` : tout « Up », app et base « healthy »
- [ ] deux certificats (site et carte), renouvellement testé
- [ ] redirection Discord ajoutée ; bot invité avec ses droits
- [ ] propriétaire connecté en premier ; grades créés et liés à leurs rôles
- [ ] Paramètres : quatre onglets renseignés (dont les quatre présentations, le Google Sheets partagé, la WebMap, la clôture automatique des services et les catégories de tickets)
- [ ] Droits de l'agenda réglés pour chaque grade dans **Grades** : événements d'équipe, puis événements adressés à un grade
- [ ] Comptabilité → Rémunération et paliers de primes ; Ressources humaines → recrutement réglé
- [ ] webhooks « Candidatures » et « Prises et fins de service » créés ; leurs secrets sont dans `BOT_WEBHOOK_SECRETS`
- [ ] `STATS_BOT_SECRET` transmis en privé au bot de ventes
- [ ] adresse `https://dynasty8.fbfa.fr/auth/folkos` déclarée à l'opérateur FolkOS ; site testé dans l'ordinateur en jeu
- [ ] toutes les vérifications du § 9 passées
- [ ] première sauvegarde présente, copie hors serveur prévue
