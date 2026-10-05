// ENTREPRISE — routes des ressources humaines (/api/rh/…), page gestion/rh.html. Toutes exigent rh-voir ; chaque
// action vérifie en plus sa propre permission (logique : entreprise/rh.ts).
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Employe } from '../../generated/prisma/client.js';
import { prisma } from '../../socle/db.js';
import { gradeDe } from '../../socle/droits.js';
import { body, intParam, permission } from '../../socle/http.js';
import { arriveesBot, droitsRh, ecarter, fichePublique, gradesEmployes, lireChamps, nomComplet, RefusRh, refusUnicite, reglerBot, traiterEnSuspens, trierEmployes, verifierUnicite, type DroitRh } from '../rh.js';
import { jourValide, versDate } from '../texte.js';

export const rh = Router();
const voir = permission('rh-voir');

// une permission RH en plus de rh-voir
const exiger = (droit: DroitRh, message: string) => (req: Request, res: Response, next: NextFunction) => {
  if (droitsRh(req.compte).has(droit)) next();
  else res.status(403).json({ error: message });
};
// erreurs métier (RefusRh) rendues avec leur statut et leur message
const traiter = (f: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  try { await f(req, res); }
  catch (e) { if (e instanceof RefusRh) res.status(e.status).json({ error: e.message }); else throw e; }
};

rh.get('/api/rh/employes', ...voir, async (req, res) => {
  const droits = droitsRh(req.compte);
  const employes = trierEmployes((await prisma.employe.findMany()).map(e => fichePublique(e, droits)));
  const actifs = employes.filter(e => e.statut === 'actif');
  const parGrade = new Map<string, number>();
  for (const e of actifs) parGrade.set(e.grade, (parGrade.get(e.grade) ?? 0) + 1);
  res.json({
    employes,
    effectif: {
      actifs: actifs.length, inactifs: employes.length - actifs.length,
      parGrade: gradesEmployes().filter(g => parGrade.has(g.cle)).map(g => ({ grade: g.libelle, nombre: parGrade.get(g.cle) })),
    },
    grades: gradesEmployes(),
    droits: [...droits],
  });
});

// fiche détaillée : identité + compte du site relié (même ID Discord)
rh.get('/api/rh/employes/:id', ...voir, async (req, res) => {
  const e = await prisma.employe.findUnique({ where: { id: intParam(req, 'id') } });
  if (!e) { res.status(404).json({ error: 'Employé introuvable.' }); return; }
  const compte = e.discordId ? await prisma.compte.findUnique({ where: { discordId: e.discordId }, select: { nom: true, pseudo: true, gradeCle: true, statut: true } }) : null;
  res.json({
    ...fichePublique(e, droitsRh(req.compte)),
    compteDuSite: compte ? { nom: compte.nom ?? compte.pseudo, grade: gradeDe(compte.gradeCle)?.libelle ?? null, statut: compte.statut } : null,
  });
});

rh.post('/api/rh/employes', ...voir, exiger('creer', 'Vous n’avez pas le droit d’ajouter un employé.'), traiter(async (req, res) => {
  const b = body(req);
  // téléphone et RIB à la création : ignorés sans rh-sensible
  if (!droitsRh(req.compte).has('sensible')) { delete b.telephone; delete b.rib; }
  const champs = lireChamps(b, null);
  await verifierUnicite(champs);
  const e = await prisma.employe.create({ data: { statut: 'actif', ...champs } as Parameters<typeof prisma.employe.create>[0]['data'] }).catch(refusUnicite);
  res.status(201).json({ id: e.id });
}));

rh.patch('/api/rh/employes/:id', ...voir, exiger('modifier', 'Vous n’avez pas le droit de modifier un employé.'), traiter(async (req, res) => {
  const id = intParam(req, 'id'), droits = droitsRh(req.compte), b = body(req);
  const existante = await prisma.employe.findUnique({ where: { id } });
  if (!existante) throw new RefusRh('Employé introuvable.', 404);
  // données sensibles : modifiables seulement avec la permission qui permet de les voir
  if ((b.telephone !== undefined || b.rib !== undefined) && !droits.has('sensible')) throw new RefusRh('Vous n’avez pas accès au téléphone ni au RIB.', 403);
  // le statut change par désactivation / réactivation, avec leurs propres permissions
  if (b.statut !== undefined && b.statut !== existante.statut && !droits.has(b.statut === 'inactif' ? 'desactiver' : 'reactiver')) {
    throw new RefusRh('Vous n’avez pas le droit de changer le statut de cet employé.', 403);
  }
  const champs = lireChamps(b, existante);
  if (champs.idEmploye && champs.idEmploye !== existante.idEmploye) champs.idProvisoire = false;
  if (!Object.keys(champs).length) throw new RefusRh('Rien à modifier.');
  await verifierUnicite(champs, id);
  await prisma.employe.update({ where: { id }, data: champs }).catch(refusUnicite);
  res.json({ ok: true });
}));

// départ : statut inactif + date de départ (aujourd'hui si elle n'est pas donnée) ; réactivation : statut actif, date
// de départ effacée. Rien d'autre ne change : l'historique reste rattaché à la fiche.
async function changerStatut(req: Request, res: Response, statut: 'actif' | 'inactif') {
  const e: Employe | null = await prisma.employe.findUnique({ where: { id: intParam(req, 'id') } });
  if (!e) throw new RefusRh('Employé introuvable.', 404);
  if (e.statut === statut) { res.json({ ok: true, inchange: true }); return; }
  let dateDepart: Date | null = null;
  if (statut === 'inactif') {
    const v = String(body(req).dateDepart ?? '') || new Date().toISOString().slice(0, 10);
    if (!jourValide(v)) throw new RefusRh('La date de départ doit être une date valide (AAAA-MM-JJ).');
    dateDepart = versDate(v);
    if (e.dateArrivee && dateDepart < e.dateArrivee) throw new RefusRh('La date de départ ne peut pas précéder la date d’arrivée.');
  }
  await prisma.employe.update({ where: { id: e.id }, data: { statut, dateDepart } });
  res.json({ ok: true, employe: nomComplet(e) });
}
rh.post('/api/rh/employes/:id/desactiver', ...voir, exiger('desactiver', 'Vous n’avez pas le droit de désactiver un employé.'), traiter((req, res) => changerStatut(req, res, 'inactif')));
rh.post('/api/rh/employes/:id/reactiver', ...voir, exiger('reactiver', 'Vous n’avez pas le droit de réactiver un employé.'), traiter((req, res) => changerStatut(req, res, 'actif')));

// candidatures reçues du bot Discord et réglages de leur lecture
rh.get('/api/rh/bot', ...voir, async (_req, res) => { res.json({ ...(await arriveesBot()), grades: gradesEmployes() }); });
rh.put('/api/rh/bot/reglages', ...voir, exiger('parametrer', 'Vous n’avez pas le droit de régler la réception des candidatures.'), traiter(async (req, res) => {
  await reglerBot(body(req), req.compte);
  res.json({ ok: true });
}));
rh.post('/api/rh/bot/arrivees/:id/traiter', ...voir, exiger('creer', 'Vous n’avez pas le droit d’ajouter un employé.'), traiter(async (req, res) => {
  const r = await traiterEnSuspens(intParam(req, 'id'));
  res.json({ ok: !['refusee', 'attente'].includes(r.resultat), ...r });
}));
rh.post('/api/rh/bot/arrivees/:id/ecarter', ...voir, exiger('creer', 'Vous n’avez pas le droit d’ajouter un employé.'), traiter(async (req, res) => {
  await ecarter(intParam(req, 'id'));
  res.json({ ok: true });
}));
