// ENTREPRISE — ce que Dynasty 8 branche sur le socle (contrat : src/socle/contrat.ts).
// Tout src/entreprise/ est libre : ajouter des routes (routes/), des modules métier, des tâches planifiées.
import type { Entreprise } from '../socle/contrat.js';
import { carte, relaisCarte } from './carte.js';
import { simulerBotsDiscord } from './discord-simulation.js';
import { PARAMETRES } from './parametres.js';
import { planifierNettoyagePhotos } from './photos.js';
import { planifierPurge } from './purge.js';
import { recevoirCandidature } from './rh.js';
import { planifierServices, recevoirDuty } from './services.js';
import { accueil } from './routes/accueil.js';
import { agenda } from './routes/agenda.js';
import { apparence } from './routes/apparence.js';
import { biens } from './routes/biens.js';
import { compta } from './routes/compta.js';
import { messagerie } from './routes/messagerie.js';
import { profils } from './routes/profils.js';
import { rh } from './routes/rh.js';
import { services } from './routes/services.js';
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
    webmap: 'parametres',   // réservée à la Direction
  },

  // apparence en premier : elle répond sur les adresses des images de la marque, avant le fichier livré
  routes: [apparence, vitrine, biens, profils, messagerie, agenda, rh, stats, compta, services, accueil],

  // page Paramètres (socle) : liens et réglages de Dynasty 8, déclarés dans parametres.ts
  parametres: PARAMETRES,

  // WebMap : relayée sur son sous-domaine, servi à part du site (carte.ts) ; le site l'affiche toujours dans un cadre
  // (page webmap.html, accueil, espace agents), jamais dans un autre onglet
  ...(carte && { hotes: { [carte.hote]: relaisCarte } }),
  // cadres permis : la carte, et le lecteur Google Slides des guides de cohérence (coherences-guides.js : chargé quand
  // il arrive à l'écran, sur la page d'une cohérence ; seule source du règlement de chaque zone, tenu par la Direction ; annoncé dans confidentialite.html)
  // (en dev, la carte est en http sur carte.localhost : le socle l'accepte avec DEV_LOGIN seulement)
  csp: { frame: ['https://docs.google.com', ...(carte ? [carte.url] : [])] },

  // événements du bot Discord entreprise (docs/webhooks.md) : candidatures acceptées → fiches RH
  webhooks: {
    'recruitment.updated': recevoirCandidature,
    // prises et fins de service (journaux FiveM lus par le bot) : indicateur « En service » et Accueil
    'monitoring.duty': recevoirDuty,
  },

  // les biens d'un agent supprimé restent (son nom gardé aussi : c'est l'historique de l'agence) ; son profil public
  // disparaît, et sa photo de profil comme ses photos envoyées mais jamais utilisées partent au nettoyage. Ventes,
  // lignes du tableur et comptabilité restent (historique de la paie), détachées du compte.
  avantSuppressionCompte: async (compteId, tx) => {
    const compte = await tx.compte.findUnique({ where: { id: compteId }, select: { discordId: true } });
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
    // son agenda personnel disparaît ; ses événements partagés restent pour l'équipe, sans son nom
    if (compte) await tx.invitationAgenda.deleteMany({ where: { discordId: compte.discordId } });
    await tx.evenementAgenda.deleteMany({ where: { compteId, destination: 'perso' } });
    await tx.evenementAgenda.updateMany({ where: { compteId }, data: { compteId: null, auteurNom: '' } });
    await tx.photo.updateMany({ where: { compteId, usage: 'profil' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId, statut: 'temporaire' }, data: { statut: 'a_supprimer' } });
    await tx.photo.updateMany({ where: { compteId }, data: { compteId: null } });
  },

  avantSuppressionGrade: async (gradeCle, tx) => {
    await tx.agendaDroitsGrade.deleteMany({ where: { gradeCle } });
    const droits = await tx.agendaDroitsGrade.findMany();
    for (const ligne of droits) {
      await tx.agendaDroitsGrade.update({
        where: { gradeCle: ligne.gradeCle },
        data: {
          consulter: ligne.consulter.filter(cle => cle !== gradeCle),
          creer: ligne.creer.filter(cle => cle !== gradeCle),
          modifier: ligne.modifier.filter(cle => cle !== gradeCle),
        },
      });
    }
    await tx.evenementAgenda.updateMany({
      where: { destination: 'grade', destinationGrade: gradeCle },
      data: { destination: 'perso', destinationGrade: null },
    });
  },

  demarrage: async () => {
    planifierNettoyagePhotos();
    planifierTableur();
    planifierPurge();
    planifierServices();
    simulerBotsDiscord();   // développement seulement (DISCORD_BOT_TOKEN=simulation)
  },
};
