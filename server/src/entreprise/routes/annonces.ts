// ENTREPRISE (exemple) — annonces internes : lues par tout compte validé, publiées par la permission « annonces ».
// Montre la forme attendue d'une route : une garde du socle en tête, champs nettoyés, 404 sur un identifiant inconnu.
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { body, intParam, permission, text, valide } from '../../socle/http.js';

export const annonces = Router();

annonces.get('/api/annonces', ...valide, async (_req, res) => {
  const liste = await prisma.annonce.findMany({ orderBy: [{ epingle: 'desc' }, { creeLe: 'desc' }], take: 100 });
  // auteurs : un compte supprimé n'a plus de nom (compteId null)
  const ids = [...new Set(liste.map(a => a.compteId).filter((id): id is number => id !== null))];
  const auteurs = new Map((await prisma.compte.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true, pseudo: true } })).map(c => [c.id, c.nom ?? c.pseudo]));
  res.json(liste.map(a => ({ id: a.id, titre: a.titre, texte: a.texte, epingle: a.epingle, creeLe: a.creeLe, auteur: a.compteId ? auteurs.get(a.compteId) ?? null : null })));
});

annonces.post('/api/annonces', ...permission('annonces'), async (req, res) => {
  const b = body(req), titre = text(b.titre, 120), texte = text(b.texte, 4000);
  if (!titre || !texte) { res.status(400).json({ error: 'Titre et texte requis.' }); return; }
  const a = await prisma.annonce.create({ data: { titre, texte, epingle: b.epingle === true, compteId: req.compte.id } });
  res.status(201).json({ id: a.id });
});

annonces.patch('/api/annonces/:id', ...permission('annonces'), async (req, res) => {
  const { count } = await prisma.annonce.updateMany({ where: { id: intParam(req, 'id') }, data: { epingle: body(req).epingle === true } });
  if (!count) { res.status(404).json({ error: 'Annonce introuvable.' }); return; }
  res.json({ ok: true });
});

annonces.delete('/api/annonces/:id', ...permission('annonces'), async (req, res) => {
  const { count } = await prisma.annonce.deleteMany({ where: { id: intParam(req, 'id') } });
  if (!count) { res.status(404).json({ error: 'Annonce introuvable.' }); return; }
  res.json({ ok: true });
});
