# Dynasty 8 — mise à jour d'octobre 2026 : ce qui change à la mise en ligne

Complément de [`POUR-NICOLAS.md`](POUR-NICOLAS.md), qui reste la procédure de
référence (installation, mise à jour, sauvegarde, rollback). Cette note ne
liste que ce qui est **nouveau** avec cette version.

- Partie 1 : pour l'**opérateur du VPS**.
- Partie 2 : pour la **Direction de Dynasty 8**, une fois le site en ligne.

---

## Partie 1 — Serveur (opérateur)

### 1. Avant tout : sauvegarde

Une sauvegarde de la base, comme décrit dans « Sauvegarde et restauration »
de `POUR-NICOLAS.md`. Le schéma évolue (voir 2), et une évolution ne se
« défait » pas.

### 2. Schéma de la base

Rejouer `schema.postgres.sql` avec la commande d'« Application du schéma »
de `POUR-NICOLAS.md`, **avant** de redémarrer le service. Sinon, le site
refuse de démarrer (`schema PostgreSQL incomplet`).

Ce que la migration ajoute ou modifie (rien n'est supprimé) :

| Objet | Changement | Sert à |
|---|---|---|
| `apparence_images` | nouvelle table | images de la marque remplacées (Paramètres → Apparence) |
| `medias.usage` | contrainte élargie à `apparence` | suivi des images envoyées sur le stockage |
| `stats_taux_commission.taux_horaire` | nouvelle colonne (0 par défaut) | paie à l'heure des stagiaires |
| `services`, `services_etat` | nouvelles tables | membres en service |
| `membres.discord_roles`, `membres.discord_roles_le` | nouvelles colonnes | rôles Discord (agenda) |
| `evenements_agenda.visibilite`, `cible_*`, `discord_*` | nouvelles colonnes + contrainte | agenda partagé ; les événements existants restent privés |

### 3. Fichier `.env`

Voir `deploy/systemd/.env.example` (ou celui du pack utilisé). Chaque
variable y est commentée.

**Bloquant : le site ne démarre pas sans ceci.**

- `SESSION_SECRET` : au moins 16 caractères, aléatoire (`openssl rand -hex 32`). Le site refuse désormais de démarrer avec une valeur vide, courte ou laissée à l'exemple.

**Nécessaires au bon fonctionnement :**

| Variable | Sans elle |
|---|---|
| `FRAME_ANCESTORS` | le site ne s'affiche pas dans l'ordinateur en jeu |
| `FOLKOS_SDK_ORIGINE` | pas de SDK FolkOS en jeu (clavier, Échap) |
| `FBFA_STORAGE_BASE` et `FBFA_STORAGE_TOKEN` | aucun envoi de photo, et les images de la marque ne peuvent pas être remplacées (les images d'origine restent affichées) |
| `DISCORD_BOT_TOKEN` | pas d'encadré « En service », et les événements « Perso » ne peuvent pas être envoyés dans les tickets |
| `DISCORD_GUILD_ID` | rôles Discord non lus : seuls les événements « Perso » sont visibles dans l'agenda |
| `SITE_URL_PUBLIQUE` | facultative : adresse utilisée dans les aperçus de partage (sinon, celle par laquelle le visiteur arrive) |

`DISCORD_BOT_TOKEN` est le jeton du bot **Roxwood Network** (Developer
Portal → Bot → Token). Le bot lui-même n'est pas modifié. C'est un secret :
il ne doit jamais aller dans Git.

### 4. Lecture seule et écoute

- Le dossier du projet peut être en lecture seule : le site n'y écrit plus rien. Toutes les images passent par le stockage externe.
- L'unité systemd fournie l'impose : `ProtectSystem=strict`, `ProtectHome=true`, écoute sur `127.0.0.1` uniquement (`HOST=127.0.0.1`).
- Les compose fournis passent l'application en `read_only: true`.
- Si votre unité est une copie de l'ancienne, reprenez `deploy/systemd/dynasty8-api.service`.

### 5. Discord (à faire une fois)

Droits du bot Roxwood Network sur le serveur de l'agence :

- **salon des prises et fins de service** (bot « Agatha ») : *Voir le salon* et *Voir les anciens messages* ;
- **catégories des tickets Ticket Tool** : *Voir le salon* et *Envoyer des messages*.

La connexion Discord demande maintenant aussi l'autorisation
`guilds.members.read` (lire ses propres rôles sur le serveur). Rien à
changer dans le Developer Portal. Chaque membre verra simplement Discord lui
demander d'accepter une fois, à sa prochaine connexion.

### 6. Vérifications après redémarrage

Dans les journaux (`journalctl -u dynasty8-api`) :

- `Schéma PostgreSQL vérifié (aucune création : DB_SCHEMA_AUTO=0).`
- `[services] Salon des services ou DISCORD_BOT_TOKEN non réglé : lecture en attente.` : normal tant que la Direction n'a pas réglé le salon (partie 2) ; ensuite, `Lecture du salon des services : ok.`
- aucun `[csp] FRAME_ANCESTORS vide`.

---

## Partie 2 — Réglages dans l'espace agents (Direction)

Onglet **Paramètres**, réservé à Patron, Co Patron et Développeur web (sauf
« Apparence », ouverte à toute la Direction). Tout s'applique immédiatement,
sans redémarrage.

Les IDs Discord se copient par clic droit → *Copier l'identifiant*, avec le
mode développeur de Discord activé (Paramètres Discord → Avancés).

### Membres en service

- **ID du salon des services** : le salon où le bot « Agatha » publie « Service démarré » / « Service terminé ».
- **Clôture automatique (heures)** : 12 par défaut. Un service jamais fermé l'est automatiquement à son début + ce nombre d'heures.
- Sous le formulaire, l'état de la lecture indique ce qui a été lu et reconnu, et signale les cas particuliers : fin sans début, double prise de service, clôture automatique.

### Agenda

| Réglage | Contenu |
|---|---|
| Rôles qui voient « Patrons » / « Direction » | un ou plusieurs IDs de rôles |
| Rôle qui voit « Tous » | un seul ID de rôle |
| Rôles qui créent « Patrons » / « Direction » / « Tous » | IDs de rôles. Patron, Co Patron et Développeur web le peuvent toujours. |
| Rôles qui créent un « Perso » pour quelqu'un d'autre | IDs de rôles |
| Catégories des tickets | IDs des catégories où Ticket Tool crée les tickets |

Les rôles de chacun sont relus à chaque connexion Discord : après un
changement de rôle sur Discord, la personne doit se reconnecter au site.

Un événement « Perso » pour quelqu'un d'autre :

- n'est créé que si son **ticket** est trouvé ;
- exige que sa **fiche RH** ait un ID Discord.

Sinon, un message l'explique à celui qui crée l'événement.

### Comptabilité → Paramètres

- **Taux horaire** du grade Stagiaire, en $ par heure. La paie à l'heure apparaît sous le relevé Tablettes, avec le détail du calcul, et s'ajoute au salaire déclaré à la DOT.
- Le relevé collé doit contenir la colonne « Heures de service » (format `2h30min`).

### Apparence (facultatif)

- Logo, emblème, lettrage, icônes et image de partage : « Remplacer » ou « Rétablir l'origine ».
- Disponible une fois le stockage configuré (`FBFA_STORAGE_TOKEN`).

### Hiérarchie des grades (à vérifier une fois)

L'ordre des grades sert aux tris et aux droits de Comptes & accès :

- on ne gère que les comptes d'un grade inférieur au sien ;
- seuls Patron, Co Patron et Développeur web nomment à ces trois grades.

---

## Changements visibles pour les agents

- Les photos ne s'ajoutent plus par lien collé, seulement depuis l'ordinateur. Depuis l'ordinateur en jeu, il n'est donc plus possible d'ajouter une photo. Les liens déjà enregistrés restent affichés.
- WebMap affichée dans l'espace agents, sans nouvel onglet.
- Encadré « En service » dans la barre latérale.
- Agenda : « Visible par », couleur par visibilité, champ « Descriptif ».
