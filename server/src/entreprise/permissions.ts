// ENTREPRISE — permissions propres à ce site, cochées par grade dans la gestion (page Grades).
// Clé : minuscules, chiffres, tirets, stable dans le temps (elle est enregistrée dans les grades) ; « comptes »,
// « grades » et « parametres » appartiennent au socle. Fichier sans import (le socle le lit avant de charger les routes).
import type { Permission } from '../socle/contrat.js';

export const permissions: Permission[] = [
  // exemple (annonces internes) : à remplacer par celles de l'entreprise (stocks, factures, recrutement…)
  { cle: 'annonces', libelle: 'Publier des annonces', description: 'Publier, épingler et retirer les annonces internes' },
];
