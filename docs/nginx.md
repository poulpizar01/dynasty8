# nginx : exposer le site en HTTPS

Le conteneur du site n'écoute que sur `127.0.0.1:<HOST_PORT>` : il est invisible depuis Internet. **nginx**, installé sur la machine (hors Docker), reçoit les visiteurs sur les ports 80 et 443, gère le certificat HTTPS et transmet les requêtes au site. Un seul nginx sert tous les sites du VPS : un fichier de configuration par site.

```
Visiteur ──HTTPS 443──▶ nginx (VPS) ──HTTP──▶ 127.0.0.1:<HOST_PORT> ──▶ conteneur <SITE_ID>-app (port 3000)
```

## Mise en place
Modèle de configuration : [`server/deploy/nginx.conf.example`](../server/deploy/nginx.conf.example).
```bash
sudo cp server/deploy/nginx.conf.example /etc/nginx/sites-available/<SITE_ID>
sudo nano /etc/nginx/sites-available/<SITE_ID>          # remplacer __DOMAIN__ (domaine), __PORT__ (HOST_PORT du .env) et __SITE_ID__ (SITE_ID, tirets en _)
sudo ln -s /etc/nginx/sites-available/<SITE_ID> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx            # nginx -t vérifie la syntaxe avant de recharger
sudo certbot --nginx -d <domaine>                      # ajoute le certificat, le bloc 443 et la redirection http → https
```
Prérequis de certbot : le domaine pointe déjà sur le VPS (`dig +short <domaine>`) et le port 80 est ouvert. Le certificat se renouvelle tout seul (test : `sudo certbot renew --dry-run`).

## Ce que fait chaque réglage
| Réglage | Pourquoi |
|---|---|
| `limit_req_zone …` (hors du bloc `server`) et `limit_req` | Limite de débit par adresse IP : 30 requêtes par seconde, rafales de 120 tolérées, `429` au-delà. Le site limite déjà son API ; nginx couvre aussi les pages et les fichiers. Le nom de la zone (`__SITE_ID__`) doit être unique sur la machine : une par site. |
| `server_tokens off` | nginx n'annonce plus sa version dans ses réponses et ses pages d'erreur. |
| `location = /healthz { return 404; }` | Le contrôle de santé (une lecture en base par appel) n'est pas joignable d'Internet : Docker interroge le conteneur directement. |
| `client_max_body_size 16m` | Taille maximale d'une requête. Le site accepte des images jusqu'à 15 Mo ; sans cette ligne, nginx refuse tout au-delà de 1 Mo (erreur 413). |
| `proxy_pass http://127.0.0.1:__PORT__` | Transmet la requête au conteneur du site. |
| `Host`, `X-Real-IP`, `X-Forwarded-For` | Donnent au site le vrai domaine et la vraie adresse IP du visiteur (le site fait confiance à un seul proxy : `trust proxy 1`). Sans eux, les limites de requêtes compteraient tous les visiteurs comme un seul. |
| `X-Forwarded-Proto` | Indique au site que le visiteur est en HTTPS. Indispensable : le cookie de session est marqué `Secure` et ne serait jamais envoyé sans cette information. |
| `gzip` | CSS, JS et JSON compressés (≈ 4× moins lourds). |

Ne pas ajouter de cache nginx sur les pages : elles sont personnalisées par site et par session. Les images de `assets/` portent déjà leur propre durée de cache (7 jours).

## Routes longues et flux temps réel de l'entreprise
nginx coupe une requête sans réponse au bout de 60 s et met les réponses en tampon. Une route de l'entreprise qui dure plus longtemps (envoi d'image suivi du dépôt sur le stockage, export) ou qui garde la connexion ouverte (flux Server-Sent Events) a son propre bloc `location`, placé avant `location /` :
```nginx
# envoi d'image : jusqu'à 2 minutes (exemple commenté dans nginx.conf.example)
location ~ ^/api/articles/\d+/photo$ { …mêmes en-têtes que location /… proxy_read_timeout 120s; }
# flux temps réel (SSE) : ni tampon ni coupure à 60 s
location = /api/<flux> { …mêmes en-têtes… proxy_set_header Connection ''; proxy_buffering off; proxy_read_timeout 1h; }
```
Le fichier de configuration nginx vit sur le VPS : un bloc ajouté dans un site se reporte aussi dans `/etc/nginx/sites-available/<SITE_ID>`.

## Plusieurs sites sur le même VPS
Chaque site a son `SITE_ID`, son `HOST_PORT`, son domaine et son fichier dans `sites-available`. nginx choisit le site d'après le domaine demandé (`server_name`). Exemple : `garage-a` sur le port 3001 pour `a.exemple.fr`, `garage-b` sur 3002 pour `b.exemple.fr`.

## Dépannage
| Symptôme | Cause probable |
|---|---|
| `502 Bad Gateway` | Le conteneur est arrêté ou redémarre : `docker compose ps`, `docker logs <SITE_ID>-app`. Ou `__PORT__` ≠ `HOST_PORT`. |
| `413 Request Entity Too Large` à l'envoi d'une image | `client_max_body_size` absent ou trop bas. |
| `504` sur un envoi d'image, alors que l'image est enregistrée | Route longue sans son bloc `location` (`proxy_read_timeout`). |
| Connexion Discord qui « ne tient pas » (retour à la page de connexion) | Site testé en `http://`, ou `X-Forwarded-Proto` absent. |
| `nginx -t` : « zone … is already bound » | Deux sites ont la même zone `limit_req_zone` : `__SITE_ID__` mal remplacé. |
| `429` sur des pages normales | Beaucoup de visiteurs derrière la même adresse IP : relever `rate` ou `burst`. |
| Mauvais site affiché | `server_name` erroné, ou lien manquant dans `sites-enabled`. |

Journaux nginx : `/var/log/nginx/access.log` et `/var/log/nginx/error.log`.
