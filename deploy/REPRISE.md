# Reprise des données de l'ancien site Dynasty 8

À faire **une seule fois**, au moment de la bascule vers la nouvelle version, sur le serveur qui l'héberge. Le script lit une copie de la base de l'ancien site et remplit la base neuve du nouveau : comptes et grades, biens (avec leurs photos), profils, messagerie, agendas, fiches RH, candidatures du bot, ventes, tableur et ses archives, comptabilité.

**Ordre impératif :** nouveau site installé et démarré (il crée ses tables au démarrage), **personne ne s'y est encore connecté**, reprise, puis seulement la première connexion. Le script refuse de tourner si la nouvelle base contient déjà un compte, un bien, une fiche RH ou une vente : il conserve les identifiants (adresses des annonces, liens entre tables) et ne fusionne pas.

## 1. Sauvegarde de l'ancienne base

Sur le serveur de l'ancien site, arrêter le service (plus aucune écriture), puis :

```bash
pg_dump -Fc -U dynasty8_admin -h 127.0.0.1 dynasty8 > dynasty8_reprise.dump
```

Copier `dynasty8_reprise.dump` dans le dossier `backups/` du nouveau site : exclu de git **et de l'image Docker** (ailleurs dans le dossier du site, la copie partirait dans l'image à la prochaine reconstruction).

## 2. Restauration dans une base à part, à côté de la nouvelle

Dans le dossier du nouveau site (conteneurs démarrés) :

```bash
docker compose exec -T db createdb -U site ancienne
docker compose exec -T db pg_restore -U site -d ancienne --no-owner --no-privileges < backups/dynasty8_reprise.dump
```

Des messages sur des rôles inconnus (`dynasty8_app`…) sont sans conséquence : `--no-owner --no-privileges` les ignore.

## 3. Essai, puis reprise

Le mot de passe est celui de `POSTGRES_PASSWORD` dans le `.env` du nouveau site.

```bash
# essai : affiche ce qui serait repris et ce qui pose problème ; rien n'est écrit
docker compose exec -e ANCIENNE_DATABASE_URL='postgres://site:<POSTGRES_PASSWORD>@db:5432/ancienne' app node dist/entreprise/reprise/reprise.js --essai

# reprise
docker compose exec -e ANCIENNE_DATABASE_URL='postgres://site:<POSTGRES_PASSWORD>@db:5432/ancienne' app node dist/entreprise/reprise/reprise.js
```

Tout est écrit dans une seule transaction : en cas d'erreur, rien n'est gardé, et la commande peut être relancée après correction. Garder le compte rendu affiché (copier-coller) : il liste ce qui n'a pas pu être repris.

## Ce que le compte rendu peut signaler

| Ligne | Signification | Que faire |
|---|---|---|
| `Compte non repris (sans ID Discord)` | Compte jamais connecté par Discord (pré-autorisé, ou issu des anciens codes d'accès). | Rien : la personne se connectera par Discord ; son rôle Discord lui donnera son grade, ou la Direction la validera. |
| `Photo perdue (bien …)` | Photo d'une annonce collée par lien, dont le lien ne répond plus (les liens Discord expirent au bout d'un jour). | Remettre une photo sur l'annonce, depuis l'espace agents. |
| `Photo à recopier` (essai seulement) | Photo hébergée ailleurs que sur `storage.fbfa.fr` : la reprise la recopiera sur le stockage du site. | Rien. |

## Ce qui change pour les comptes

- Les 11 grades de l'ancien site sont recréés (Développeur web, Patron, Co Patron, Manager, DRH, Secrétaire de Direction, Référent Immobilier, Agent Expert, Agent, Agent Novice, Stagiaire), avec les droits d'alors : la Direction gère comptes, annonces, statistiques et comptabilité ; les grades commerciaux, les annonces ; les droits RH suivent l'ancienne matrice. Patron, Co Patron et Développeur web ont tous les droits RH et règlent les grades.
- **Aucun grade n'est encore lié à un rôle Discord** : après la reprise, le propriétaire du serveur Discord se connecte le premier, puis renseigne le rôle Discord de chaque grade (page Grades). Ensuite, la connexion est réservée aux membres du serveur Discord de l'agence, et un rôle retiré sur Discord retire le grade.
- Un compte suspendu ou désactivé sur l'ancien site arrive « refusé » (il reste, sans accès) ; un compte en attente reste en attente.

## Après la reprise

```bash
docker compose exec -T db dropdb -U site ancienne   # la copie n'est plus utile
rm backups/dynasty8_reprise.dump                     # données personnelles : ne pas la laisser traîner
```
