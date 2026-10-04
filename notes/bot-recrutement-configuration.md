# Bot de recrutement — créer la fiche RH à partir d'un ticket Discord

Quand un ticket de recrutement aboutit, le bot envoie au site les
informations du ticket. Le site crée aussitôt la fiche de l'employé dans
l'onglet **Ressources humaines** (statut actif). Le bot n'a rien d'autre à
faire : RH complète ensuite la fiche si besoin.

## 1. Côté site : la clé `RH_BOT_SECRET`

Une valeur longue et aléatoire, **différente** de `STATS_BOT_SECRET` (bot de
ventes) : celle-ci laisse entrer un téléphone et un RIB. À placer dans le
`.env` du serveur, puis redémarrer le site :

```env
RH_BOT_SECRET=une-longue-valeur-aleatoire
```

La même valeur est donnée à la personne qui héberge le bot, hors du dépôt
(jamais dans Git, ni dans un message Discord public). Sans cette variable, la
réception est désactivée et répond `503`.

Dans l'onglet **Ressources humaines → Arrivées reçues du bot**, Patron,
Co Patron et Développeur web règlent :

- **Grade à l'arrivée** : le grade donné quand le ticket n'en indique pas ;
- **ID du serveur Discord** : si renseigné, seules les arrivées qui portent
  cet ID de serveur sont acceptées.

## 2. Côté bot : la requête

```
POST https://<adresse du site>/api/rh/bot/arrivees
Authorization: Bearer <RH_BOT_SECRET>
Content-Type: application/json
```

```json
{
  "ticketId": "1291234567890123456",
  "serveurDiscord": "1180000000000000000",
  "discordId": "302050872383242240",
  "discordPseudo": "lina.recrue",
  "prenom": "Lina",
  "nom": "Recrue",
  "telephone": "555-0199",
  "rib": "FR76 ...",
  "grade": "",
  "idEmploye": "",
  "dateArrivee": ""
}
```

| Champ | Obligatoire | Contenu |
|---|---|---|
| `ticketId` | oui | identifiant **unique et stable** du ticket (l'ID du salon du ticket convient) |
| `discordId` | oui | ID Discord de la personne recrutée (15 à 22 chiffres) |
| `prenom`, `nom` | oui | identité RP |
| `serveurDiscord` | si l'ID du serveur est réglé dans RH | ID du serveur Discord du ticket |
| `discordPseudo` | non | pseudo Discord ; c'est lui que le bot de ventes envoie, il relie les ventes à la fiche |
| `telephone`, `rib` | non | données sensibles, visibles seulement des grades autorisés |
| `grade` | non | un grade du site (`Stagiaire`, `Agent Novice`, `Agent`…) ; vide = grade d'arrivée réglé dans RH. Patron, Co Patron et Développeur web sont refusés |
| `idEmploye` | non | vide = ID provisoire `PROV-B0042`, à remplacer dans RH |
| `dateArrivee` | non | `AAAA-MM-JJ` ; vide = date du jour (heure de Paris) |

## 3. Les réponses

| Cas | Code | Réponse |
|---|---|---|
| Fiche créée | `201` | `{"ok":true,"resultat":"creee","employeId":42,"idEmploye":"PROV-B0042","idProvisoire":true,"statut":"actif"}` |
| Ce compte Discord a déjà une fiche | `200` | `{"ok":true,"resultat":"existante","motif":"…","employeId":12,…}` |
| Même `ticketId` déjà traité (renvoi) | `200` | la réponse d'origine, avec `"deja":true` |
| Donnée manquante ou invalide | `400` | `{"ok":false,"resultat":"refusee","erreur":"…"}` |
| Serveur Discord non autorisé | `403` | idem |
| ID employé ou pseudo déjà pris | `409` | idem |
| Mauvaise clé | `401` | `{"erreur":"Clé du bot invalide."}` |
| Clé absente du serveur | `503` | réception non configurée |

Un ticket refusé peut être renvoyé une fois corrigé, avec le même `ticketId`.
Un ticket abouti ne crée jamais une deuxième fiche, même renvoyé : en cas de
doute (coupure réseau), le bot peut renvoyer sans risque. Le message
`erreur` est fait pour être affiché tel quel dans le ticket.

Ce que le site ne fait **pas** :

- il ne modifie jamais une fiche existante (RH fait foi) ;
- il ne réactive pas une fiche inactive : la réponse `existante` le signale,
  la décision revient à RH ;
- il ne garde ni téléphone ni RIB ailleurs que sur la fiche : le journal des
  arrivées n'en contient pas.

## 4. Tester

```bash
curl -i -X POST https://<adresse du site>/api/rh/bot/arrivees \
  -H "Authorization: Bearer <RH_BOT_SECRET>" -H "Content-Type: application/json" \
  -d '{"ticketId":"test-1","discordId":"302050872383242240","prenom":"Test","nom":"Bot","grade":"Stagiaire"}'
```

La ligne apparaît dans **Ressources humaines → Arrivées reçues du bot**, et
la fiche dans la liste des employés.
