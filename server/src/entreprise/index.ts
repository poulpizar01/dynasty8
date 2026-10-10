// ENTREPRISE — ce que Dynasty 8 branche sur le socle (contrat : src/socle/contrat.ts).
// Tout src/entreprise/ est libre : ajouter des routes (routes/), des modules métier, des tâches planifiées.
import type { Entreprise } from '../socle/contrat.js';
import { carte, relaisCarte } from './carte.js';
import { apparence } from './apparence.js';
import { parametres } from './parametres.js';
import { planifierNettoyagePhotos } from './photos.js';
import { planifierPurge } from './purge.js';
import { recevoirCandidature } from './rh.js';
import { planifierServices, services } from './services.js';
import { agenda } from './routes/agenda.js';
import { biens } from './routes/biens.js';
import { compta } from './routes/compta.js';
import { messagerie } from './routes/messagerie.js';
import { profils } from './routes/profils.js';
import { rh } from './routes/rh.js';
import { stats } from './routes/stats.js';
import { planifierTableur } from './stats/tableur.js';
import { vitrine } from './routes/vitrine.js';

export const entreprise: Entreprise = {
  // niveau d'accès de chaque page de gestion/ (sans .html) : 'public', 'connecte', 'valide' ou une permission.
  // Non déclarée = compte validé. index, attente et refuse sont réglées par le socle.
  pages: {
    accueil: 'valide',
    compte: 'valide',
    agenda: 'valide',
    biens: 'biens',
    comptes: 'comptes',
    grades: 'grades',
    rh: 'rh-voir',
    statistiques: 'ventes',
    comptabilite: 'compta',
    parametres: 'parametres',
    webmap: 'parametres',   // réservée à la Direction, comme sur l'ancien espace agents
  },

  // apparence en premier : elle répond sur les adresses des images de la marque, avant le fichier livré
  routes: [apparence, vitrine, parametres, biens, profils, messagerie, agenda, rh, stats, compta, services],

  // WebMap : relayée sur son sous-domaine, servi à part du site (carte.ts) ; la vitrine l'affiche dans une iframe (https
  // seulement : en dev, l'iframe est refusée, la carte s'ouvre en pleine page)
  ...(carte && { hotes: { [carte.hote]: relaisCarte } }),
  ...(carte?.url.startsWith('https://') && { csp: { frame: [carte.url] } }),

  // événements du bot Discord entreprise (docs/webhooks.md) : candidatures acceptées → fiches RH
  webhooks: {
    'recruitment.updated': recevoirCandidature,
  },

  // les biens d'un agent supprimé restent (son nom gardé aussi : c'est l'historique de l'agence) ; son profil public
  // disparaît, et sa photo de profil comme ses photos envoyées mais jamais utilisées partent au nettoyage. Ventes,
  // lignes du tableur et comptabilité restent (historique de la paie), détachées du compte.
  avantSuppressionCompte: async (compteId, tx) => {
    await tx.bien.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.profil.deleteMany({ where: { compteId } });
    await tx.vente.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.ligneTableur.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.importCompta.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.ecritureDot.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.apparenceImage.updateMany({ where: { compteId }, data: { compteId: null } });
    // ses conversations disparaissent avec lui, des deux côtés
    await tx.message.deleteMany({ where: { OR: [{ expediteurId: compteId }, { destinataireId: compteId }] } });
    await tx.statutMessagerie.deleteMany({ where: { compteId } });
    await tx.evenementAgenda.deleteMany({ where: { compteId } });
    await tx.photo.updateMany({ where: { compteId, usage: 'profil' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId, statut: 'temporaire' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId }, data: { compteId: null } });
  },

  demarrage: async () => {
    planifierNettoyagePhotos();
    planifierTableur();
    planifierPurge();
    planifierServices();
  },
};
