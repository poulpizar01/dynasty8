// ENTREPRISE — « Mon agenda » : planning personnel de chaque agent (gestion/agenda.html). Chaque requête ne porte que
// sur les événements du compte de la session : impossible de lire ou modifier l'agenda d'un collègue en devinant un
// identifiant (un événement d'un autre compte répond 404, comme un événement inexistant).
import { Router } from 'express';
import type { EvenementAgenda } from '../../generated/prisma/client.js';
import { prisma } from '../../socle/db.js';
import { body, intParam, text, valide } from '../../socle/http.js';

export const agenda = Router();

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
// jour sans heure : stocké en DATE, échangé en AAAA-MM-JJ (jamais d'heure ni de fuseau qui le décalerait)
const versDate = (jour: string) => new Date(`${jour}T00:00:00Z`);
const dateValide = (jour: unknown): jour is string => typeof jour === 'string' && RE_DATE.test(jour) && !Number.isNaN(versDate(jour).getTime()) && versDate(jour).toISOString().startsWith(jour);
const versClient = (e: EvenementAgenda) => ({ id: e.id, titre: e.titre, jour: e.jour.toISOString().slice(0, 10), heure_debut: e.heureDebut, heure_fin: e.heureFin, notes: e.notes });

function lire(b: Record<string, unknown>) {
  const titre = text(b.titre, 80);
  if (!titre) return 'Le titre de l’événement est obligatoire.';
  if (!dateValide(b.jour)) return 'Date invalide.';
  const debut = String(b.heure_debut ?? ''), fin = String(b.heure_fin ?? '');
  if (!RE_HEURE.test(debut)) return 'Heure de début invalide.';
  if (!RE_HEURE.test(fin)) return 'Heure de fin invalide.';
  if (fin <= debut) return 'L’heure de fin doit être après l’heure de début.';
  if (String(b.notes ?? '').length > 500) return 'Les notes sont trop longues (500 caractères maximum).';
  return { titre, jour: versDate(b.jour), heureDebut: debut, heureFin: fin, notes: text(b.notes, 500) };
}

agenda.get('/api/agenda', ...valide, async (req, res) => {
  const { debut, fin } = req.query;
  if (!dateValide(debut) || !dateValide(fin)) { res.status(400).json({ error: 'Plage de dates invalide.' }); return; }
  const evenements = await prisma.evenementAgenda.findMany({
    where: { compteId: req.compte.id, jour: { gte: versDate(debut), lte: versDate(fin) } },
    orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    take: 1000,
  });
  res.json({ evenements: evenements.map(versClient) });
});

agenda.post('/api/agenda', ...valide, async (req, res) => {
  const d = lire(body(req));
  if (typeof d === 'string') { res.status(400).json({ error: d }); return; }
  const e = await prisma.evenementAgenda.create({ data: { ...d, compteId: req.compte.id } });
  res.status(201).json({ id: e.id });
});

agenda.put('/api/agenda/:id', ...valide, async (req, res) => {
  const d = lire(body(req));
  if (typeof d === 'string') { res.status(400).json({ error: d }); return; }
  const { count } = await prisma.evenementAgenda.updateMany({ where: { id: intParam(req, 'id'), compteId: req.compte.id }, data: d });
  if (!count) { res.status(404).json({ error: 'Événement introuvable.' }); return; }
  res.json({ ok: true });
});

agenda.delete('/api/agenda/:id', ...valide, async (req, res) => {
  const { count } = await prisma.evenementAgenda.deleteMany({ where: { id: intParam(req, 'id'), compteId: req.compte.id } });
  if (!count) { res.status(404).json({ error: 'Événement introuvable.' }); return; }
  res.json({ ok: true });
});
