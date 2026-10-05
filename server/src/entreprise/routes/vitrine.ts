// ENTREPRISE — lectures publiques de la vitrine : catalogue des biens et équipe. Sans connexion ; un compte qui gère
// les biens voit aussi ceux masqués (aperçu d'une annonce avant de la rendre visible).
import { Router, type Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../socle/db.js';
import { gradeDe, peut } from '../../socle/droits.js';
import { entier } from '../../socle/http.js';
import { bienPublic, CATEGORIES, COHERENCES } from '../biens.js';

export const vitrine = Router();

// la session est ouverte sous /api : un compte validé avec la permission « biens » voit aussi les biens masqués
async function gereLesBiens(req: Request): Promise<boolean> {
  if (!req.session.compteId) return false;
  const c = await prisma.compte.findUnique({ where: { id: req.session.compteId } });
  return !!c && c.statut === 'valide' && peut(c, 'biens');
}

const texte = (v: unknown) => (typeof v === 'string' ? v : '');

// GET /api/biens?id=… (un bien) ou /api/biens?categorie=&zone=&coup_de_coeur=1&vendu=1&meuble=0|1&coherence=&standing=1
vitrine.get('/api/biens', async (req, res) => {
  const tout = await gereLesBiens(req);
  const q = req.query;
  if (q.id !== undefined) {
    const id = entier(q.id);
    const b = id ? await prisma.bien.findUnique({ where: { id } }) : null;
    // un bien masqué n'est pas consultable par son lien direct
    if (!b || (!b.disponible && !tout)) { res.status(404).json({ error: 'Introuvable.' }); return; }
    res.json(bienPublic(b));
    return;
  }
  const vendu = q.vendu === '1', categorie = texte(q.categorie), coherence = texte(q.coherence), zone = texte(q.zone).slice(0, 80);
  const where: Prisma.BienWhereInput = {
    // « Nos dernières ventes » (accueil) est public : un bien vendu y reste même masqué ensuite
    ...(!tout && !vendu && { disponible: true }),
    ...((CATEGORIES as readonly string[]).includes(categorie) && { categorie }),
    ...(zone && { zone }),
    ...(q.coup_de_coeur === '1' && { coupDeCoeur: true }),
    ...(vendu && { vendu: true }),
    ...((q.meuble === '1' || q.meuble === '0') && { meuble: q.meuble === '1' }),
    ...(COHERENCES.includes(coherence) && { coherence }),
    ...(q.standing === '1' && { standing: true }),
  };
  const orderBy: Prisma.BienOrderByWithRelationInput[] = vendu ? [{ venduLe: { sort: 'desc', nulls: 'last' } }] : [{ coupDeCoeur: 'desc' }, { majLe: 'desc' }];
  const biens = await prisma.bien.findMany({ where, orderBy, take: 500 });
  res.json({ biens: biens.map(bienPublic) });
});

// GET /api/equipe : agents validés, du grade le plus haut au plus bas
vitrine.get('/api/equipe', async (_req, res) => {
  const comptes = await prisma.compte.findMany({ where: { statut: 'valide' }, select: { id: true, nom: true, pseudo: true, gradeCle: true } });
  const profils = new Map((await prisma.profil.findMany({ where: { compteId: { in: comptes.map(c => c.id) } } })).map(p => [p.compteId, p]));
  const position = (cle: string | null) => gradeDe(cle)?.position ?? Number.MAX_SAFE_INTEGER;
  const membres = comptes
    .sort((a, b) => position(a.gradeCle) - position(b.gradeCle) || (a.nom ?? a.pseudo).localeCompare(b.nom ?? b.pseudo, 'fr', { sensitivity: 'base' }))
    .map(c => {
      const p = profils.get(c.id);
      return { id: c.id, pseudo: c.nom ?? c.pseudo, poste: p?.poste || gradeDe(c.gradeCle)?.libelle || 'Agent immobilier', specialite: p?.specialite ?? '', bio: p?.bio ?? '', photo: p?.photo ?? '' };
    });
  res.json({ membres });
});
