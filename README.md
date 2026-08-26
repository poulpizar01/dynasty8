# Dynasty 8 — nouveau site

Bienvenue ! Ce dossier contient le nouveau site complet de l'agence immobilière **Dynasty 8** (serveur RP FlashbackFA). Ce document t'explique, étape par étape, comment le mettre en ligne. Prends ton temps, chaque étape est détaillée.

## Ce que contient le projet

- **Un site public** (`public/*.html`) : Accueil, Habitation, Garages, Produits exclusifs, Services, Équipe, FAQ, et une fiche détaillée par annonce.
- **Un espace agents protégé** (`public/admin.html`) : accessible via le bouton « Espace agents » en haut du site. Il permet d'ajouter, modifier ou supprimer les annonces sans toucher au code, et de créer des accès pour les autres membres de l'équipe.
- **Un « Worker »** (`src/index.js`) : c'est le petit programme qui tourne côté serveur. Un Worker est un bout de code qui s'exécute automatiquement sur les serveurs de Cloudflare (l'hébergeur) à chaque fois qu'un visiteur ou l'espace agents demande une information (ex : « donne-moi la liste des annonces »).
- **Une base de données D1** déjà créée sur ton compte Cloudflare, nommée `dynasty8`. C'est l'endroit où sont stockées les annonces et les comptes agents. D1 est le nom du service de base de données de Cloudflare.

Le contenu (annonces, équipe, FAQ) est actuellement du **contenu de démonstration**, à remplacer par tes vraies informations. La section « Personnaliser le contenu » plus bas indique exactement où.

---

## Étape 1 — Mettre le code sur GitHub

GitHub est simplement l'endroit où va vivre ton code : un peu comme un Google Drive spécialisé pour le code, avec un historique de toutes les versions. Cloudflare (l'hébergeur) ira ensuite piocher le code directement dans ce GitHub à chaque mise à jour.

1. Va sur [github.com](https://github.com) et connecte-toi (ou crée un compte gratuit).
2. Clique sur le bouton **+** en haut à droite → **New repository**.
3. Nomme-le `dynasty8` (visibilité **Private** recommandée, pour que le code ne soit pas public).
4. Clique sur **Create repository**.
5. Sur la page qui s'affiche, clique sur le lien **« uploading an existing file »**.
6. Ouvre le dossier `dynasty8` sur ton ordinateur (celui que je t'ai envoyé), sélectionne **tout son contenu** (fichiers ET dossiers `src` et `public`), et fais un glisser-déposer dans la zone GitHub.
7. En bas de page, clique sur **Commit changes**.

Ton code est maintenant sur GitHub. (Si tu es à l'aise avec la ligne de commande, tu peux aussi utiliser `git init`, `git add .`, `git commit`, `git remote add origin ...` et `git push` — mais l'upload par glisser-déposer fonctionne tout aussi bien.)

---

## Étape 2 — Connecter Cloudflare à ce GitHub

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com) et connecte-toi avec ton compte (celui qui contient déjà tes projets `roxwood-network` et `prisme-espace`).
2. Dans le menu de gauche, clique sur **Workers & Pages**.
3. Clique sur **Create** (ou **Create application**), puis sur l'onglet **Workers**.
4. Choisis **Import a repository** (ou « Connect to Git »).
5. Autorise Cloudflare à accéder à ton compte GitHub si demandé, puis sélectionne le dépôt `dynasty8`.
6. Cloudflare détecte automatiquement le fichier `wrangler.toml` du projet : laisse les réglages proposés tels quels (nom du projet : `dynasty8`).
7. Clique sur **Save and Deploy**.

Cloudflare va construire et publier le site. Au bout de 30 secondes à 1 minute, tu obtiens une adresse provisoire du type `https://dynasty8.<ton-compte>.workers.dev`. **Le site ne fonctionnera pas encore complètement à ce stade** : il manque une clé secrète (étape 3).

---

## Étape 3 — Ajouter la clé secrète de connexion

Le site a besoin d'une clé secrète pour signer les connexions à l'espace agents (un peu comme le sceau qui rend un bracelet de festival infalsifiable). Sans elle, personne ne peut se connecter.

1. Toujours sur le tableau de bord Cloudflare, ouvre ton nouveau projet `dynasty8` (**Workers & Pages → dynasty8**).
2. Va dans l'onglet **Settings**, puis **Variables and Secrets**.
3. Clique sur **Add**.
   - Nom (Variable name) : `SESSION_SECRET`
   - Type : **Secret** (surtout pas « Text », pour qu'elle reste invisible)
   - Valeur : colle exactement ceci :
     ```
     P77U7g-MyLffHKjJ-nJKkKbUZwy-4e6cU7aXyp9CBVk
     ```
4. Clique sur **Save**, puis **Deploy** si le site te propose de redéployer (sinon, un nouveau déploiement se lance automatiquement).

⚠️ Cette clé doit rester confidentielle : ne la mets jamais dans le code ni dans un message public. Si tu penses qu'elle a fuité, reviens sur cette page et remplace-la par une nouvelle valeur (génère-en une nouvelle en me le demandant, ou avec n'importe quel générateur de mot de passe long).

---

## Étape 4 — Créer ton compte « Direction »

1. Ouvre l'adresse de ton site (celle en `.workers.dev` obtenue à l'étape 2), puis ajoute `/admin.html` à la fin. Exemple : `https://dynasty8.xxxx.workers.dev/admin.html`.
2. Comme c'est la première visite, le site te propose de créer le tout premier compte. Entre ton pseudo et clique sur **Créer mon accès**.
3. Un **code d'accès** s'affiche (ex : `DYN-4F2A-9K1B-77XQ`). **Note-le immédiatement dans un endroit sûr** (gestionnaire de mots de passe, note personnelle). Il ne sera plus jamais réaffiché — c'est ta seule façon de te connecter.
4. Clique sur **J'ai noté mon code, continuer**, puis connecte-toi avec ce code.

Tu es maintenant dans l'espace agents, avec le grade **Direction** (droits complets, y compris la gestion de l'équipe).

---

## Étape 5 — Personnaliser le contenu

Le site est prêt à fonctionner mais contient du contenu d'exemple. Voici où le modifier (directement sur GitHub : ouvre le fichier concerné, clique sur l'icône crayon ✏️ pour l'éditer, puis **Commit changes** — Cloudflare republiera automatiquement le site en moins d'une minute) :

| Ce que tu veux changer | Fichier | Repère à chercher |
|---|---|---|
| Les annonces (biens à vendre/louer) | — | Se fait depuis l'espace agents (`/admin.html`), pas dans le code |
| Le lien d'invitation Discord | `public/layout.js` | `LIEN_DISCORD` (tout en haut du fichier) |
| La vidéo de présentation YouTube | `public/index.html` | `idVideo` (remplace `"PLACEHOLDER"` par l'identifiant de ta vidéo, la partie après `v=` dans son lien YouTube) |
| Les membres de l'équipe affichés publiquement | `public/equipe.html` | le tableau `EQUIPE` |
| Les questions de la FAQ | `public/faq.html` | le tableau `FAQ` |
| Les 4 adresses mises en avant sur l'accueil | `public/index.html` | la section « Les adresses les plus demandées », cartes `carte-zone` |
| Les services proposés | `public/services.html` | les blocs `carte-service` |

### Catégories et sous-catégories des annonces

Chaque annonce appartient à l'une de ces deux catégories :

- **Habitation** — avec une sous-catégorie obligatoire parmi : Eclipse Tower, Tinsel Tower, Villa, Del Perro Heights, Richards Majestic, Weazel Plaza, San Andreas, Alta Street, Maison, Entrepôt, Flat, Bureau, Headquarter, Caravane, Appartement, Duplex, Autre.
- **Garage** — pas de sous-catégorie, reste simple.

Pour changer cette liste (ajouter/renommer une sous-catégorie), modifie-la à trois endroits identiques : `SOUS_CATEGORIES_HABITATION` dans `src/index.js` (validation côté serveur), `SOUS_CATEGORIES_HABITATION` dans `public/layout.js` (utilisée par l'espace agents), et les boutons `<button class="filtre" data-sous-categorie="...">` dans `public/habitation.html`.

### Ajouter des photos à une annonce

Depuis l'espace agents, dans le formulaire d'une annonce (bouton « + Nouvelle annonce ») : colle un lien d'image (URL) dans le champ prévu, **ou** clique sur « 📁 Parcourir mes fichiers » pour choisir directement une photo depuis ton ordinateur — elle est automatiquement redimensionnée et compressée avant l'enregistrement. 5 photos maximum par annonce ; la première ajoutée est la photo principale (affichée sur les cartes du site). Une croix ✕ sur chaque vignette permet de la retirer avant d'enregistrer.

---

## Étape 6 — Le nom de domaine dynasty8.fbfa.fr

Pour que le site réponde sur `dynasty8.fbfa.fr` plutôt que sur l'adresse `.workers.dev`, il faut relier ce nom de domaine à ton projet Cloudflare :

1. Dans **Workers & Pages → dynasty8 → Settings → Domains & Routes**, clique sur **Add** puis **Custom domain**.
2. Entre `dynasty8.fbfa.fr` et valide.

Deux cas de figure :
- **Si le domaine `fbfa.fr` est géré dans ce même compte Cloudflare** (ce qui est probable, puisque tes autres projets comme `roxwood-network` semblent faire partie du même réseau) : Cloudflare configure tout automatiquement en quelques secondes.
- **Si `fbfa.fr` est géré ailleurs** (chez une autre personne ou un autre service) : Cloudflare t'indiquera un enregistrement DNS à ajouter (un « CNAME », qui est simplement une redirection technique indiquant « dynasty8.fbfa.fr doit pointer vers ce Worker »). Il faudra alors transmettre cette information à la personne qui gère le domaine `fbfa.fr`.

---

## Mettre à jour le site plus tard

Une fois tout en place, il te suffit de modifier un fichier sur GitHub (ou de pousser de nouveaux fichiers) : Cloudflare republie automatiquement le site à chaque modification, en général en moins d'une minute. Aucune autre manipulation n'est nécessaire.

---

## En cas de problème

- **« Base de données non reliée » affiché sur le site** : la base D1 n'est pas correctement associée au projet. Vérifie dans **Settings → Bindings** que `DB` pointe bien vers la base `dynasty8`.
- **Impossible de se connecter à l'espace agents / erreur "SESSION_SECRET n'est pas configuré"** : reviens à l'étape 3, la clé secrète n'a pas été enregistrée.
- **« Code invalide »** : vérifie que tu as bien copié le code en entier, sans espace avant/après. Un agent qui a perdu son code doit en demander un nouveau à la Direction (bouton « Régénérer le code » dans l'espace agents).
- **Les photos ne s'affichent pas** : le lien utilisé doit pointer directement vers le fichier image (il doit se terminer par `.jpg`, `.png`...). Un lien vers une page web qui contient l'image ne fonctionnera pas.
- **Page blanche ou message d'erreur inattendu** : ouvre les outils de développement de ton navigateur (touche `F12`), onglet « Console », et regarde le message d'erreur affiché en rouge — il donne généralement une bonne piste. Tu peux me copier ce message si tu as besoin d'aide.

---

## Sécurité — à retenir

- Ne partage **jamais** ton code d'accès personnel, ni la clé `SESSION_SECRET`.
- Chaque agent doit avoir son propre compte (créé depuis l'espace agents par la Direction) plutôt que de partager un seul code entre plusieurs personnes.
- Le dossier `public/` est entièrement visible par tout le monde (c'est un site web normal) : n'y mets jamais d'information confidentielle en dur dans le code.
