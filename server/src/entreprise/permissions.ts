// ENTREPRISE — permissions propres à Dynasty 8, cochées par grade dans la gestion (page Grades).
// Clé : minuscules, chiffres, tirets, stable dans le temps (elle est enregistrée dans les grades) ; « comptes » et
// « grades » appartiennent au socle. Fichier sans import (le socle le lit avant de charger les routes).
// Libellé : lu sous le titre de sa catégorie dans la page Grades (« Ressources humaines », « Comptabilité »…) :
// il ne répète pas la catégorie, mais se comprend seul (« Ajouter un employé », pas « Ajouter »).
import type { Permission } from '../socle/contrat.js';

export const permissions: Permission[] = [
  { cle: 'biens', libelle: 'Gérer les annonces', description: 'Créer, modifier, masquer et supprimer les biens du catalogue ; voir les biens masqués' },
  // Ressources humaines : chaque permission rh-* suppose rh-voir (vérifié par les routes)
  { cle: 'rh-voir', libelle: 'Consulter les fiches', description: 'Voir les fiches employés, l’effectif et les candidatures reçues' },
  { cle: 'rh-creer', libelle: 'Ajouter un employé', description: 'Créer une fiche ; retraiter ou écarter une candidature reçue' },
  { cle: 'rh-modifier', libelle: 'Modifier une fiche', description: 'Changer l’identité, le grade ou les dates d’un employé' },
  { cle: 'rh-desactiver', libelle: 'Enregistrer un départ', description: 'Passer un employé en « ancien employé »' },
  { cle: 'rh-reactiver', libelle: 'Réintégrer un ancien employé', description: 'Remettre un ancien employé dans l’effectif actif' },
  { cle: 'rh-sensible', libelle: 'Consulter le téléphone et le RIB', description: 'Voir et modifier le téléphone et le RIB des employés' },
  { cle: 'rh-parametrer', libelle: 'Régler le recrutement', description: 'Choisir comment les candidatures acceptées sur Discord remplissent les fiches' },
  { cle: 'ventes', libelle: 'Consulter les ventes et statistiques', description: 'Ventes reçues, totaux, anomalies et chiffres du Google Sheets de la Direction' },
  { cle: 'ventes-gerer', libelle: 'Synchroniser le Google Sheets', description: 'Relire à la main le Google Sheets de la Direction (sinon automatique toutes les 20 minutes)' },
  { cle: 'compta', libelle: 'Gérer la comptabilité', description: 'Relevé Tablettes, rémunération (salaires, paliers de primes) et déclaration DOT' },
  { cle: 'agenda-types', libelle: 'Gérer les types d’événements', description: 'Créer, renommer, colorer et supprimer les types qui classent les événements de l’agenda' },
  // « parametres » (liens, services, agenda, apparence) est une permission du socle
];
