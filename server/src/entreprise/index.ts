// ENTREPRISE — ce que Dynasty 8 branche sur le socle (contrat : src/socle/contrat.ts).
// Tout src/entreprise/ est libre : ajouter des routes (routes/), des modules métier, des tâches planifiées.
import type { Entreprise } from '../socle/contrat.js';
import { annonces } from './routes/annonces.js';
import { vitrine } from './routes/vitrine.js';
import { prisma } from '../socle/db.js';

export const entreprise: Entreprise = {
  // niveau d'accès de chaque page de gestion/ (sans .html) : 'public', 'connecte', 'valide' ou une permission.
  // Non déclarée = compte validé. index, attente et refuse sont réglées par le socle.
  pages: {
    accueil: 'valide',
    compte: 'valide',
    annonces: 'valide',
    comptes: 'comptes',
    grades: 'grades',
  },

  routes: [vitrine, annonces],

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

  // les annonces d'un compte supprimé restent, sans auteur
  avantSuppressionCompte: async (compteId, tx) => {
    await tx.annonce.updateMany({ where: { compteId }, data: { compteId: null } });
  },
};
