# Notes propres à ce site — Dynasty 8

Fichier **personnalisable**, importé par `CLAUDE.md` : ce qu'un agent (ou un développeur) doit savoir de Dynasty 8 en particulier.

Seulement ce qui est propre au site : ses modules, tables, routes, conventions et pièges. Une règle qui vaudrait pour tout site (sécurité, en jeu, déploiement…) va dans le modèle (`CLAUDE.md`, `docs/`), pour que tous les sites en profitent ; ici, un renvoi suffit.

## L'entreprise

- Activité : agence immobilière RP du serveur GTA RP **FlashbackFA** (univers fictif). Vitrine : catalogue des biens (habitations, intérieurs, garages, exclusifs), cohérences RP par zone, VIP PLUS, équipe, FAQ. Espace agents : gestion des biens, messagerie, agenda, statistiques et primes, comptabilité / DOT, ressources humaines.
- Site : https://dynasty8.fbfa.fr/, aussi affiché dans l'ordinateur en jeu (FolkOS, `docs/folkos.md`).
- Serveur Discord : ses rôles sont lus sur Discord et liés aux grades dans la page Grades (`DISCORD_BOT_TOKEN`, docs/api.md) ; rien n'est écrit en dur. Webhook abonné : Candidatures (`recruitment.updated`).

## Origine du site

Porté sur le modèle depuis une première version jamais mise en production (JavaScript + SQL écrit à la main), consultable dans l'historique git avant le commit qui supprime `ancien/`. Certaines formes viennent de là (champs en snake_case, apparence de l'espace agents). Aucune donnée reprise : la base de production démarre vide.

## Ce que le site ajoute au socle

| Domaine | Permission | Pages | Routes (`server/src/entreprise/`) | Tables (`entreprise.prisma`) |
|---|---|---|---|---|
| Catalogue (vitrine) | lecture publique ; `biens` voit aussi les biens masqués | `habitation`, `interieurs`, `garages`, `exclusifs`, `bien`, `accueil` (racine) ; script `assets/js/catalogue.js` | `routes/vitrine.ts` : `GET /api/biens`, `GET /api/equipe` | `biens`, `profils` |
| Annonces (gestion des biens) | `biens` | `gestion/biens.html` + `gestion/biens.js` | `routes/biens.ts` : `POST /api/biens`, `PUT` / `DELETE /api/biens/:id`, `POST /api/biens/photo` | `biens`, `photos` |
| Profil public (page équipe) | chacun le sien ; `comptes` pour un agent sous son grade | `gestion/compte.html` (« Mon profil »), fenêtre dans `comptes.html` ; éditeur commun `gestion/profil.js` | `routes/profils.ts` : `GET`/`PUT /api/profil`, `POST /api/profil/photo`, `GET`/`PUT /api/profils/:id` | `profils`, `photos` |
| Messagerie interne | tout compte validé | widget sur toutes les pages : `gestion/messagerie.js`, chargé par la coque | `routes/messagerie.ts` : `/api/messagerie/contacts`, `/messages`, `/lus` (POST : marquer une conversation lue), `/statut`, `/frappe` ; sondage toutes les 4 s, onglet visible seulement | `messages`, `messagerie_statuts` (présence et frappe : en mémoire) |
| Agenda partagé | tout compte validé ; visibilité Perso / Patrons / Direction / Tous selon les rôles Discord réglés dans Paramètres (`compte.rolesDiscord`, socle) ; `parametres` crée toujours | `gestion/agenda.html` + `agenda.js` | `routes/agenda.ts` : `GET /api/agenda?debut=&fin=`, `GET /api/agenda/personnes`, `POST`, `PUT` / `DELETE /api/agenda/:id` ; règles pures `agenda-regles.ts` | `evenements_agenda` |
| Membres en service | encadré : tout compte validé ; état de la lecture : `parametres` | encadré de la barre latérale (`gestion.js`), état dans `parametres.html` | `services.ts` (lecture du salon chaque minute avec `DISCORD_BOT_TOKEN`), `services-messages.ts` (lecture pure des messages) ; `routes/services.ts` : `GET /api/services/en-cours`, `/api/services/etat` | `services`, `services_etat` |
| Paramètres et apparence | `parametres` (permission du socle ; lecture publique de `GET /api/liens`) | `gestion/parametres.html`, `gestion/webmap.html` | `parametres.ts` : réglages déclarés pour le socle (`PARAMETRES` ; routes, validation et enregistrement dans `socle/parametres.ts`), `routes/apparence.ts` (`/api/apparence…`, relais des images de la marque sur leurs adresses d'origine) | réglages `site.*` (socle), `apparence_images` |
| Ressources humaines | `rh-voir` + une par action : `rh-creer`, `rh-modifier`, `rh-desactiver`, `rh-reactiver`, `rh-sensible` (téléphone, RIB), `rh-parametrer` (réglages du bot) | `gestion/rh.html` + `rh.js` | `routes/rh.ts` (`/api/rh/employes…`, `/api/rh/bot…`), logique `rh.ts` ; webhook `recruitment.updated` | `employes`, `rh_arrivees_bot` ; réglages `rh.*` (socle) |
| Ventes & statistiques | `ventes` (voir), `ventes-gerer` (synchroniser le tableur) ; bot : clé `STATS_BOT_SECRET` | `gestion/statistiques.html` + `statistiques.js` ; primes dans « Mon profil » | `routes/stats.ts` : `POST /api/stats/ventes` (bot), `/api/stats/semaines`, `/api/stats/tableur`, `/api/tableur/…`, `/api/profil/primes`, `GET /api/outils` (liens du menu : tableau des cohérences, accès aux ventes), logique `stats/` (`calcul.ts` : moteur pur, `ventes.ts`, `tableur.ts`) | `ventes`, `ventes_doublons`, `tableur_lignes`, `tableur_etat`, `tableur_archives` (+ `_lignes`) |
| Comptabilité : relevé Tablettes, DOT, rémunération, paie à l'heure (`stats/paie-horaire.ts`) | `compta` | `gestion/comptabilite.html` + `comptabilite.js` | `routes/compta.ts` (`/api/compta/…`), rémunération dans `routes/stats.ts` ; récapitulatif hebdomadaire `stats/recap.ts` | `compta_imports`, `compta_dot_ecritures`, `dot_bareme_imposition`, `remunerations_grades`, `baremes_primes` |
| WebMap | publique ; page de l'espace agents : `parametres` | lien « WebMap » de la vitrine, `gestion/webmap.html` (`/api/carte/` redirige) | `carte.ts` : relais sur le sous-domaine `WEBMAP_HOTE` (`entreprise.hotes`) vers l'adresse réglée dans Paramètres, appelée par `requeteHttps` (socle : adresse recontrôlée à chaque connexion, jamais interne), iframe autorisée (`csp.frame`, https) | — |
| Cohérences RP | publique ; aussi dans l'espace agents | `coherences.html` (liste), `coherence-zone.html` (une zone, `?zone=`), `gestion/coherences.html`, guides communs `assets/js/coherences-guides.js` (images `assets/img/coherences/`) | — | — |
| Comptes, grades (socle) | `comptes`, `grades` | `comptes.html`, `grades.html`, `compte.html`, `accueil.html` | socle | socle |

## Vitrine

- Pages à la racine (règle de rangement : CLAUDE.md) : `index.html` est l'intro animée (bouton « Entrer sur le site »), `accueil.html` la vraie page d'accueil, seule des deux dans `sitemap.xml`.
- Scripts dans `assets/js/` : `layout.js` (en-tête, pied, cadre, appels à l'API), `catalogue.js` (catalogue), `aurora.js` (fond WebGL), `coherences-guides.js` ; feuille `assets/css/style.css` (jetons `--d8-*`). Images : la marque à la racine de `assets/` (logos, icônes, image de partage : leurs adresses sont servies par `routes/apparence.ts`, remplaçables dans Paramètres), les illustrations dans `assets/img/`.
- `theme.css` porte les polices (servies depuis `assets/fonts/`) et les variables lues par la gestion et la signature.
- Les API de la vitrine renvoient les champs en **snake_case** (`bienPublic`, `src/entreprise/biens.ts`) : la forme historique des pages, lue par `catalogue.js`. Erreurs : `{ error }` (socle).
- En jeu (`<html class="en-jeu">`, ou `window.D8_EN_JEU`) : aucun effet WebGL (GPU partagé avec le jeu).

## Liens et réglages

- Les liens du site (Discord de l'agence, boutique VIP, partenaire, registre, WebMap, Google Sheets) et les réglages des services et de l'agenda se règlent dans **Paramètres** : capacité du socle (`socle/parametres.ts`), réglages de Dynasty 8 déclarés dans `parametres.ts` (`PARAMETRES`, par groupes ; la page se construit d'après eux). Le Google Sheets est enregistré comme lien complet vers l'onglet (`sheetRegle()`). Côté pages publiques : `data-lien="<clé>"`, rempli par `layout.js` depuis `GET /api/liens` (les pages publiques ne chargent pas `socle.js`) ; un lien vide masque le bouton.
- **Jamais réglables** : les liens de la signature Roxwood Network (site et Discord du réseau, pied de page) et l'invitation « Découvrir nos offres » de `equipe.html` restent écrits en dur.

## Gestion

- Une page par rubrique dans `gestion/`, chacune avec `/assets/css/style.css` (apparence de l'ancien espace agents), `gestion/gestion.css` et, dans l'ordre, `socle.js`, `/assets/js/layout.js` (aides partagées avec la vitrine : `echapper`, `formaterPrix`, `ameliorerSelect`…), `gestion/gestion.js` (coque : `gestion.coque('<rubrique>')`, menu décrit une seule fois dans `GESTION_NAV`, `gestion.message`, `gestion.confirmer`).
- Confirmation (les boîtes natives sont interdites, voir docs/folkos.md) : `await gestion.confirmer(texte, titre, libellé)`.
- Photos (`entreprise/photos.ts`) : une annonce n'affiche que des photos envoyées par ce site (table `photos`) — jamais une image hébergée ailleurs, ni une image donnée par lien : seul un fichier envoyé par le site (`...recevoirImage`, `envoiPhoto`) entre en base. Une photo envoyée mais jamais enregistrée est effacée après 24 h ; une photo retirée, au passage suivant du nettoyage (toutes les 15 min).

## Tests

Tests du site (convention dans CLAUDE.md, `npm test`) : moteur de calcul des primes (`stats-calc.test.ts`), paie à l'heure (`paie-horaire.test.ts`), lecture du tableur (`tableur.test.ts`), lecture des messages de service (`services.test.ts`), règles de l'agenda (`agenda.test.ts`). À relancer après toute modification de `stats/calcul.ts`, `stats/paie-horaire.ts` ou `stats/tableur.ts` (une erreur s'y paie en argent RP, sans rien d'anormal à l'écran), de `services-messages.ts` ou de `agenda-regles.ts`.

## Pièges propres à ce site

- Candidatures du bot (`recruitment.updated`, `rh.ts`) : forme du bot officiel (docs/webhooks.md). Une candidature passée « Acceptée » dans Discord crée la fiche ; l'ID Discord est celui du candidat qui a ouvert le ticket. Le dernier événement appliqué à un ticket est daté (`evenement_le`) : un renvoi plus ancien du bot est ignoré.

- Déploiement : guide d'installation propre à Dynasty 8 dans `deploy/INSTALLATION.md` (VPS FlashbackFA, port 3010, sous-domaine de la carte) ; le guide générique du modèle reste `server/README.md`.
- WebMap : servie sur son sous-domaine, jamais sous le domaine du site (son code tournerait avec les droits du site). En dev : `WEBMAP_HOTE=carte.localhost` (http://carte.localhost:3010) ; l'iframe de la vitrine n'est autorisée qu'en https, la carte s'ouvre alors en pleine page.
