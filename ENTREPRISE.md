# Notes propres à ce site

Fichier **personnalisable**, importé par `CLAUDE.md` : ce qu'un agent (ou un développeur) doit savoir de cette entreprise en particulier. Dans le dépôt modèle, il ne décrit que l'exemple fourni ; dans un site, le réécrire.

## L'entreprise

- Activité : *à compléter* (secteur, ce que le site vend ou gère).
- Serveur Discord : *à compléter* (rôles liés aux grades, bot entreprise utilisé ou non, webhooks abonnés).

## Ce que le site ajoute au socle

| Domaine | Permission | Pages (`gestion/`) | Routes (`server/src/entreprise/`) | Tables (`entreprise.prisma`) |
|---|---|---|---|---|
| Annonces internes (exemple du modèle) | `annonces` (publier) ; lecture : tout compte validé | `annonces.html`, aperçu dans `accueil.html` | `routes/annonces.ts` | `annonces` |

Événements du bot traités (`entreprise.webhooks`) : `absence.updated` (exemple : une absence acceptée devient une annonce).

## Pièges propres à ce site

- *à compléter au fil de l'eau.*
