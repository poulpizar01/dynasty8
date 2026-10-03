# Modèle de site d'entreprise RP — Roxwood Network

Base réutilisable pour les sites des entreprises RP : une **vitrine** publique et un **espace de gestion** réservé aux employés (connexion Discord), servis par le même serveur Node (Express + PostgreSQL), déployés avec Docker derrière nginx.

Contrairement au [modèle des sites famille](https://github.com/poulpizar01/roxwood-network-site-famille-template), où l'espace membre est le même partout, chaque entreprise a une gestion différente (stocks, factures, rendez-vous, recrutement…). Ce modèle impose donc moins de choses : un **socle** commun — sécurité, connexion, comptes, grades et permissions, stockage des images, réception des webhooks du bot, Docker, nginx, sauvegardes, règles de code — et laisse **libres la vitrine comme la gestion**.

## Ce qui est commun, ce qui est propre à chaque site

| | **Socle — mutualisé, identique sur tous les sites** | **Entreprise — personnalisable, site par site** |
|---|---|---|
| Quoi | Serveur et sécurité, connexion Discord, comptes, grades et permissions, stockage d'images, webhooks du bot, base, déploiement, documentation, règles | La vitrine, la direction artistique, **toutes les pages de gestion**, les routes et les tables métier |
| Fichiers | `server/src/index.ts`, `server/src/socle/`, `server/prisma/schema/socle.prisma` (+ migrations `*_socle_*`), `server/Dockerfile`, `server/package.json`, `server/deploy/`, `socle/`, `compose*.yaml`, `.env.example`, `docs/`, `.claude/skills/`, `CLAUDE.md` | `site.json`, `theme.css`, `index.html`, `styles.css`, `main.js`, `404.html`, `confidentialite.html`, `assets/`, `gestion/`, `server/src/entreprise/`, `server/prisma/schema/entreprise.prisma`, `ENTREPRISE.md` |
| Liberté | Aucune modification dans un site : les améliorations se font **dans le modèle**, puis chaque site les récupère | Totale, dans le respect des règles du socle (voir [CLAUDE.md](CLAUDE.md)) |

Ce que le socle apporte, prêt à l'emploi :
- **Connexion Discord** réservée aux membres du serveur Discord de l'entreprise, comptes en attente de validation, propriétaire du serveur Discord avec tous les droits ;
- **Grades et permissions** : chaque grade coche des permissions (celles du socle et celles que déclare l'entreprise), peut être lié à un rôle Discord (attribué et retiré à la connexion) ; personne ne gère ce qui est au-dessus de lui ni n'accorde ce qu'il n'a pas ;
- **Contrôle d'accès** des pages et des routes côté serveur, politique de sécurité stricte (CSP à nonce), protection contre les requêtes d'un autre site, limites de requêtes ;
- **Images** : contrôle, réencodage WebP et dépôt sur le stockage distant (CDN) ;
- **Webhooks du bot Discord entreprise** ([roxwood-network-entreprise](https://github.com/poulpizar01/roxwood-network-entreprise)) : signature vérifiée, dédoublonnage, branchement sur le code de l'entreprise ;
- **Exploitation** : Docker (site, base, sauvegardes quotidiennes), nginx + HTTPS, plusieurs sites sur un même VPS, contrôle de santé, arrêt propre ;
- **Règles et outils** pour Claude Code : [CLAUDE.md](CLAUDE.md), commande `/audit`.

Et un **point de départ** côté entreprise, à transformer : une vitrine sobre, une gestion avec connexion, accueil, mon compte, comptes, grades, et un exemple métier complet (annonces internes : table, permission, routes, page, traitement d'un webhook).

En bas de chaque vitrine : la signature **« Développé par Roxwood Network »** (à garder, style dans `socle/signature.css`).

## Créer un nouveau site
1. **Nouveau dépôt** : sur GitHub, bouton **Use this template** → nom du dépôt du site. Le cloner sur le poste.
2. **Identité** : remplir [`site.json`](site.json). `nom` et `description` sont obligatoires, `couleur` (accent, `#rrggbb`) et `discord` (invitation) facultatives ; toute autre clé texte est libre (`slogan`, `secteur`, `adresse`, `horaires`…). Dans une page, `{{cle}}` insère la valeur, `{{Cle}}` la même avec une majuscule, `{{url}}` l'adresse du site (`BASE_URL`).
3. **Direction artistique** : [`theme.css`](theme.css) (couleurs, polices dans `assets/fonts/`, formes), chargé par toutes les pages. Puis la vitrine ([`index.html`](index.html), [`styles.css`](styles.css)) et la gestion ([`gestion/`](gestion/)) : libres.
4. **Visuels** (dans `assets/`) : `logo.png` (carré, fond transparent), `favicon.png`, `og-image.jpg` (1200 × 630). Ne pas toucher à `roxwood.png`.
5. **Métier** : déclarer les permissions dans [`server/src/entreprise/permissions.ts`](server/src/entreprise/permissions.ts), les tables dans [`entreprise.prisma`](server/prisma/schema/entreprise.prisma), les routes dans `server/src/entreprise/routes/`, et brancher le tout dans [`server/src/entreprise/index.ts`](server/src/entreprise/index.ts) (niveau d'accès des pages, routes, webhooks). L'exemple « annonces » montre chaque étape ; le garder, le transformer ou le retirer (supprimer le modèle `Annonce`, la route, la page, puis créer une migration).
6. **Notes** : réécrire [`ENTREPRISE.md`](ENTREPRISE.md) (ce que fait le site, ses tables, ses pièges) et compléter [`confidentialite.html`](confidentialite.html) avec ce que le site enregistre.
7. **Déployer** : [server/README.md](server/README.md).

### Récupérer plus tard les améliorations du socle
```bash
git remote add modele https://github.com/poulpizar01/roxwood-network-site-entreprise-template.git   # une seule fois
git fetch modele && git merge modele/main --allow-unrelated-histories                               # --allow-… : la première fois seulement
```
Les conflits éventuels ne portent que sur les fichiers personnalisables (`site.json`, `theme.css`, `gestion/`, `server/src/entreprise/`…) : y garder la version du site. Une nouvelle migration du socle arrive avec la mise à jour : la prod l'applique au démarrage ; en dev, `docker compose exec app npx prisma migrate dev` (s'il propose de remettre la base de dev à zéro, accepter). Un site qui a modifié un fichier du socle perd cette garantie : corriger plutôt dans le modèle.

## Documentation
| Sujet | Où |
|---|---|
| Règles du socle, conventions, pièges (pour Claude Code et les développeurs) | [CLAUDE.md](CLAUDE.md) |
| Notes propres au site | [ENTREPRISE.md](ENTREPRISE.md) |
| Déployer sur un VPS, mettre à jour, sauvegarder, revenir en arrière, application Discord | [server/README.md](server/README.md) |
| API du socle (routes, droits, limites) et ajout de routes par l'entreprise | [docs/api.md](docs/api.md) |
| Webhooks du bot Discord entreprise | [docs/webhooks.md](docs/webhooks.md) |
| nginx : HTTPS, rôle de chaque réglage, plusieurs sites, dépannage | [docs/nginx.md](docs/nginx.md) |
| Stockage des images (disque ou CDN), contrat attendu du service | [docs/stockage.md](docs/stockage.md) |
| Audits par angle : prompts, commande `/audit` dans Claude Code | [docs/audits.md](docs/audits.md) |

## Développement
Prérequis : Docker Desktop.
```bash
docker compose up          # http://localhost:3000  ·  gestion : http://localhost:3000/gestion/
```
- Créer un `.env` à la racine (ignoré par git) contenant au moins `SITE_ID=<nom du site>` : sans lui, le projet Docker s'appelle `site`, et deux sites en dev partageraient la même base. Ne pas copier `.env.example` (sa ligne `COMPOSE_FILE` désactive les réglages de dev).
- Connexion sans Discord (bouton de connexion → compte « Dev local », propriétaire, tous les droits). Pour essayer un autre niveau d'accès : `http://localhost:3000/auth/discord?compte=<ID Discord>` ouvre la session d'un compte existant (dev uniquement).
- Pages, CSS, JS et `site.json` : rafraîchir le navigateur suffit. Serveur (`server/src`) : `docker compose restart app`.
- Base : après une modification de `server/prisma/schema/entreprise.prisma`, `docker compose exec app npx prisma migrate dev --name <description>`, et **committer le dossier de migration créé**. `docker compose down -v` remet la base à zéro.
- Tester les webhooks du bot en local : voir [docs/webhooks.md](docs/webhooks.md#tester-en-local).

## Organisation
- `site.json` — identité ; `theme.css` — couleurs et polices ; `ENTREPRISE.md` — notes du site
- `index.html`, `styles.css`, `main.js`, `404.html`, `confidentialite.html`, `robots.txt`, `sitemap.xml` — vitrine
- `gestion/` — espace employés (pages libres ; `index`, `attente`, `refuse`, `accueil` : noms imposés)
- `socle/` — scripts et styles communs servis au navigateur (`socle.js`, `signature.css`)
- `assets/` — logo, favicon, image de partage, polices, logo Roxwood
- `server/src/socle/` — socle du serveur ; `server/src/entreprise/` — code métier du site ; `server/src/index.ts` — assemblage
- `server/prisma/schema/` — `socle.prisma` + `entreprise.prisma` ; `server/prisma/migrations/` — migrations des deux
- `server/deploy/` — configuration nginx ; `compose.yaml` — site, base et sauvegardes ; `compose.override.yaml` — dev
- `docs/` — documentation ; `.claude/skills/` — commandes Claude Code (`/audit`)
