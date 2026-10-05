// ENTREPRISE — permissions propres à Dynasty 8, cochées par grade dans la gestion (page Grades).
// Clé : minuscules, chiffres, tirets, stable dans le temps (elle est enregistrée dans les grades) ; « comptes » et
// « grades » appartiennent au socle. Fichier sans import (le socle le lit avant de charger les routes).
import type { Permission } from '../socle/contrat.js';

export const permissions: Permission[] = [
  { cle: 'biens', libelle: 'Gérer les biens', description: 'Créer, modifier, masquer et supprimer les biens du catalogue ; voir les biens masqués' },
  // exemple du modèle (annonces internes), remplacé à l'étape de la gestion
  { cle: 'annonces', libelle: 'Publier des annonces', description: 'Publier, épingler et retirer les annonces internes' },
];
