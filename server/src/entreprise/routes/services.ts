// ENTREPRISE — routes des membres en service (/api/services/…) : encadré de la barre latérale, état de la lecture dans
// Paramètres (logique : entreprise/services.ts).
import { Router } from 'express';
import { config } from '../../socle/config.js';
import { prisma } from '../../socle/db.js';
import { permission, valide } from '../../socle/http.js';
import { entierRegle, parametre } from '../parametres.js';
import { nomComplet } from '../rh.js';
import { lectureReglee } from '../services.js';

export const services = Router();

// qui est en service, depuis quand (encadré de la barre latérale) : tout compte validé
services.get('/api/services/en-cours', ...valide, async (_req, res) => {
  const ouverts = await prisma.service.findMany({ where: { fin: null }, orderBy: { debut: 'asc' }, take: 100 });
  const fiches = new Map((await prisma.employe.findMany({ where: { id: { in: ouverts.map(o => o.employeId).filter((x): x is number => x !== null) } } })).map(e => [e.id, e]));
  res.json({
    regle: lectureReglee(),
    enService: ouverts.map(o => { const f = o.employeId ? fiches.get(o.employeId) : undefined; return { nom: f ? nomComplet(f) : o.employeNom, depuis: o.debut, mode: o.mode }; }),
  });
});

// état de la lecture (Paramètres) : dernière passe, erreur, anomalies récentes
services.get('/api/services/etat', ...permission('parametres'), async (_req, res) => {
  const [etat, anomalies, enService] = await Promise.all([
    prisma.serviceEtat.findUnique({ where: { id: 1 } }),
    prisma.service.findMany({ where: { anomalie: { not: '' } }, orderBy: [{ majLe: 'desc' }, { id: 'desc' }], take: 10, select: { employeNom: true, debut: true, fin: true, causeFin: true, anomalie: true } }),
    prisma.service.count({ where: { fin: null } }),
  ]);
  res.json({
    jetonPresent: !!config.discord.botToken, salonRegle: !!parametre('services_salon_id'), clotureHeures: entierRegle('services_cloture_heures'),
    etat: etat && { derniereLecture: etat.derniereLecture, statut: etat.statut, erreur: etat.erreur, nbLus: etat.nbLus, nbReconnus: etat.nbReconnus },
    enService, anomalies,
  });
});
