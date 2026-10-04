# Bot Discord « Roxwood Network Entreprise » — candidatures → fiches RH

Le bot ([poulpizar01/roxwood-network-entreprise](https://github.com/poulpizar01/roxwood-network-entreprise))
fait foi : le site reçoit son webhook `recruitment.updated` tel qu'il
l'envoie, sans rien changer au bot. Quand une candidature passe à
**Accepté** (bouton « Statut » du message de suivi, ou automatiquement par
le log FiveM d'embauche), la fiche de l'employé est créée dans l'onglet
**Ressources humaines**, active.

## 1. Côté bot : créer l'abonnement

Dans le salon panneau du bot : **Monitoring → Ajouter un webhook**
(permission Discord « Gérer le serveur ») :

- type : **Candidatures** (`recruitment.updated`) ;
- URL : `https://<adresse du site>/api/rh/bot/candidatures`.

Le bot affiche alors un **secret, une seule fois**. Le copier tout de suite.

## 2. Côté site : le secret

Dans le `.env` du serveur, puis redémarrer le site :

```env
RECRUTEMENT_WEBHOOK_SECRET=<le secret affiché par le bot>
```

Jamais dans Git ni dans un message Discord. En cas de doute sur une fuite :
retirer l'abonnement dans le bot, en recréer un, et remplacer la valeur.
Tant que la variable manque, le site répond `503` et le bot réessaie (jusqu'à
10 fois, sur plusieurs heures) : rien n'est perdu le temps de la régler.

## 3. Côté site : les réglages

Onglet **Ressources humaines → Arrivées reçues du bot** (Patron, Co Patron,
Développeur web) :

| Réglage | Rôle |
|---|---|
| Grade à l'arrivée | grade de la fiche créée (jamais Patron, Co Patron, Développeur web) |
| ID du serveur Discord | si renseigné, seules les candidatures de ce serveur sont acceptées |
| Prénom et nom (une seule question) | ex. « Nom RP » (question par défaut du bot) : premier mot = prénom, le reste = nom |
| Prénom / Nom (questions séparées) | à la place de la précédente, si le formulaire pose deux questions |
| Téléphone, RIB, ID employé | facultatifs ; sans ID employé, la fiche reçoit un ID provisoire `PROV-B…` |

Chaque question se désigne par son **libellé**, tel qu'il est réglé dans le
bot (panneau **Recrutement → questions du formulaire**, 5 au plus). Les
majuscules et les accents ne comptent pas. Les libellés déjà reçus sont
proposés à la saisie.

Le formulaire par défaut du bot (Nom RP, Âge, Expérience RP, Disponibilités,
Motivation) ne demande ni téléphone ni RIB : pour les recevoir, il faut
ajouter ces questions dans le bot.

## 4. Ce que fait le site

- **Seul le statut « Accepté » crée une fiche.** Les autres envois
  (formulaire soumis, entretien, refus, recruteur assigné) sont acquittés et
  ignorés.
- **Un ticket = une fiche** : le bot renvoie l'état complet à chaque
  changement, un même ticket ne crée jamais une deuxième fiche.
- **Un compte Discord = une fiche** : s'il en a déjà une, elle n'est pas
  modifiée (RH fait foi) ; si elle est inactive, elle n'est pas réactivée
  d'office, c'est signalé dans RH.
- **Date d'arrivée** : le jour de l'acceptation, à l'heure de Paris.
- **« À traiter »** : une candidature acceptée qui ne peut pas encore devenir
  une fiche (réglage manquant, nom d'un seul mot, ID employé déjà pris…) est
  gardée avec son motif. Une fois le réglage corrigé, bouton **Retraiter**.
  Ses réponses (qui peuvent contenir téléphone et RIB) ne sont gardées que
  le temps de ce traitement, 30 jours au plus, et ne sont jamais affichées.

## 5. Réponses du site (visibles dans les journaux du bot)

| Cas | Code |
|---|---|
| Fiche créée | `201` |
| Déjà une fiche pour ce compte Discord, ou ticket déjà traité | `200` |
| Candidature pas encore acceptée (ignorée) | `200` |
| Acceptée, gardée « à traiter » dans RH | `202` |
| Signature invalide (mauvais secret) | `401` |
| Serveur Discord non autorisé | `403` |
| Type d'événement autre que « Candidatures » | `400` |
| Secret absent du serveur | `503` (le bot réessaie) |

Le bot ne réessaie jamais un `4xx` : un `401` dans ses journaux veut dire que
le secret du `.env` ne correspond pas à celui de l'abonnement.

## 6. Liaison avec les ventes

La fiche porte l'ID Discord du candidat. Les ventes du bot de ventes s'y
rattachent si elles envoient ce même `discordId`, sinon par le pseudo
Discord, à renseigner dans la fiche (le webhook du bot ne transmet pas le
pseudo).
