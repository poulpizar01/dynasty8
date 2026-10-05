# Notes propres à ce site — Dynasty 8

Fichier **personnalisable**, importé par `CLAUDE.md` : ce qu'un agent (ou un développeur) doit savoir de Dynasty 8 en particulier.

## L'entreprise

- Activité : agence immobilière RP du serveur GTA RP **FlashbackFA** (univers fictif). Vitrine : catalogue des biens (habitations, intérieurs, garages, exclusifs), cohérences RP par zone, VIP PLUS, équipe, FAQ. Espace agents : gestion des biens, messagerie, agenda, statistiques et primes, comptabilité / DOT, ressources humaines.
- Site : https://dynasty8.fbfa.fr/, aussi affiché dans l'ordinateur en jeu (FolkOS, `docs/folkos.md`).
- Serveur Discord : *à compléter* (rôles liés aux grades, webhooks abonnés).

## Migration en cours (branche `migration-modele`)

Le site est porté depuis l'ancienne version (JavaScript + SQL écrit à la main), rangée dans `ancien/` le temps du portage (jamais servie : seuls les fichiers de premier niveau le sont). Étapes : 1) FolkOS dans le socle du modèle ✔ ; 2) squelette, vitrine et catalogue ✔ ; 3) modules de la gestion un par un ; 4) reprise des données de la base actuelle ; 5) documentation de déploiement pour l'opérateur. `ancien/` disparaît à la fin.

## Ce que le site ajoute au socle

| Domaine | Permission | Pages | Routes (`server/src/entreprise/`) | Tables (`entreprise.prisma`) |
|---|---|---|---|---|
| Catalogue (vitrine) | lecture publique ; `biens` voit aussi les biens masqués | `habitation`, `interieurs`, `garages`, `exclusifs`, `bien`, `accueil` (racine) | `routes/vitrine.ts` : `GET /api/biens`, `GET /api/equipe` | `biens`, `profils` |
| Annonces internes (exemple du modèle, à remplacer) | `annonces` | `gestion/annonces.html` | `routes/annonces.ts` | `annonces` |

## Vitrine

- Pages à la racine ; scripts communs `layout.js` (en-tête, pied, cadre, appels à l'API), `biens.js` (catalogue), `aurora.js` (fond WebGL) ; feuille `style.css` (jetons `--d8-*`) ; `theme.css` porte les polices (servies depuis `assets/fonts/`) et les variables lues par la gestion et la signature.
- Les API de la vitrine renvoient les champs en **snake_case** (`bienPublic`, `src/entreprise/biens.ts`) : la forme de l'ancien site, lue par `biens.js`. Erreurs : `{ error }` (socle) ; `appelAPI` lit aussi l'ancien `{ erreur }`.
- En jeu (`<html class="en-jeu">`, ou `window.D8_EN_JEU`) : aucun effet WebGL (GPU partagé avec le jeu).

## Pièges propres à ce site

- Les `{{cle}}` de `site.json` sont remplacés dans les `.html` et `.css` : ne jamais en mettre dans une chaîne JavaScript (voir CLAUDE.md).
- Lien « WebMap » (`layout.js`, `LIEN_WEBMAP`) : l'ancien site servait la carte à travers un mandataire sur son propre domaine (`/api/carte/`), non repris (voir la décision à prendre dans le compte rendu de l'étape 2).
