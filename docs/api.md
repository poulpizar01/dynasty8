# API du site

L'API du **socle** (identique sur tous les sites) et la façon d'y ajouter celle de l'**entreprise**. Toutes les réponses sont en JSON.

Une requête qui modifie quelque chose (`POST`, `PATCH`, `PUT`, `DELETE`) n'est acceptée que depuis les pages du site : un en-tête `Origin` différent de `BASE_URL` reçoit `403 { error: "origine refusée" }`. Un identifiant illisible dans l'adresse (`/api/comptes/abc`) donne `404`, une adresse `/api/…` inconnue aussi. Authentification par **cookie de session** (`site.sid`, `HttpOnly`, `Secure` en HTTPS, 7 jours : au-delà, nouvelle connexion Discord, qui revérifie l'appartenance au serveur, le grade et la propriété).

Les messages d'erreur destinés à l'utilisateur sont des phrases (`{ error: "Grade inconnu." }`) ; les codes techniques sont en minuscules à tirets (`non-connecte`, `attente`, `interdit`) — `socle.api()` affiche les premières telles quelles et traduit les seconds.

## Niveaux d'accès
| Garde (`socle/http.ts`) | Condition | Refus |
|---|---|---|
| — (public) | aucune | — |
| `...connecte` | session ouverte (compte éventuellement en attente ou refusé) | `401 non-connecte` |
| `...valide` | compte **validé** | `401` / `403 { error: "attente", statut }` |
| `...permission('cle')` | compte validé **et** permission `cle` (par son grade, ou propriétaire du serveur Discord) | `403 { error: "interdit", permission }` |

Pages de `gestion/` : mêmes niveaux, contrôlés par le serveur avant tout envoi (`server/src/index.ts`, d'après `entreprise.pages`) : pas connecté → `gestion/` (connexion) ; compte pas validé → `attente.html` ; permission manquante → `403` avec `refuse.html`. Page non déclarée : compte validé.

## Permissions et grades
- Permissions du socle : `comptes` (valider, refuser, renommer, changer de grade, supprimer un compte) et `grades` (créer, ordonner, modifier, supprimer un grade). Celles de l'entreprise : `server/src/entreprise/permissions.ts`.
- **Hiérarchie** : les grades sont ordonnés du sommet (position 0) à la base. Hors propriétaire, on ne gère que les comptes et les grades **strictement sous** son propre grade (un compte sans grade ne gère rien), et on n'accorde ou ne retire que des permissions qu'on détient.
- **Rôles Discord** : un grade peut être lié à un rôle Discord. À chaque connexion, le compte reçoit le plus haut grade dont il porte le rôle (et est validé d'office s'il n'avait pas été refusé) ; un grade lié à un rôle qu'il ne porte plus lui est retiré. Un grade sans rôle se donne à la main.

## Routes du socle
| Méthode et adresse | Accès | Rôle |
|---|---|---|
| `GET /auth/discord` | public | Démarre la connexion Discord (en dev avec `DEV_LOGIN=1` : connexion directe au compte « Dev local », ou `?compte=<ID Discord>`) |
| `GET /auth/discord/callback` | public | Retour de Discord : vérifie l'appartenance au serveur, crée ou met à jour le compte, son grade, son statut ; erreurs renvoyées à `gestion/?erreur=pas-membre\|oauth\|jeton\|discord\|serveur` |
| `GET /auth/folkos` | public | Connexion « IG » depuis l'ordinateur en jeu (si FolkOS est configuré, voir [folkos.md](folkos.md)) : `?folkos_ticket=` vérifié auprès du SSO, compte retrouvé par son ID Discord, `?next=` (chemin du site) honoré ; erreurs renvoyées à `gestion/?erreur=folkos-config\|ticket\|reseau\|inconnu\|discord\|serveur` |
| `POST /auth/logout` | public | Ferme la session |
| `GET /api/moi` | connecté | Mon compte : `id, discordId, pseudo, nom, avatar, statut, proprietaire, grade { cle, libelle, couleur }, permissions[]` (vide tant que le compte n'est pas validé) |
| `PATCH /api/moi` | validé | Changer son nom RP (`{ nom }`) |
| `DELETE /api/moi` | connecté | Supprimer son propre compte (validé ou non), après `avantSuppressionCompte`, puis fin de session |
| `GET /api/permissions` | validé | Toutes les permissions : `[{ cle, libelle, description }]` |
| `GET /api/annuaire` | validé | Comptes validés, du sommet à la base : `[{ id, nom, avatar, grade }]` |
| `GET /api/comptes` | `comptes` | Tous les comptes (en attente, validés, refusés), les plus récents d'abord |
| `PATCH /api/comptes/:id` | `comptes` | `{ statut?: "valide"\|"refuse"\|"attente", nom?, grade?: cle\|null }` — compte sous son grade, vers un grade sous le sien ; ni son propre compte, ni celui du propriétaire (sauf par lui) |
| `DELETE /api/comptes/:id` | `comptes` | Supprimer un compte sous son grade (pas le sien) |
| `GET /api/grades` | validé | Grades du sommet à la base : `[{ cle, libelle, position, couleur, permissions[], roleDiscordId }]` |
| `POST /api/grades` | `grades` | `{ libelle, cle?, couleur?, permissions[], roleDiscordId? }` — créé en bas de la hiérarchie ; `409` si la clé ou le rôle est déjà pris |
| `PATCH /api/grades/:cle` | `grades` | Mêmes champs (sauf `cle`) ; grade sous le sien |
| `PUT /api/grades/ordre` | `grades` | `{ ordre: [cle…] }` (tous les grades) ; hors propriétaire, les grades jusqu'au sien restent en place |
| `DELETE /api/grades/:cle` | `grades` | Grade sous le sien et porté par aucun compte (`409` sinon) |
| `POST /webhooks/bot` | signature du bot | Réception des événements du bot entreprise : voir [webhooks.md](webhooks.md) |
| `GET /healthz` | public (bloqué par nginx) | Santé du site pour Docker : `{ ok: true }` ou `503` |

Les grandes listes renvoyées par ces routes restent à la taille d'une entreprise RP (quelques centaines de comptes au plus) : pas de pagination.

## Limites de requêtes
| Portée | Limite |
|---|---|
| Toute l'API `/api` | 240 requêtes par minute et par compte (ou par adresse IP hors connexion) |
| Connexion `/auth` | 30 tentatives par quart d'heure et par adresse IP |
| Webhooks `/webhooks/bot` | 120 par minute et par adresse IP |
| Envoi d'images (`...recevoirImage`) | 20 par compte toutes les 10 minutes |

Au-delà : `429` avec un message lisible. Les en-têtes `RateLimit` et `RateLimit-Policy` indiquent le quota restant. Toutes les réponses de `/api` et `/auth` portent `Cache-Control: no-store` (rien de personnel gardé par le navigateur). Une route de l'entreprise peut ajouter sa propre limite : `limiter(minutes, nombre, message, parCompte)`, à importer de `socle/limites.ts` (jamais de `socle/security.ts` depuis le code de l'entreprise : `security.ts` lit `entreprise.csp`, et l'importer depuis une route crée une dépendance circulaire qui empêche le serveur de démarrer).

## Ajouter les routes de l'entreprise
```ts
// server/src/entreprise/routes/stocks.ts
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { body, entier, intParam, permission, text, valide } from '../../socle/http.js';

export const stocks = Router();
stocks.get('/api/stocks', ...valide, async (_req, res) => { res.json(await prisma.stock.findMany()); });
stocks.patch('/api/stocks/:id', ...permission('stocks'), async (req, res) => { /* req.compte : compte connecté */ });
```
Puis : la permission `stocks` dans `entreprise/permissions.ts`, le routeur dans `entreprise.routes`, la page dans `entreprise.pages`, et une ligne dans le tableau de `ENTREPRISE.md`.

Règles : adresses sous `/api/` (en français, au pluriel : `/api/factures/:id`) ; une garde en tête ; corps lus avec `body()` / `text()` / `entier()` ; `404` pour un identifiant inconnu (`intParam` rend `-1` pour un identifiant illisible) ; erreurs destinées à l'utilisateur en phrases ; aucune donnée renvoyée au-delà de ce que la page affiche.

Une route d'envoi d'image : `...permission('x'), ...recevoirImage`, puis `await enregistrerImage('dossier', req.file)` (voir `socle/images.ts` et [stockage.md](stockage.md)). Une image refusée lève `ImageRefusee`, transformée en `400` avec son message.
