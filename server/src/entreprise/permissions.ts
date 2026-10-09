// ENTREPRISE — permissions propres à Dynasty 8, cochées par grade dans la gestion (page Grades).
// Clé : minuscules, chiffres, tirets, stable dans le temps (elle est enregistrée dans les grades) ; « comptes » et
// « grades » appartiennent au socle. Fichier sans import (le socle le lit avant de charger les routes).
import type { Permission } from '../socle/contrat.js';

export const permissions: Permission[] = [
  { cle: 'biens', libelle: 'Gérer les biens', description: 'Créer, modifier, masquer et supprimer les biens du catalogue ; voir les biens masqués' },
  // Ressources humaines : chaque permission rh-* suppose rh-voir (vérifié par les routes)
  { cle: 'rh-voir', libelle: 'RH : consulter', description: 'Voir les fiches employés, l’effectif et les arrivées reçues du bot' },
  { cle: 'rh-creer', libelle: 'RH : ajouter', description: 'Créer une fiche ; approuver, retraiter ou écarter une candidature reçue du bot' },
  { cle: 'rh-modifier', libelle: 'RH : modifier', description: 'Modifier une fiche employé' },
  { cle: 'rh-desactiver', libelle: 'RH : désactiver', description: 'Passer un employé « inactif » (départ)' },
  { cle: 'rh-reactiver', libelle: 'RH : réactiver', description: 'Réintégrer un ancien employé' },
  { cle: 'rh-sensible', libelle: 'RH : téléphone et RIB', description: 'Voir et modifier le téléphone et le RIB des employés' },
  { cle: 'rh-parametrer', libelle: 'RH : réglages du bot', description: 'Régler la réception des candidatures du bot (grade d’arrivée, questions du formulaire)' },
  { cle: 'ventes', libelle: 'Ventes & statistiques', description: 'Voir les ventes reçues du bot, les totaux, les anomalies et les chiffres du tableur de la Direction' },
  { cle: 'ventes-gerer', libelle: 'Ventes : gérer', description: 'Lancer la synchronisation du tableur de la Direction' },
  { cle: 'compta', libelle: 'Comptabilité', description: 'Relevé Tablettes, rémunération (salaires, paliers de primes) et déclaration DOT' },
];
