# Ordinateur en jeu (FolkOS)

Sur un serveur FiveM qui fournit un ordinateur en jeu (FolkOS), le site peut s'afficher dans le navigateur de cet ordinateur, et les employés s'y connecter sans Discord (« Se connecter IG »). **Désactivé par défaut** : sans réglage, le site refuse d'être affiché dans une autre page (`frame-ancestors 'none'`) et rien ne change.

## Réglages (`.env`)
| Variable | Effet |
|---|---|
| `FOLKOS_HOTE` | Origine de l'ordinateur en jeu (`https://…`, sans chemin), fournie par l'opérateur. Active l'affichage en iframe et le SDK de l'opérateur. |
| `FOLKOS_CADRES` | Facultatif : autres pages autorisées à encadrer le site (origines `https://`, joker de sous-domaine admis, ou schémas comme `nui:`), séparées par des espaces. |
| `FOLKOS_ID_BASE`, `FOLKOS_CLIENT_ID`, `FOLKOS_CLIENT_SECRET` | Connexion « IG » : adresse du validateur SSO de l'opérateur (http admis : il est souvent sur la même machine) et identifiants du site. Les trois ensemble, et `FOLKOS_HOTE` avec. Validateur sur la même machine : `http://host.docker.internal:<port>` (déclaré dans `compose.yaml`), à condition qu'il écoute aussi sur l'adresse du pont Docker (`ip -4 addr show docker0`) et pas seulement sur `127.0.0.1`, et que le pare-feu de la machine laisse passer les réseaux Docker (172.16.0.0/12) vers son port ; sinon, son adresse publique en https. |

Le serveur refuse de démarrer sur un réglage incomplet ou mal formé.

## Ce qui change quand `FOLKOS_HOTE` est réglé
- **Affichage en iframe** : `frame-ancestors` autorise le site lui-même, `FOLKOS_HOTE`, les cadres de FiveM (`https://cfx-nui-external-iframe`, `nui://game`, `nui:`) et `FOLKOS_CADRES`. Le navigateur FiveM vérifie chaque ancêtre : s'il en manque un, la page reste blanche sans message. `X-Frame-Options` n'est plus envoyé (il ne sait pas exprimer une liste et contredirait la règle).
- **Cookie de session** en `SameSite=None; Secure` : dans l'iframe, le site est « un autre site » pour le navigateur, qui n'y enverrait jamais un cookie `Lax`. Le contrôle de l'en-tête `Origin` (`server/src/index.ts`) devient alors la seule protection contre les requêtes d'un autre site : le garder. En `http://localhost` (dev), le cookie reste `Lax`.
- **SDK de l'opérateur** : le serveur ajoute `/socle/folkos.js` en tête de chaque page HTML (aucune page n'a à l'inclure). Hors iframe il ne fait rien ; dans l'ordinateur en jeu, il charge `fbfa-game.js` (clavier rendu au site dès qu'un champ a le focus, Échap laissé à la page) et `fbfa-bridge.js` (la barre d'adresse suit la page) depuis `FOLKOS_HOTE`, pose la classe **`en-jeu`** sur `<html>` et ouvre les liens `target="_blank"` dans le cadre. La politique de sécurité autorise `FOLKOS_HOTE` pour les scripts, styles, images et requêtes.
- **À faire côté site** : couper ce qui coûte au GPU quand `<html>` a la classe `en-jeu` (WebGL, animations plein écran : le GPU est partagé avec le jeu) ; aucune boîte de dialogue native (`alert`, `confirm`, `prompt`) ni `beforeunload`, que le navigateur FiveM n'affiche pas ; mentionner dans `confidentialite.html` que, en jeu, la page charge le SDK de l'opérateur.

## Connexion « IG »
Le broker de l'opérateur ouvre `<BASE_URL>/auth/folkos?folkos_ticket=…` (adresse à lui déclarer) ; `&next=/gestion/…` facultatif.
1. Le ticket est vérifié auprès de `FOLKOS_ID_BASE/sso/verify` (10 s au plus) ; seule cette réponse fait foi.
2. Le compte est retrouvé par l'**ID Discord** de l'identité renvoyée. Il doit déjà exister : la première connexion se fait par Discord, depuis un navigateur.
3. FolkOS ne connaît ni le serveur Discord ni les rôles : la connexion IG n'est acceptée que si la **dernière connexion Discord date de moins de 30 jours**. Ainsi, un employé parti du serveur Discord perd aussi l'accès en jeu au plus tard 30 jours après sa dernière connexion Discord.
4. Session ouverte comme pour Discord ; compte en attente → page d'attente ; sinon `next` (chemin du site uniquement) ou l'accueil.

Erreurs renvoyées à `gestion/?erreur=folkos-…` : `config`, `ticket`, `reseau`, `inconnu`, `discord`, `serveur` (messages dans `gestion/index.html`).
