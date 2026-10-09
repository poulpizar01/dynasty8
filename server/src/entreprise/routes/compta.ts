// ENTREPRISE — comptabilité (permission « compta ») : relevé Tablettes collé, écritures et déclaration DOT
// hebdomadaire. Repris de l'ancien serveur (comptabilite, comptaDot…). La rémunération (salaires, paliers de primes)
// est dans routes/stats.ts.
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { tousLesGrades } from '../../socle/droits.js';
import { body, intParam, permission } from '../../socle/http.js';
import { Refus, traiter } from '../refus.js';
import { normaliserTexte } from '../texte.js';
import { primesTableur, recapAvecPrimesTableur, remunerations } from '../stats/recap.js';
import { semaines } from '../stats/ventes.js';

export const compta = Router();
const gerer = permission('compta');

// ---------- relevé Tablettes ----------
// Le navigateur découpe le tableau collé en colonnes et en lignes ; le serveur revalide ce résultat (jamais de
// confiance aveugle), garde chaque import, et ne renvoie que le plus récent.
// bornes de chaque élément ; le relevé entier est de toute façon limité à 64 Ko (corps JSON, socle) : la page le vérifie
// avant l'envoi
const MAX_COLONNES = 20, MAX_LIGNES = 500, MAX_CELLULE = 300;
const nombre = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const minuscules = (c: unknown[]) => c.map(x => String(x).trim().toLowerCase());
// premier titre de colonne qui correspond à l'un des noms possibles (les relevés ne disent pas toujours le même mot)
const indexColonne = (colonnes: string[], alias: string[]) => { for (const a of alias) { const i = colonnes.indexOf(a); if (i !== -1) return i; } return -1; };
const estTotal = (l: unknown[]) => String(l[0] ?? '').trim().toLowerCase() === 'total';

// La ligne récap « TOTAL » collée depuis la tablette saute la case « Rang » (un grade ne se totalise pas), ce qui décale
// le reste de la ligne : on y remet un « - », seulement pour cette ligne et si elle est trop courte. Appliqué à la
// lecture : corrige aussi les relevés importés avant ce correctif.
function corrigerLigneTotale(colonnes: string[], lignes: string[][]) {
  const iRang = indexColonne(minuscules(colonnes), ['rang', 'grade']);
  if (iRang <= 0 || iRang >= colonnes.length - 1) return lignes;
  return lignes.map(l => (estTotal(l) && l.length < colonnes.length ? [...l.slice(0, iRang), '-', ...l.slice(iRang)] : l));
}

async function dernierReleve() {
  const r = await prisma.importCompta.findFirst({ where: { type: 'tablettes' }, orderBy: [{ importeLe: 'desc' }, { id: 'desc' }] });
  const colonnes = (r?.colonnes as string[] | undefined) ?? [];
  // une réinitialisation enregistre un import sans colonnes : comme « aucun relevé »
  if (!r || !colonnes.length) return null;
  const auteur = r.compteId ? await prisma.compte.findUnique({ where: { id: r.compteId }, select: { nom: true, pseudo: true } }) : null;
  // nom RP (modifiable par chacun) suivi du pseudo Discord (non modifiable sur le site) : on sait qui a importé
  return { colonnes, lignes: corrigerLigneTotale(colonnes, r.lignes as string[][]), importeLe: r.importeLe, importePar: auteur ? (auteur.nom ? `${auteur.nom} (@${auteur.pseudo})` : `@${auteur.pseudo}`) : null };
}
const enregistrerReleve = (colonnes: string[], lignes: string[][], compteId: number) =>
  prisma.importCompta.create({ data: { type: 'tablettes', colonnes, lignes, compteId } });

compta.get('/api/compta/tablettes', ...gerer, async (_req, res) => {
  const r = await dernierReleve();
  res.json({ import: r && { colonnes: r.colonnes, lignes: r.lignes, importe_le: r.importeLe, importe_par: r.importePar } });
});

compta.post('/api/compta/tablettes', ...gerer, traiter(async (req, res) => {
  const b = body(req);
  const colonnes = (Array.isArray(b.colonnes) ? b.colonnes : []).map(c => String(c ?? '').trim().slice(0, MAX_CELLULE)).slice(0, MAX_COLONNES).filter(Boolean);
  if (!colonnes.length) throw new Refus('Aucune colonne détectée : la première ligne collée doit contenir les titres des colonnes.');
  const brutes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, MAX_LIGNES);
  if (!brutes.length) throw new Refus('Aucune ligne de données détectée sous les titres de colonnes.');
  const lignes = corrigerLigneTotale(colonnes, brutes.map(l => (Array.isArray(l) ? l : []).map(c => String(c ?? '').slice(0, MAX_CELLULE))))
    .map(l => colonnes.map((_, i) => l[i] ?? ''));
  await enregistrerReleve(colonnes, lignes, req.compte.id);
  res.json({ ok: true });
}));

// retirer une ligne (un membre) du dernier relevé : nouvel import sans elle ; le nom envoyé sert de garde-fou si le
// relevé a changé entre-temps
compta.delete('/api/compta/tablettes/lignes/:index', ...gerer, traiter(async (req, res) => {
  const r = await dernierReleve();
  if (!r) throw new Refus('Aucun relevé importé.', 404);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= r.lignes.length) throw new Refus('Ligne introuvable.', 404);
  const nom = body(req).nom;
  if (nom != null && String(r.lignes[index][0] ?? '').trim() !== String(nom).trim()) throw new Refus('Le relevé a changé depuis l’affichage : rechargez la page avant de supprimer.', 409);
  const restantes = r.lignes.filter((_, i) => i !== index);
  await enregistrerReleve(r.colonnes, restantes, req.compte.id);
  res.json({ ok: true, restantes: restantes.length });
}));

// réinitialiser ne supprime rien : un import vide, l'historique reste en base
compta.delete('/api/compta/tablettes', ...gerer, async (req, res) => {
  await enregistrerReleve([], [], req.compte.id);
  res.json({ ok: true });
});

// ---------- écritures de la DOT (dépenses déductibles, retraits) ----------
const TYPES_ECRITURE = ['depense', 'retrait'];

compta.get('/api/compta/dot/ecritures', ...gerer, async (_req, res) => {
  const e = await prisma.ecritureDot.findMany({ orderBy: { id: 'desc' } });
  res.json({ ecritures: e.map(x => ({ id: x.id, type: x.type, date_ecriture: x.dateEcriture, justificatif: x.justificatif, montant: x.montant })) });
});

compta.post('/api/compta/dot/ecritures', ...gerer, traiter(async (req, res) => {
  const b = body(req);
  if (!TYPES_ECRITURE.includes(String(b.type))) throw new Refus('Le type doit être « depense » ou « retrait ».');
  const justificatif = String(b.justificatif ?? '').trim();
  if (!justificatif) throw new Refus('Le justificatif est obligatoire.');
  if (justificatif.length > 200) throw new Refus('Le justificatif est trop long (200 caractères max).');
  const date = String(b.date ?? '').trim();
  if (date && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) throw new Refus('La date doit être au format JJ/MM/AAAA.');
  const montant = Number(b.montant);
  if (b.montant == null || b.montant === '' || !Number.isFinite(montant) || Math.abs(montant) > 2_147_483_647) throw new Refus('Le montant doit être un nombre.');
  const e = await prisma.ecritureDot.create({ data: { type: String(b.type), dateEcriture: date, justificatif, montant: Math.round(montant), compteId: req.compte.id } });
  res.status(201).json({ id: e.id });
}));

compta.delete('/api/compta/dot/ecritures/:id', ...gerer, async (req, res) => {
  const { count } = await prisma.ecritureDot.deleteMany({ where: { id: intParam(req, 'id') } });
  if (!count) { res.status(404).json({ error: 'Écriture introuvable.' }); return; }
  res.json({ ok: true });
});

// réinitialiser UN des deux tableaux (dépenses OU retraits), jamais l'autre
compta.delete('/api/compta/dot/ecritures', ...gerer, traiter(async (req, res) => {
  const type = String(req.query.type ?? '').trim();
  if (!TYPES_ECRITURE.includes(type)) throw new Refus('Le paramètre « type » doit être « depense » ou « retrait ».');
  await prisma.ecritureDot.deleteMany({ where: { type } });
  res.json({ ok: true });
}));

// ---------- déclaration DOT ----------
const ALIAS_NOM = ['nom', 'nom de l\'employé', 'nom du salarié', 'employé', 'employe'];
const ALIAS = { run: ['run', 'runs'], facture: ['facture', 'factures'], vente: ['vente', 'ventes'], rang: ['rang', 'grade', 'poste', 'rôle', 'role'] };
// CA brut : colonne « Total entreprise » du relevé (« total » en repli), additionnée ligne par ligne — jamais la ligne
// récap « TOTAL » (comptée deux fois) ni le total calculé par la tablette
const caBrut = (colonnes: string[], lignes: string[][]) => {
  const i = indexColonne(minuscules(colonnes), ['total entreprise', 'total']);
  return i === -1 ? null : Math.round(lignes.filter(l => !estTotal(l)).reduce((s, l) => s + nombre(l[i]), 0));
};
const semaineDemandee = (v: unknown) => String(v ?? '').trim().toUpperCase();

// tableau des salariés « prêt à copier-coller » : RUN / FACTURE / VENTE viennent du relevé Tablettes (retrouvé par nom
// RP), jamais des ventes du bot ; salaire = fixe du grade + primes du tableur
compta.get('/api/compta/dot/salaries', ...gerer, traiter(async (req, res) => {
  const semaine = semaineDemandee(req.query.semaine);
  if (!semaine) throw new Refus('Le paramètre « semaine » est obligatoire (ex : S36-26).');
  const [agents, releve, primePour, remu] = await Promise.all([recapAvecPrimesTableur(semaine), dernierReleve(), primesTableur(), remunerations()]);
  const colonnes = minuscules(releve?.colonnes ?? []);
  const lignes = (releve?.lignes ?? []).filter(l => !estTotal(l));
  const iNom = indexColonne(colonnes, ALIAS_NOM), iRun = indexColonne(colonnes, ALIAS.run), iFacture = indexColonne(colonnes, ALIAS.facture), iVente = indexColonne(colonnes, ALIAS.vente), iRang = indexColonne(colonnes, ALIAS.rang);
  const norme = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const valeur = (l: string[], i: number) => (i === -1 ? 0 : Math.round(nombre(l[i])));
  const utilisees = new Set<string[]>();
  const resultat: Record<string, unknown>[] = agents.map(a => {
    const ligne = iNom === -1 ? undefined : lignes.find(l => { const n = norme(l[iNom]); return n !== '' && (n === norme(a.identiteRp) || n === norme(a.identite)); });
    if (ligne) utilisees.add(ligne);
    const run = ligne ? valeur(ligne, iRun) : 0, facture = ligne ? valeur(ligne, iFacture) : 0, vente = ligne ? valeur(ligne, iVente) : 0;
    return {
      employeId: a.employeId, idEmploye: a.idEmploye, statut: a.statut, identite: a.identite, identiteRp: a.identiteRp, grade: a.grade,
      run, facture, vente, caTotalRealise: run + facture + vente, trouveDansTablette: !!ligne,
      salaireFixe: a.salaireFixe, primeTotale: a.primeTotale, salaireTotal: (a.salaireFixe || 0) + (a.primeTotale || 0),
    };
  });
  // Toute personne du relevé sans fiche RH active est ajoutée : si elle a facturé, elle doit figurer dans la
  // déclaration (signalée « hors RH »). Grade : le rang du relevé ; salaire fixe : celui de ce grade du site s'il existe.
  if (iNom !== -1) {
    const gradeParLibelle = new Map(tousLesGrades().map(g => [normaliserTexte(g.libelle), g.cle]));
    for (const ligne of lignes) {
      if (utilisees.has(ligne)) continue;
      const nom = String(ligne[iNom] ?? '').trim();
      if (!nom) continue;
      const rang = iRang !== -1 ? String(ligne[iRang] ?? '').trim() : '';
      const r = remu(gradeParLibelle.get(normaliserTexte(rang).replace(/-/g, ' ')) ?? gradeParLibelle.get(normaliserTexte(rang)));
      const salaireFixe = r.salaireActif ? r.salaireFixe ?? 0 : 0, primeTotale = primePour(null, nom).primeTotale;
      const run = valeur(ligne, iRun), facture = valeur(ligne, iFacture), vente = valeur(ligne, iVente);
      resultat.push({ identite: nom, identiteRp: nom, grade: rang || '—', run, facture, vente, caTotalRealise: run + facture + vente, trouveDansTablette: true, horsReferentiel: true, salaireFixe, primeTotale, salaireTotal: salaireFixe + primeTotale });
    }
  }
  res.json({ agents: resultat, tabletteTrouvee: !!releve });
}));

// Résumé de la déclaration : CA brut (dernier relevé) − dépenses = bénéfice imposable → tranche du barème → impôts ;
// puis primes de la semaine et retraits. Le relevé utilisé (date, auteur, nombre de lignes) est montré pour que la
// Direction vérifie avant de valider une déclaration réelle.
compta.get('/api/compta/dot/resume', ...gerer, async (req, res) => {
  const semaine = semaineDemandee(req.query.semaine);
  const [releve, ecritures, bareme] = await Promise.all([dernierReleve(), prisma.ecritureDot.findMany(), prisma.baremeImposition.findMany({ orderBy: { seuilMin: 'asc' } })]);
  const ca = releve ? caBrut(releve.colonnes, releve.lignes) : null;
  const depenses = ecritures.filter(e => e.type === 'depense').reduce((s, e) => s + e.montant, 0);
  const retraits = ecritures.filter(e => e.type === 'retrait').reduce((s, e) => s + e.montant, 0);
  const imposable = ca === null ? null : ca - depenses;
  const b = Math.max(0, Math.round(imposable ?? 0));
  const tranche = imposable === null ? null : bareme.find(t => b >= t.seuilMin && b <= t.seuilMax) ?? bareme.at(-1) ?? null;
  const impots = imposable === null || !tranche ? null : Math.round(imposable * tranche.taux);
  const apresImpots = imposable === null || impots === null ? null : imposable - impots;
  const primes = semaine ? (await recapAvecPrimesTableur(semaine)).reduce((s, a) => s + a.totalAVerser, 0) : null;
  res.json({
    semaine: semaine || null, caBrut: ca, caBrutTrouve: ca !== null,
    caBrutSource: releve && ca !== null ? { importeLe: releve.importeLe, importePar: releve.importePar, nbLignes: releve.lignes.filter(l => !estTotal(l)).length } : null,
    depenseDeductible: depenses, beneficeImposable: imposable, tauxImposition: tranche?.taux ?? null, montantImpots: impots,
    beneficeApresImpots: apresImpots, montantTotalPrimes: primes,
    beneficeApresPrimes: apresImpots === null || primes === null ? null : apresImpots - primes,
    // « bénéfice net » tel que décrit par la Direction : après impôts, moins les retraits (les primes sont une ligne à part)
    retraits, beneficeNet: apresImpots === null ? null : apresImpots - retraits,
    plafonds: tranche ? { salaireMaxEmploye: tranche.salaireMaxEmploye, salaireMaxPatron: tranche.salaireMaxPatron, primeMaxEmploye: tranche.primeMaxEmploye, primeMaxPatron: tranche.primeMaxPatron } : null,
  });
});

// semaines proposées pour la déclaration (de la plus ancienne ayant des ventes à la semaine en cours, sans trou)
compta.get('/api/compta/semaines', ...gerer, async (_req, res) => { res.json({ semaines: (await semaines()).semaines }); });
