// ENTREPRISE — ce que Dynasty 8 branche sur le socle (contrat : src/socle/contrat.ts).
// Tout src/entreprise/ est libre : ajouter des routes (routes/), des modules métier, des tâches planifiées.
import type { Entreprise } from '../socle/contrat.js';
import { planifierNettoyagePhotos } from './photos.js';
import { biens } from './routes/biens.js';
import { messagerie } from './routes/messagerie.js';
import { profils } from './routes/profils.js';
import { vitrine } from './routes/vitrine.js';

export const entreprise: Entreprise = {
  // niveau d'accès de chaque page de gestion/ (sans .html) : 'public', 'connecte', 'valide' ou une permission.
  // Non déclarée = compte validé. index, attente et refuse sont réglées par le socle.
  pages: {
    accueil: 'valide',
    compte: 'valide',
    biens: 'biens',
    comptes: 'comptes',
    grades: 'grades',
  },

  routes: [vitrine, biens, profils, messagerie],

  webhooks: {},

  // les biens d'un agent supprimé restent (son nom affiché aussi : c'est l'historique de l'agence) ; son profil public
  // disparaît, et sa photo de profil comme ses photos envoyées mais jamais utilisées partent au nettoyage
  avantSuppressionCompte: async (compteId, tx) => {
    await tx.bien.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.profil.deleteMany({ where: { compteId } });
    // ses conversations disparaissent avec lui (des deux côtés, comme sur l'ancien site)
    await tx.message.deleteMany({ where: { OR: [{ expediteurId: compteId }, { destinataireId: compteId }] } });
    await tx.statutMessagerie.deleteMany({ where: { compteId } });
    await tx.photo.updateMany({ where: { compteId, usage: 'profil' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId, statut: 'temporaire' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId }, data: { compteId: null } });
  },

  demarrage: async () => { planifierNettoyagePhotos(); },
};
