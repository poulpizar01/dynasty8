// ENTREPRISE — ce que ce site branche sur le socle (contrat : src/socle/contrat.ts).
// Tout src/entreprise/ est libre : ajouter des routes (routes/), des modules métier, des tâches planifiées.
import type { Entreprise } from '../socle/contrat.js';
import { annonces } from './routes/annonces.js';
import { compta } from './routes/compta.js';
import { agenda } from './routes/agenda.js';
import { prisma } from '../socle/db.js';

export const entreprise: Entreprise = {
  // niveau d'accès de chaque page de gestion/ (sans .html) : 'public', 'connecte', 'valide' ou une permission.
  // Non déclarée = compte validé. index, attente et refuse sont réglées par le socle.
  pages: {
    accueil: 'valide',
    compte: 'valide',
    annonces: 'valide',
    agenda: 'valide',
    comptes: 'comptes',
    grades: 'grades',
    parametres: 'parametres',
    comptabilite: 'compta',
  },

  routes: [annonces, compta, agenda],

  // page Paramètres (socle/parametres.ts) : liens et réglages modifiables sans toucher au code. Exemple à adapter :
  // le bouton « Postuler » de la vitrine (data-lien="recrutement") et l'épinglage des annonces.
  parametres: [
    { titre: 'Liens de la vitrine', intro: 'Boutons des pages publiques ; un lien vide masque son bouton.', reglages: [
      { cle: 'recrutement', type: 'lien', public: true, libelle: 'Formulaire de candidature', aide: 'Bouton « Postuler » de la page d’accueil.' },
    ] },
    { titre: 'Annonces', reglages: [
      { cle: 'annonces_epinglees_max', type: 'entier', min: 1, max: 10, defaut: 3, libelle: 'Annonces épinglées au plus', aide: 'Nombre d’annonces gardées en tête de liste.' },
    ] },
    { titre: 'Agenda', reglages: [
      { cle: 'agenda_categories_tickets', type: 'ids-discord', discord: 'categorie', libelle: 'Catégories des tickets', aide: 'Le bot envoie l’invitation dans le ticket ouvert de la personne. Sans ticket trouvé, il essaie de lui écrire en message privé.' },
    ] },
  ],

  // événements du bot Discord entreprise (voir docs/webhooks.md) : un traitement par type d'événement reçu.
  // Exemple : une absence acceptée devient une annonce. À remplacer par ce dont l'entreprise a besoin.
  webhooks: {
    // payload : { requestId, requesterId (ID Discord), startDate, endDate (ISO), reason, status: PENDING|ACCEPTED|REFUSED, … }
    'absence.updated': async e => {
      const p = e.payload as { requesterId?: string; startDate?: string; endDate?: string; status?: string };
      if (p.status !== 'ACCEPTED' || !p.startDate || !p.endDate) return;
      const c = p.requesterId ? await prisma.compte.findUnique({ where: { discordId: String(p.requesterId) } }) : null;
      const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
      await prisma.annonce.create({ data: { titre: `Absence : ${c?.nom ?? c?.pseudo ?? 'un employé'}`, texte: `Du ${jour(p.startDate)} au ${jour(p.endDate)}.` } });
    },
  },

  // Les invitations d'un compte supprimé sont retirées ; ses événements partagés restent, sans auteur.
  avantSuppressionCompte: async (compteId, tx) => {
    const compte = await tx.compte.findUnique({ where: { id: compteId }, select: { discordId: true } });
    await tx.annonce.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.importCompta.updateMany({ where: { compteId }, data: { compteId: null } });
    await tx.ecritureDot.updateMany({ where: { compteId }, data: { compteId: null } });
    if (compte) await tx.invitationAgenda.deleteMany({ where: { discordId: compte.discordId } });
    await tx.evenementAgenda.deleteMany({ where: { compteId, destination: 'perso' } });
    await tx.evenementAgenda.updateMany({ where: { compteId }, data: { compteId: null, auteurNom: '' } });
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
};
