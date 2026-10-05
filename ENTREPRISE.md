# Notes propres à ce site — Dynasty 8

Fichier **personnalisable**, importé par `CLAUDE.md` : ce qu'un agent (ou un développeur) doit savoir de Dynasty 8 en particulier.

## L'entreprise

- Activité : agence immobilière RP du serveur GTA RP **FlashbackFA** (univers fictif). Vitrine : catalogue des biens (habitations, intérieurs, garages, exclusifs), cohérences RP par zone, VIP PLUS, équipe, FAQ. Espace agents : gestion des biens, messagerie, agenda, statistiques et primes, comptabilité / DOT, ressources humaines.
- Site : https://dynasty8.fbfa.fr/, aussi affiché dans l'ordinateur en jeu (FolkOS, `docs/folkos.md`).
- Serveur Discord : *à compléter* (rôles liés aux grades, webhooks abonnés).

## Migration en cours (branche `migration-modele`)

Le site est porté depuis l'ancienne version (JavaScript + SQL écrit à la main), rangée dans `ancien/` le temps du portage (jamais servie : seuls les fichiers de premier niveau le sont). Étapes : 1) FolkOS dans le socle du modèle ✔ ; 2) squelette, vitrine et catalogue ✔ ; 3) modules de la gestion un par un (annonces ✔, profil ✔, messagerie ✔, agenda ✔, RH ✔, ventes & statistiques ✔, comptabilité ✔, WebMap ✔) ; 4) reprise des données de la base actuelle ✔ (script `server/src/entreprise/reprise/reprise.ts`, mode d'emploi `deploy/REPRISE.md`) ; 5) documentation de déploiement pour l'opérateur ✔ (`deploy/POUR-NICOLAS.md`, configurations nginx dans `deploy/nginx/`). `ancien/` disparaît à la fin.

## Ce que le site ajoute au socle

| Domaine | Permission | Pages | Routes (`server/src/entreprise/`) | Tables (`entreprise.prisma`) |
|---|---|---|---|---|
| Catalogue (vitrine) | lecture publique ; `biens` voit aussi les biens masqués | `habitation`, `interieurs`, `garages`, `exclusifs`, `bien`, `accueil` (racine) | `routes/vitrine.ts` : `GET /api/biens`, `GET /api/equipe` | `biens`, `profils` |
| Annonces (gestion des biens) | `biens` | `gestion/biens.html` + `biens.js` | `routes/biens.ts` : `POST /api/biens`, `PUT` / `DELETE /api/biens/:id`, `POST /api/biens/photo` (fichier), `POST /api/biens/photo-lien` (lien téléchargé par le serveur) | `biens`, `photos` |
| Profil public (page équipe) | chacun le sien ; `comptes` pour un agent sous son grade | `gestion/compte.html` (« Mon profil »), fenêtre dans `comptes.html` ; éditeur commun `gestion/profil.js` | `routes/profils.ts` : `GET`/`PUT /api/profil`, `POST /api/profil/photo`, `/api/profil/photo-lien`, `GET`/`PUT /api/profils/:id` | `profils`, `photos` |
| Messagerie interne | tout compte validé | widget sur toutes les pages : `gestion/messagerie.js`, chargé par la coque | `routes/messagerie.ts` : `/api/messagerie/contacts`, `/messages`, `/statut`, `/frappe` | `messages`, `messagerie_statuts` (présence et frappe : en mémoire) |
| Agenda personnel | tout compte validé, chacun le sien | `gestion/agenda.html` + `agenda.js` | `routes/agenda.ts` : `GET /api/agenda?debut=&fin=`, `POST`, `PUT` / `DELETE /api/agenda/:id` | `evenements_agenda` |
| Ressources humaines | `rh-voir` + une par action : `rh-creer`, `rh-modifier`, `rh-desactiver`, `rh-reactiver`, `rh-sensible` (téléphone, RIB), `rh-parametrer` (réglages du bot) | `gestion/rh.html` + `rh.js` | `routes/rh.ts` (`/api/rh/employes…`, `/api/rh/bot…`), logique `rh.ts` ; webhook `recruitment.updated` | `employes`, `rh_arrivees_bot` ; réglages `rh.*` (socle) |
| Ventes & statistiques | `ventes` (voir), `ventes-gerer` (supprimer, synchroniser) ; bot : clé `STATS_BOT_SECRET` | `gestion/statistiques.html` + `statistiques.js` ; primes dans « Mon profil » | `routes/stats.ts` (`/api/stats/…`, `/api/tableur/…`, `/api/profil/primes`), logique `stats/` (`calcul.ts` : moteur pur, `ventes.ts`, `tableur.ts`) | `ventes`, `ventes_doublons`, `tableur_lignes`, `tableur_etat`, `tableur_archives` (+ `_lignes`) |
| Comptabilité : relevé Tablettes, DOT, rémunération | `compta` | `gestion/comptabilite.html` + `comptabilite.js` | `routes/compta.ts` (`/api/compta/…`), rémunération dans `routes/stats.ts` ; récapitulatif hebdomadaire `stats/recap.ts` | `compta_imports`, `compta_dot_ecritures`, `dot_bareme_imposition`, `remunerations_grades`, `baremes_primes` |
| WebMap | publique | lien « WebMap » de la vitrine et du menu (`/api/carte/` redirige) | `carte.ts` : relais sur le sous-domaine `WEBMAP_HOTE` (`entreprise.hotes`), iframe de la vitrine autorisée (`csp.frame`, https) | — |
| Comptes, grades (socle) | `comptes`, `grades` | `comptes.html`, `grades.html`, `compte.html`, `accueil.html` | socle | socle |

## Vitrine

- Pages à la racine ; scripts communs `layout.js` (en-tête, pied, cadre, appels à l'API), `biens.js` (catalogue), `aurora.js` (fond WebGL) ; feuille `style.css` (jetons `--d8-*`) ; `theme.css` porte les polices (servies depuis `assets/fonts/`) et les variables lues par la gestion et la signature.
- Les API de la vitrine renvoient les champs en **snake_case** (`bienPublic`, `src/entreprise/biens.ts`) : la forme de l'ancien site, lue par `biens.js`. Erreurs : `{ error }` (socle) ; `appelAPI` lit aussi l'ancien `{ erreur }`.
- En jeu (`<html class="en-jeu">`, ou `window.D8_EN_JEU`) : aucun effet WebGL (GPU partagé avec le jeu).

## Gestion

- Une page par rubrique dans `gestion/`, chacune avec `/style.css` (apparence de l'ancien espace agents), `gestion/gestion.css` et, dans l'ordre, `socle.js`, `layout.js` (aides partagées avec la vitrine : `echapper`, `formaterPrix`, `ameliorerSelect`…), `gestion/gestion.js` (coque : `gestion.coque('<rubrique>')`, menu décrit une seule fois dans `GESTION_NAV`, `gestion.message`, `gestion.confirmer`).
- **Jamais** `alert`, `confirm` ni `prompt` : l'ordinateur en jeu ne les affiche pas. Confirmation : `await gestion.confirmer(texte, titre, libellé)`.
- Photos (`entreprise/photos.ts`) : une annonce n'affiche que des photos envoyées par ce site (table `photos`) ou celles qu'elle avait déjà (reprises de l'ancien site) — jamais une image hébergée ailleurs. Un lien collé est téléchargé par le serveur (https, adresses internes refusées au moment de la connexion, 15 Mo, 15 s, 3 redirections) puis traité comme un fichier. Une photo envoyée mais jamais enregistrée est effacée après 24 h ; une photo retirée, au passage suivant du nettoyage (toutes les 15 min).

## Tests

Moteur de calcul des primes et lecture du tableur (fonctions pures, `server/test/`) : dans le conteneur de dev,
```bash
MSYS_NO_PATHCONV=1 docker exec -w /app/server dynasty8-app node --import tsx --test test/*.test.ts
```
À relancer après toute modification de `stats/calcul.ts` ou `stats/tableur.ts` : une erreur s'y paie en argent RP, sans rien d'anormal à l'écran.

## Pièges propres à ce site

- Les `{{cle}}` de `site.json` sont remplacés dans les `.html` et `.css` : ne jamais en mettre dans une chaîne JavaScript (voir CLAUDE.md).
- `GET /api/folkos` (`routes/vitrine.ts`) renvoie vers `/auth/folkos` : ancienne adresse du SSO, encore déclarée dans le broker FolkOS de l'opérateur. À retirer une fois le broker mis à jour.
- Déploiement : guide propre à Dynasty 8 dans `deploy/POUR-NICOLAS.md` (VPS FlashbackFA, port 3011, sous-domaine de la carte) ; le guide générique du modèle reste `server/README.md`.
- WebMap : servie sur son sous-domaine, jamais sous le domaine du site (son code tournerait avec les droits du site). En dev : `WEBMAP_HOTE=carte.localhost` (http://carte.localhost:3010) ; l'iframe de la vitrine n'est autorisée qu'en https, la carte s'ouvre alors en pleine page.
