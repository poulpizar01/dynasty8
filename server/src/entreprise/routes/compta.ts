// ENTREPRISE (exemple commun) — comptabilité, permission « compta » : relevé Tablettes collé, rémunération par grade,
// déclaration DOT de la semaine. Calculs : compta/releve.ts (purs, testés) ; part variable propre à l'entreprise :
// compta/remuneration.ts. Page : gestion/comptabilite.html.
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { gradeDe, tousLesGrades } from '../../socle/droits.js';
import { body, intParam, permission, text } from '../../socle/http.js';
import { caBrut, corrigerLigneTotale, estTotal, resumeDot, salariesDuReleve, type RemunerationGrade } from '../compta/releve.js';
import { partVariable } from '../compta/remuneration.js';

export const compta = Router();
const gerer = permission('compta');

// bornes d'un relevé collé (le corps JSON est de toute façon limité par le socle)
const MAX_COLONNES = 20, MAX_LIGNES = 500, MAX_CELLULE = 300;

async function dernierReleve() {
  const r = await prisma.importCompta.findFirst({ where: { type: 'tablettes' }, orderBy: [{ importeLe: 'desc' }, { id: 'desc' }] });
  const colonnes = (r?.colonnes as string[] | undefined) ?? [];
  if (!r || !colonnes.length) return null;   // une réinitialisation enregistre un import vide : « aucun relevé »
  const auteur = r.compteId ? await prisma.compte.findUnique({ where: { id: r.compteId }, select: { nom: true, pseudo: true } }) : null;
  return { colonnes, lignes: corrigerLigneTotale(colonnes, r.lignes as string[][]), importeLe: r.importeLe, importePar: auteur ? auteur.nom ?? auteur.pseudo : null };
}
const enregistrerReleve = (colonnes: string[], lignes: string[][], compteId: number) =>
  prisma.importCompta.create({ data: { type: 'tablettes', colonnes, lignes, compteId } });

// rémunération de chaque grade du site, retrouvée par sa clé comme par son libellé (colonne « Rang » du relevé)
async function remunerations(): Promise<Map<string, RemunerationGrade>> {
  const parCle = new Map((await prisma.remunerationGrade.findMany()).map(r => [r.gradeCle, r]));
  const m = new Map<string, RemunerationGrade>();
  for (const g of tousLesGrades()) {
    const r = parCle.get(g.cle);
    const rem = { libelle: g.libelle, salaireFixe: r?.salaireFixe ?? 0, salaireActif: r?.salaireActif ?? false, tauxHoraire: r?.tauxHoraire ?? 0 };
    m.set(g.cle, rem);
    m.set(g.libelle, rem);
  }
  return m;
}
async function salaries() {
  const r = await dernierReleve();
  return r ? salariesDuReleve({ colonnes: r.colonnes, lignes: r.lignes, grades: await remunerations(), partVariable }) : { salaries: [], total: 0 };
}

// ---------- relevé Tablettes ----------
compta.get('/api/compta/releve', ...gerer, async (_req, res) => {
  const r = await dernierReleve();
  res.json({ releve: r, salaries: r ? (await salaries()).salaries : [] });
});

// le navigateur découpe le tableau collé ; le serveur revalide (jamais de confiance aveugle) et garde chaque import
compta.post('/api/compta/releve', ...gerer, async (req, res) => {
  const b = body(req);
  const colonnes = (Array.isArray(b.colonnes) ? b.colonnes : []).map(c => text(c, MAX_CELLULE)).slice(0, MAX_COLONNES).filter(Boolean);
  if (!colonnes.length) { res.status(400).json({ error: 'Aucune colonne trouvée : la première ligne collée doit contenir les titres des colonnes.' }); return; }
  const brutes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, MAX_LIGNES);
  if (!brutes.length) { res.status(400).json({ error: 'Aucune ligne sous les titres de colonnes : collez le relevé en entier.' }); return; }
  const lignes = corrigerLigneTotale(colonnes, brutes.map(l => (Array.isArray(l) ? l : []).map(c => String(c ?? '').slice(0, MAX_CELLULE))))
    .map(l => colonnes.map((_, i) => l[i] ?? ''));
  await enregistrerReleve(colonnes, lignes, req.compte.id);
  res.status(201).json({ ok: true });
});

// retirer une personne du dernier relevé : nouvel import sans elle ; le nom envoyé protège d'un relevé changé entre-temps
compta.delete('/api/compta/releve/lignes/:index', ...gerer, async (req, res) => {
  const r = await dernierReleve();
  const index = intParam(req, 'index');
  if (!r || index < 0 || index >= r.lignes.length) { res.status(404).json({ error: 'Ligne introuvable : rechargez la page.' }); return; }
  if (String(r.lignes[index][0] ?? '').trim() !== text(body(req).nom, MAX_CELLULE)) { res.status(409).json({ error: 'Le relevé a changé depuis l’affichage : rechargez la page avant de retirer une ligne.' }); return; }
  await enregistrerReleve(r.colonnes, r.lignes.filter((_, i) => i !== index), req.compte.id);
  res.json({ ok: true });
});

// réinitialiser ne supprime rien : un import vide, l'historique reste en base
compta.delete('/api/compta/releve', ...gerer, async (req, res) => {
  await enregistrerReleve([], [], req.compte.id);
  res.json({ ok: true });
});

// ---------- rémunération par grade ----------
compta.get('/api/compta/remuneration', ...gerer, async (_req, res) => {
  const parCle = new Map((await prisma.remunerationGrade.findMany()).map(r => [r.gradeCle, r]));
  res.json(tousLesGrades().map(g => {
    const r = parCle.get(g.cle);
    return { grade: g.cle, libelle: g.libelle, couleur: g.couleur, salaireFixe: r?.salaireFixe ?? 0, salaireActif: r?.salaireActif ?? false, tauxHoraire: r?.tauxHoraire ?? 0 };
  }));
});

compta.patch('/api/compta/remuneration/:grade', ...gerer, async (req, res) => {
  const g = gradeDe(String(req.params.grade));
  if (!g) { res.status(404).json({ error: 'Grade introuvable : il a peut-être été supprimé. Rechargez la page.' }); return; }
  const b = body(req), data: { salaireFixe?: number; tauxHoraire?: number; salaireActif?: boolean } = {};
  for (const champ of ['salaireFixe', 'tauxHoraire'] as const) {
    if (b[champ] === undefined) continue;
    const n = b[champ] === null || b[champ] === '' ? 0 : Number(b[champ]);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) { res.status(400).json({ error: 'Le montant doit être un nombre positif.' }); return; }
    data[champ] = Math.round(n);
  }
  if (b.salaireActif !== undefined) data.salaireActif = b.salaireActif === true;
  await prisma.remunerationGrade.upsert({ where: { gradeCle: g.cle }, create: { gradeCle: g.cle, ...data }, update: data });
  res.json({ ok: true });
});

// ---------- déclaration DOT ----------
const TYPES = ['depense', 'retrait'];

compta.get('/api/compta/dot', ...gerer, async (_req, res) => {
  const [releve, ecritures, bareme, s] = await Promise.all([dernierReleve(), prisma.ecritureDot.findMany({ orderBy: { id: 'desc' } }), prisma.baremeImposition.findMany(), salaries()]);
  const somme = (t: string) => ecritures.filter(e => e.type === t).reduce((x, e) => x + e.montant, 0);
  res.json({
    resume: resumeDot({ ca: releve ? caBrut(releve.colonnes, releve.lignes) : null, depenses: somme('depense'), retraits: somme('retrait'), salaires: s.total, bareme }),
    // le relevé utilisé est montré : la Direction vérifie avant de recopier une déclaration réelle
    releve: releve && { importeLe: releve.importeLe, importePar: releve.importePar, personnes: releve.lignes.filter(l => !estTotal(l)).length },
    ecritures: ecritures.map(e => ({ id: e.id, type: e.type, date: e.dateEcriture, justificatif: e.justificatif, montant: e.montant })),
    salaries: s.salaries,
  });
});

compta.post('/api/compta/dot/ecritures', ...gerer, async (req, res) => {
  const b = body(req), type = String(b.type), justificatif = text(b.justificatif, 200), date = text(b.date, 10), montant = Number(b.montant);
  if (!TYPES.includes(type)) { res.status(400).json({ error: 'Type d’écriture inconnu.' }); return; }
  if (!justificatif) { res.status(400).json({ error: 'Écrivez le justificatif (à quoi correspond ce montant).' }); return; }
  if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) { res.status(400).json({ error: 'Date invalide : écrivez-la jj/mm/aaaa.' }); return; }
  if (b.montant === '' || b.montant == null || !Number.isFinite(montant) || Math.abs(montant) > 2_147_483_647) { res.status(400).json({ error: 'Le montant doit être un nombre.' }); return; }
  const e = await prisma.ecritureDot.create({ data: { type, dateEcriture: date, justificatif, montant: Math.round(montant), compteId: req.compte.id } });
  res.status(201).json({ id: e.id });
});

compta.delete('/api/compta/dot/ecritures/:id', ...gerer, async (req, res) => {
  const { count } = await prisma.ecritureDot.deleteMany({ where: { id: intParam(req, 'id') } });
  if (!count) { res.status(404).json({ error: 'Écriture introuvable : rechargez la page.' }); return; }
  res.json({ ok: true });
});

// nouvelle semaine : vide UN des deux tableaux (dépenses OU retraits), jamais l'autre
compta.delete('/api/compta/dot/ecritures', ...gerer, async (req, res) => {
  const type = String(req.query.type ?? '');
  if (!TYPES.includes(type)) { res.status(400).json({ error: 'Type d’écriture inconnu.' }); return; }
  await prisma.ecritureDot.deleteMany({ where: { type } });
  res.json({ ok: true });
});
