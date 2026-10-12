# Notes propres à ce site

Fichier **personnalisable**, importé par `CLAUDE.md` : ce qu'un agent (ou un développeur) doit savoir de cette entreprise en particulier. Dans le dépôt modèle, il ne décrit que l'exemple fourni ; dans un site, le réécrire.

Seulement ce qui est propre au site : ses modules, tables, routes, conventions et pièges. Une règle qui vaudrait pour tout site (sécurité, en jeu, déploiement…) va dans le modèle (`CLAUDE.md`, `docs/`), pour que tous les sites en profitent ; ici, un renvoi suffit.

## L'entreprise

- Activité : *à compléter* (secteur, ce que le site vend ou gère).
- Serveur Discord : *à compléter* (rôles liés aux grades, bot entreprise utilisé ou non, webhooks abonnés).

## Ce que le site ajoute au socle

| Domaine | Permission | Pages (`gestion/`) | Routes (`server/src/entreprise/`) | Tables (`entreprise.prisma`) |
|---|---|---|---|---|
| Comptabilité (commune aux entreprises du serveur) | `compta` | `comptabilite.html` : relevé Tablettes collé, rémunération par grade (salaire fixe, paie à l'heure), déclaration DOT | `routes/compta.ts` ; calculs purs `compta/releve.ts` (tests `test/compta.test.ts`) ; **part variable propre à l'entreprise** (primes, commissions) : `compta/remuneration.ts`, à adapter | `compta_imports`, `compta_dot_ecritures`, `dot_bareme_imposition` (barème du serveur, rempli par la migration), `remunerations_grades` |
| Annonces internes (exemple du modèle) | `annonces` (publier) ; lecture : tout compte validé | `annonces.html`, aperçu dans `accueil.html` | `routes/annonces.ts` | `annonces` |

Événements du bot traités (`entreprise.webhooks`) : `absence.updated` (exemple : une absence acceptée devient une annonce).

## Pièges propres à ce site

- *à compléter au fil de l'eau.*
