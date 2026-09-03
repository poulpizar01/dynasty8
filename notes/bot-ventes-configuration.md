# Configuration du bot de ventes — première mise en service

Le bot Discord qui doit enregistrer automatiquement les ventes de l'équipe n'est pas encore configuré. Voici tout ce qu'il faut pour le brancher, directement sur le nouveau site (Railway) — pas besoin de passer par l'ancien site Cloudflare, qui n'a jamais servi pour ça.

## Adresse à appeler

```
POST https://dynasty8-production.up.railway.app/api/stats/ventes
```

## Authentification

Le bot doit envoyer, dans chaque requête, l'en-tête suivant :

```
Authorization: Bearer <clé secrète>
```

La clé secrète est déjà créée côté site (variable `STATS_BOT_SECRET`). Elle est visible dans le tableau de bord Railway (Variables du service `dynasty8`) — c'est Paul qui doit la communiquer à la personne qui programme le bot, en privé (jamais par un canal public ni collée dans un chat non chiffré).

## Format des données envoyées (JSON)

```json
{
  "eventId": "un identifiant unique généré par le bot pour CETTE vente",
  "numeroVente": "12345",
  "dateVente": "03/09/2026",
  "identite": "Prénom Nom du vendeur (RP)",
  "formateur": "",
  "identiteClient": "Prénom Nom du client (RP)",
  "numeroTel": "",
  "interieur": "",
  "garage": "",
  "garageIndispo": "",
  "garageRefus": "",
  "entrepriseIdentite": "",
  "idEntreprise": "",
  "type": "Vente",
  "loc": null,
  "achat": 1500000,
  "semaine": "S36-26"
}
```

Points d'attention (sources d'erreurs les plus courantes) :
- **`eventId`** *(nouveau, obligatoire)* — voir la section dédiée juste en dessous.
- **`type`** : uniquement `"Vente"` ou `"Location"` — exactement ces deux mots, avec la majuscule. Toute autre valeur (`"Achat"`, `"vente"`, `"LOCATION"`...) est refusée.
- **`semaine`** : format `"S" + numéro de semaine + "-" + année sur 2 chiffres`, par exemple `"S36-26"` pour la semaine 36 de 2026.
- **`dateVente`** : format `JJ/MM/AAAA`.
- **`identite`** est obligatoire (le nom RP du vendeur) ; tous les autres champs texte sont optionnels et peuvent être laissés vides (`""`).
- **`loc`** : uniquement utilisé si `type` = `"Location"` (nombre de jours/semaines de location) ; sinon laisser à `null`.
- **`achat`** : le montant de la vente, en chiffres.

## `eventId` — éviter les ventes enregistrées en double

Si le bot envoie une vente mais que la réponse se perd (coupure réseau, timeout...), il ne sait pas si la vente a bien été enregistrée ou non. Sans précaution, un simple renvoi de la même requête créerait une deuxième ligne, et compterait la vente deux fois dans la paie de l'agent.

**La règle à suivre côté bot : générer, pour chaque vente, un identifiant unique qui ne change jamais — même si la requête est renvoyée.** Concrètement :
- Dès qu'une vente RP est détectée, générer un identifiant (un UUID, par exemple `a1b2c3d4-...`, ou tout texte garanti unique).
- Garder cet identifiant en mémoire le temps de l'envoi.
- Si la requête échoue ou ne répond pas, **renvoyer exactement la même requête avec le même `eventId`** (pas un nouveau).
- Ne générer un nouvel `eventId` que pour une vente réellement différente.

Le site se charge du reste automatiquement :

| Situation | Ce qui se passe | Code HTTP | Réponse |
|---|---|---|---|
| Premier envoi de cet `eventId` | La vente est créée | `200` | `{"ok":true}` |
| Renvoi du **même** `eventId`, avec les **mêmes** données | Rien n'est recréé ; le site confirme que c'était déjà enregistré | `200` | `{"ok":true,"dejaTraite":true}` |
| Renvoi du **même** `eventId`, avec des données **différentes** | Refusé (protection contre un `eventId` mal réutilisé) | `409` | `{"erreur":"..."}` |
| `eventId` manquant ou vide | Refusé | `400` | `{"erreur":"eventId est obligatoire."}` |

Un identifiant technique côté base de données garantit qu'il ne peut jamais exister deux ventes avec le même `eventId`, même dans le cas (rare) où deux requêtes identiques arriveraient pile au même moment.

## Réponses possibles

| Situation | Code HTTP | Réponse |
|---|---|---|
| Tout est correct (nouvelle vente) | `200` | `{"ok":true}` |
| Renvoi d'une vente déjà enregistrée (même `eventId`, mêmes données) | `200` | `{"ok":true,"dejaTraite":true}` |
| Pas d'en-tête `Authorization`, ou mauvaise clé | `401` | `{"erreur":"Clé du bot invalide."}` |
| `eventId` réutilisé avec des données différentes | `409` | `{"erreur":"..."}` |
| Un champ obligatoire manque ou est mal formaté | `400` | `{"erreur":"..."}` (message précis selon le champ) |

---

## Procédure de test (à faire une fois le bot branché)

Ces trois tests permettent de vérifier que tout fonctionne avant de laisser le bot tourner pour de vrai. Ils peuvent être exécutés depuis n'importe quel ordinateur avec `curl` (ou un outil comme Postman/Insomnia).

**Remplacer `VRAIE_CLE_SECRETE` par la vraie valeur de `STATS_BOT_SECRET` dans les commandes ci-dessous.**

### Test 1 — Sans authentification (doit être refusé)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -d '{"eventId":"test-1-sans-auth","numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":1000,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 401` avec `{"erreur":"Non connecté."}`** (aucune vente ne doit être enregistrée)

### Test 2 — Avec une mauvaise clé (doit être refusé)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer une-fausse-cle" \
  -d '{"eventId":"test-2-mauvaise-cle","numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":1000,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 401` avec `{"erreur":"Clé du bot invalide."}`**

### Test 3 — Avec la vraie clé (doit être accepté)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VRAIE_CLE_SECRETE" \
  -d '{"eventId":"test-3-creation","numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":1000,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 200` avec `{"ok":true}`**

### Test 4 — Renvoi du même `eventId`, mêmes données (simule une coupure réseau) (doit être accepté SANS créer de doublon)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VRAIE_CLE_SECRETE" \
  -d '{"eventId":"test-3-creation","numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":1000,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 200` avec `{"ok":true,"dejaTraite":true}`**

### Test 5 — Même `eventId` que le test 3, mais avec un montant différent (doit être refusé)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VRAIE_CLE_SECRETE" \
  -d '{"eventId":"test-3-creation","numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":99999,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 409` avec `{"erreur":"Cet eventId a déjà été utilisé avec des données différentes."}`**

### Test 6 — Sans `eventId` (doit être refusé)

```bash
curl -i -X POST https://dynasty8-production.up.railway.app/api/stats/ventes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VRAIE_CLE_SECRETE" \
  -d '{"numeroVente":"TEST-000","dateVente":"03/09/2026","identite":"TEST_CONFIGURATION_BOT","type":"Vente","achat":1000,"semaine":"S36-26"}'
```
**Résultat attendu : `HTTP/1.1 400` avec `{"erreur":"eventId est obligatoire."}`**

### Vérifier que la vente est bien enregistrée (une seule fois)

1. Se connecter sur `https://dynasty8-production.up.railway.app` avec un compte Direction.
2. Aller dans la section Statistiques/Comptabilité, semaine **S36-26** (ou la semaine utilisée dans le test).
3. **Une seule** ligne avec l'identité **TEST_CONFIGURATION_BOT** doit apparaître (montant 1000, celui du test 3 — le test 4 n'a rien ajouté, le test 5 a été refusé).

### ⚠️ Nettoyage — étape obligatoire après le test

Ces lignes de test sont fictives et fausseraient les vrais chiffres de paie si elles restaient. Une fois vérifié à l'étape précédente :
1. Toujours dans la section Statistiques, repérer la ligne **TEST_CONFIGURATION_BOT**.
2. La supprimer avec le bouton de suppression de ligne (réservé à la Direction).

Une fois ces six tests passés et la ligne de test supprimée, le bot peut être mis en service normalement.

---

## Important

- **Rien n'a été changé sur l'ancien site Cloudflare** — il continue de fonctionner normalement, indépendamment de cette configuration.
- Cette configuration concerne uniquement la **toute première mise en service** du bot : comme il n'a jamais été branché nulle part, il n'y a pas de bascule à faire, seulement un branchement direct sur le nouveau site.

---
*Document préparé le 3 septembre 2026 dans le cadre de la mise en service du bot de ventes Dynasty 8 sur Railway.*
