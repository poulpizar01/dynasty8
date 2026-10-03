# Prompts d'audit

Une revue généraliste (« est-ce prêt pour la prod ? ») trouve surtout un type de problème et passe à côté des autres. Ces prompts découpent l'audit en **angles indépendants**, à lancer séparément avant une mise en prod, après une grosse fonctionnalité, ou périodiquement.

Dans Claude Code : `/audit` lance les cinq angles en parallèle et fusionne les rapports, `/audit <angle>` un seul (voir `.claude/skills/audit/`). Ce fichier est la seule source des prompts : les modifier ici suffit.

Fichier du socle : on l'améliore dans le modèle, chaque site le récupère avec le reste du socle. Les angles couvrent le socle **et** le code de l'entreprise : dans un site, c'est surtout ce dernier qui change d'un audit à l'autre.

## Format de sortie commun

À ajouter à la fin de chaque prompt :

```
Lis CLAUDE.md (et ENTREPRISE.md qu'il importe), docs/api.md et docs/webhooks.md avant de commencer : les règles qui y figurent sont des décisions déjà prises, ne les remets pas en cause et ne signale pas comme défaut un comportement qui y est documenté comme volontaire.

Pour chaque problème trouvé :
- fichier:ligne
- scénario concret de défaillance (quelles entrées / quel état → quel résultat faux, crash ou fuite)
- correction proposée
- gravité : Indispensable avant prod / Fortement conseillé / Mineur
- zone : socle (server/src/index.ts, server/src/socle/, socle/, socle.prisma, compose, docs…) ou entreprise (le reste)

Classe les problèmes par gravité. Ne signale rien que tu n'as pas vérifié dans le code. N'écris aucune modification : rapport uniquement, en français.
```

## 1. Accès et sessions (serveur)

```
Audite uniquement le contrôle d'accès du serveur (server/src).
Cherche :
- toute route /api ou /auth de server/src/entreprise/ ou server/src/socle/ sans garde (...connecte, ...valide, ...permission de socle/http.ts), avec une garde plus faible que celle annoncée dans docs/api.md ou ENTREPRISE.md, ou une garde passée sans être étalée ;
- les pages de gestion/ qui affichent des données réservées à une permission sans être déclarées avec cette permission dans entreprise.pages (server/src/entreprise/index.ts) ;
- les vérifications « auteur ou permission » contournables en changeant un identifiant dans l'adresse ou le corps ;
- l'escalade de droits : un compte qui se donne un grade, modifie un compte ou un grade égal ou supérieur au sien, accorde une permission qu'il n'a pas, garde un grade lié à un rôle Discord qu'il n'a plus ; le propriétaire revérifié à chaque connexion ;
- la connexion Discord : paramètre state, appartenance au serveur vérifiée, session régénérée, comptes en attente ou refusés qui accèdent quand même à des données ;
- DEV_LOGIN activable en production, ou tout autre raccourci de dev qui survit en prod ;
- les requêtes qui modifient des données déclenchables depuis un autre site (SameSite, vérification d'origine) ;
- les limites de requêtes contournables (clé de limitation, confiance au proxy).
```

## 2. Navigateur (XSS, CSP, fichiers servis)

```
Audite uniquement ce qui s'exécute ou s'affiche dans le navigateur, et ce que le serveur expose comme fichiers.
Cherche :
- toute donnée venant d'un utilisateur, de Discord ou du bot (nom RP, pseudo, texte saisi, contenu d'un webhook) insérée par innerHTML, insertAdjacentHTML ou dans un attribut sans socle.esc(), dans gestion/*.html, gestion/*.js, les scripts de la vitrine et socle/socle.js ;
- les URL construites depuis une donnée (href, src) qui accepteraient javascript: ou une autre origine ;
- la CSP (server/src/socle/security.ts) et entreprise.csp : origines trop larges ou non justifiées, ressource externe chargée sans y être déclarée, attributs onclick inopérants ;
- les {{…}} placés dans une chaîne JavaScript (piège documenté dans CLAUDE.md) et l'échappement des valeurs de site.json dans site.ts ;
- les fichiers servis : vérifie que server/, site.json, ENTREPRISE.md, compose*.yaml, .env, docs/ restent inaccessibles, y compris via encodage (%2e%2e, double slash, majuscules) ;
- les données renvoyées au navigateur sans besoin (champs de comptes d'autres employés, identifiants internes, contenu brut d'un webhook).
```

## 3. Webhooks et intégrations

```
Audite uniquement ce qui entre dans le site depuis l'extérieur sans utilisateur connecté, et ce que le site appelle à l'extérieur.
Cherche :
- la réception des webhooks (server/src/socle/routes/webhooks.ts) : signature contournable, comparaison non constante, corps relu avant vérification, contrôle du serveur Discord, dédoublonnage (rejeu, deux livraisons simultanées), réponse qui fuirait une donnée ;
- les traitements de l'entreprise (entreprise.webhooks) : non idempotents (create aveugle sur un événement renvoyé à chaque changement de statut), confiance dans la forme du payload, texte non borné, erreur levée pour une donnée invalide (le bot réessaierait 10 fois pour rien), traitement long qui dépasse les 10 s du bot ;
- le contrat avec le bot : compare les champs lus par les traitements au code du bot (dépôt https://github.com/poulpizar01/roxwood-network-entreprise, appels à dispatchWebhook dans src/services/) ; signale tout champ utilisé qui n'existe pas ou a changé de forme ;
- les appels sortants du site (fetch dans server/src/entreprise/, stockage, Discord) : délai maximal, réponse d'erreur traitée, adresse construite depuis une donnée utilisateur (SSRF), secret écrit dans un journal.
```

## 4. Fiabilité, ressources et déploiement

```
Audite uniquement la fiabilité en exploitation et la consommation de ressources.
Cherche :
- les erreurs non attrapées qui arrêtent le serveur (routes async, minuteurs de entreprise.demarrage, traitement d'image, appels sortants) ;
- la mémoire : traitement d'image (sharp) par rapport au plafond du conteneur, caches en mémoire sans borne, listes chargées en entier sans limite (take) ;
- l'envoi d'images : enregistrerImage contourné, fichiers orphelins sur le stockage après une erreur ou une suppression (lignes effacées avant les fichiers) ;
- la base : tables qui grossissent sans fin (sans purge), requêtes sans index sur des colonnes filtrées ou triées, migrations non commitées, migration qui exige un super-utilisateur, référence à un compte sans nettoyage dans avantSuppressionCompte ;
- le démarrage : variables d'environnement de l'entreprise manquantes ou invalides détectées tôt avec un message clair, ou erreur obscure plus tard ;
- le déploiement : compose.yaml (limites mémoire, ports en loopback, sauvegardes restaurables), nginx (docs/nginx.md, routes longues de l'entreprise sans leur bloc location), cookies Secure derrière le proxy.
```

## 5. Socle et règles du modèle

```
Vérifie uniquement le respect des règles propres à ce modèle, décrites dans CLAUDE.md et README.md.
Cherche :
- dans un site créé depuis le modèle : toute différence entre les fichiers du socle (liste dans CLAUDE.md) et ceux du modèle (git remote « modele » s'il existe : git diff modele/main -- <fichiers du socle>) ; chaque différence est un point à reporter dans le modèle ou à annuler ;
- dans le dépôt modèle : contenu propre à une entreprise (nom, lieu, métier) hors de l'exemple « annonces » ;
- le contrat (server/src/socle/contrat.ts) : pages de gestion/ absentes de entreprise.pages alors qu'elles demandent une permission, permissions déclarées mais jamais utilisées (ou l'inverse), relation Prisma vers Compte dans entreprise.prisma ;
- les pages de gestion/ sans meta application-name, sans theme.css, ou sans socle.js avant leurs scripts ; les noms imposés (index, attente, refuse, accueil) présents ;
- les routes qui lisent req.session hors de /api et /auth ;
- les débordements horizontaux et le menu aux largeurs 375, 768, 1 024 et 1 280 px (lecture du CSS, sans navigateur : signale seulement les cas certains) ;
- une fonctionnalité, une route, une variable d'environnement ou une table ajoutée sans mise à jour de ENTREPRISE.md, .env.example, confidentialite.html ou docs/ ;
- les commentaires qui racontent une modification passée au lieu de décrire l'invariant actuel.
```
