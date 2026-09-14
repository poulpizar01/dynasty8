# Bot « Roxwood Network Entreprise » — panneau lecture seule (onglet « Bot Roxwood Network »)

Le bot Discord [roxwood-network-entreprise](https://github.com/poulpizar01/roxwood-network-entreprise)
(recrutement, absences, service client, monitoring FiveM) n'a **aucune API de
lecture** : il ne fait que **pousser** des événements signés vers une adresse
web, depuis son panneau « Monitoring » (bouton « Ajouter un webhook »).

Le site Dynasty 8 reçoit ces événements, les garde en base
(`bot_roxwood_evenements`) et les affiche dans l'espace agents, onglet
**Outils → Bot Roxwood Network** (Direction uniquement). **Tout y est en lecture
seule** : aucune action n'est renvoyée au bot ni à Discord. Pour changer un
statut de candidature, accepter une absence ou marquer une commande payée, on
passe par Discord ; le bot renvoie alors le nouvel état, qui apparaît dans
l'onglet.

## 1. Côté site : la variable `ROXWOOD_WEBHOOK_SECRETS`

Chaque abonnement webhook créé dans le bot possède **son propre secret**,
affiché **une seule fois** à la création. Le site accepte plusieurs secrets à
la fois (un par abonnement), séparés par des virgules :

```env
ROXWOOD_WEBHOOK_SECRETS=secret_candidatures,secret_absences,secret_commandes,secret_monitoring
```

À renseigner dans le fichier `.env` du serveur (`deploy/vps/.env` ou
`deploy/operateur/.env`, jamais commité), puis relancer le site
(`docker compose up -d --build app`). Tant que la variable est vide, l'onglet
affiche « Réception non configurée » et le site répond `503` au bot — qui
**garde l'événement et réessaie plus tard** (jusqu'à 10 tentatives sur
~2 h), donc rien n'est perdu le temps de finir la configuration.

## 2. Côté bot : créer les abonnements

Dans le salon du panneau d'administration du bot (Discord), message
**Monitoring** → **Ajouter un webhook** :

| Type à choisir dans le bot | Ce que ça remplit dans l'onglet |
|---|---|
| `recruitment.updated` (Candidatures) | sous-onglet **Candidatures** |
| `absence.updated` (Absences) | sous-onglet **Absences** |
| `order.updated` (Commandes) | sous-onglet **Commandes** |
| `monitoring.duty`, `monitoring.recruitment`, `monitoring.storage`, `monitoring.invoice`, `monitoring.sale` | sous-onglet **Monitoring** |

Pour **chaque** abonnement :

1. URL de destination : `https://dynasty8.fbfa.fr/api/bot-roxwood/webhook`
   (toujours la même adresse, quel que soit le type).
2. Copier immédiatement le secret affiché, l'ajouter à
   `ROXWOOD_WEBHOOK_SECRETS` (séparé par une virgule des précédents).
3. Le secret ne doit circuler qu'en privé (jamais dans un salon Discord
   public, jamais dans le code). En cas de doute : retirer l'abonnement dans le
   bot, en recréer un, remplacer le secret dans `.env`.

Le type `custom` (contenu libre, alimenté par une synchro Google Sheet côté
bot) est accepté aussi : il n'apparaît que dans le sous-onglet **Journal**,
avec ses données brutes.

## 3. Vérifier que ça marche

1. Provoquer un événement dans Discord (ex. `/absence`, ou passer une
   candidature à « Entretien »).
2. Espace agents → **Bot Roxwood Network** → « Actualiser » : la carte « Événements
   reçus » doit passer à 1 et la ligne apparaître dans le bon sous-onglet.
3. Si rien n'arrive : `docker compose logs -f app` sur le serveur. Une ligne
   `[bot-roxwood] signature refusée` = le secret dans `.env` ne correspond pas
   à celui de l'abonnement (faute de frappe, virgule manquante, ancien secret).
   Aucune ligne du tout = l'URL saisie dans le bot est fausse, ou le bot n'a
   pas encore d'abonnement pour ce type d'événement.

## 4. Ce que le site fait (et ne fait pas)

- Vérifie la signature `X-Signature-256` (HMAC-SHA256 du corps brut) contre
  chaque secret connu, en temps constant ; refuse (`401`) sinon.
- Ignore un renvoi identique (même corps → même empreinte) : pas de doublon si
  le bot réessaie après une coupure.
- Conserve tout (`bot_roxwood_evenements`, colonne `charge` = le `payload`
  du bot tel quel) ; l'onglet montre le **dernier état** de chaque
  candidature / absence / commande, les 150 derniers logs de monitoring et
  les 60 derniers événements bruts.
- Affiche le pseudo du compte du site à la place d'un identifiant Discord
  brut quand la personne a un compte (`membres.discord_id`), sinon
  l'identifiant.
- Ne renvoie **jamais** rien au bot : pas de route d'écriture, pas de bouton
  d'action. L'adresse `/api/bot-roxwood/webhook` n'accepte que `POST` et ne
  renvoie jamais les données stockées.

## Code

- `src/bot-roxwood.js` — vérification de signature, validation, clé d'objet.
- `src/index.js` — routes `POST /api/bot-roxwood/webhook` et
  `GET /api/bot-roxwood/apercu` (Direction).
- `public/admin.html` / `public/admin.js` — onglet « Bot Roxwood Network ».
- `schema.postgres.sql` — table `bot_roxwood_evenements`.
- `tests/bot-roxwood.test.js` — tests de la signature et de la validation.
