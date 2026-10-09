// ENTREPRISE — profil public des agents (page « Notre équipe ») : chaque agent édite le sien ; la Direction (permission
// « comptes ») peut éditer celui d'un agent dont le grade est sous le sien, comme pour le reste de son compte.
import { Router, type Request, type Response } from 'express';
import { prisma } from '../../socle/db.js';
import { auDessusDe } from '../../socle/droits.js';
import { body, intParam, permission, text, valide } from '../../socle/http.js';
import { recevoirImage } from '../../socle/images.js';
import { envoiPhoto, rattacherPhotoProfil } from '../photos.js';

export const profils = Router();

const profilVide = { poste: '', specialite: '', bio: '', photo: '' };
async function lire(compteId: number) {
  const p = await prisma.profil.findUnique({ where: { compteId } });
  return p ? { poste: p.poste ?? '', specialite: p.specialite ?? '', bio: p.bio ?? '', photo: p.photo ?? '' } : profilVide;
}

async function enregistrer(compteId: number, auteurId: number, b: Record<string, unknown>) {
  const photo = typeof b.photo === 'string' && b.photo ? text(b.photo, 512) : null;
  const data = { poste: text(b.poste, 80) || null, specialite: text(b.specialite, 100) || null, bio: text(b.bio, 1000) || null, photo };
  await prisma.$transaction(async tx => {
    const actuel = await tx.profil.findUnique({ where: { compteId } });
    await rattacherPhotoProfil(tx, compteId, auteurId, photo, actuel?.photo ?? null);
    await tx.profil.upsert({ where: { compteId }, create: { compteId, ...data }, update: data });
  });
}

profils.get('/api/profil', ...valide, async (req, res) => { res.json(await lire(req.compte.id)); });
profils.put('/api/profil', ...valide, async (req, res) => {
  await enregistrer(req.compte.id, req.compte.id, body(req));
  res.json(await lire(req.compte.id));
});

// photo envoyée depuis l'ordinateur : renvoie son adresse, à enregistrer ensuite avec le profil
profils.post('/api/profil/photo', ...valide, ...recevoirImage, envoiPhoto('profil'));


// profil d'un autre agent, par la Direction : mêmes règles que la modification de son compte (socle/routes/comptes.ts)
async function cibleGerable(req: Request, res: Response) {
  const cible = await prisma.compte.findUnique({ where: { id: intParam(req, 'id') } });
  if (!cible) { res.status(404).json({ error: 'Compte introuvable.' }); return null; }
  const moi = req.compte;
  if (cible.id !== moi.id && ((cible.proprietaire && !moi.proprietaire) || !auDessusDe(moi, cible.gradeCle))) {
    res.status(403).json({ error: 'Ce compte a un grade égal ou supérieur au tien.' });
    return null;
  }
  return cible;
}
profils.get('/api/profils/:id', ...permission('comptes'), async (req, res) => {
  const cible = await cibleGerable(req, res);
  if (cible) res.json(await lire(cible.id));
});
profils.put('/api/profils/:id', ...permission('comptes'), async (req, res) => {
  const cible = await cibleGerable(req, res);
  if (!cible) return;
  await enregistrer(cible.id, req.compte.id, body(req));
  res.json(await lire(cible.id));
});
