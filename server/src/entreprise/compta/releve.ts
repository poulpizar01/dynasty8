// ENTREPRISE — lecture du relevé Tablettes et calculs de la comptabilité : fonctions pures, sans base ni réseau,
// testées par test/compta.test.ts. Une erreur ici se paie en argent RP sans rien d'anormal à l'écran : relancer les
// tests après toute modification.

export const normaliserNom = (v: unknown): string =>
  String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]+/g, ' ');

// les relevés ne disent pas toujours le même mot : premier titre de colonne qui correspond à l'un des noms possibles
export const ALIAS = {
  nom: ['nom', 'nom de l\'employé', 'nom du salarié', 'employé', 'employe'],
  rang: ['rang', 'grade', 'poste', 'rôle', 'role'],
  heures: ['heures de service', 'heure de service', 'heures', 'temps de service', 'durée de service', 'duree de service'],
  total: ['total entreprise', 'total'],
};
export function indexColonne(colonnes: string[], alias: string[]): number {
  const n = colonnes.map(c => String(c).trim().toLowerCase());
  for (const a of alias) { const i = n.indexOf(a); if (i !== -1) return i; }
  return -1;
}
// « 12 500 $ », « 12,5 » → nombre ; 0 si illisible
export const nombre = (v: unknown): number => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const estTotal = (l: unknown[]): boolean => ['total', 'totaux'].includes(normaliserNom(l[0]));

// La ligne récap « TOTAL » collée depuis la tablette saute la case « Rang » (un grade ne se totalise pas), ce qui décale
// le reste : on y remet un « - », seulement pour cette ligne et si elle est trop courte.
export function corrigerLigneTotale(colonnes: string[], lignes: string[][]): string[][] {
  const iRang = indexColonne(colonnes, ALIAS.rang);
  if (iRang <= 0 || iRang >= colonnes.length - 1) return lignes;
  return lignes.map(l => (estTotal(l) && l.length < colonnes.length ? [...l.slice(0, iRang), '-', ...l.slice(iRang)] : l));
}

// Chiffre d'affaires brut : colonne « Total entreprise » (« total » en repli), additionnée ligne par ligne — jamais la
// ligne récap « TOTAL » (comptée deux fois). null : colonne absente.
export function caBrut(colonnes: string[], lignes: string[][]): number | null {
  const i = indexColonne(colonnes, ALIAS.total);
  return i === -1 ? null : Math.round(lignes.filter(l => !estTotal(l)).reduce((s, l) => s + nombre(l[i]), 0));
}

// « 0h52min », « 1h », « 12h05 », « 45min », « 1:05 » → minutes ; null si illisible (jamais deviné)
export function dureeEnMinutes(texte: unknown): number | null {
  const t = String(texte ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t || t === '-') return null;
  let m = t.match(/^(\d{1,4})h(?:(\d{1,2})(?:min|mn|m)?)?$/);
  if (m) return Number(m[2] || 0) < 60 ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
  m = t.match(/^(\d{1,5})(?:min|mn|m)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d{1,4}):(\d{2})(?::\d{2})?$/);
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  return null;
}

// Rémunération d'un grade du site, retrouvé par sa clé ou son libellé (colonne « Rang » du relevé)
export type RemunerationGrade = { libelle: string; salaireFixe: number; salaireActif: boolean; tauxHoraire: number };

export type LigneSalarie = {
  index: number; nom: string; rang: string; grade: string | null;
  salaireFixe: number; heures: string; minutes: number | null; paieHoraire: number; partVariable: number; total: number;
};

// Une ligne par personne du relevé : salaire fixe de son grade (si versé) + paie à l'heure (heures × taux du grade, une
// durée illisible vaut 0 et est signalée) + part variable propre à l'entreprise. Une personne dont le rang ne correspond
// à aucun grade du site ne reçoit rien d'automatique : elle reste dans la liste, sans grade, pour être vérifiée.
export function salariesDuReleve({ colonnes, lignes, grades, partVariable }: {
  colonnes: string[]; lignes: string[][]; grades: Map<string, RemunerationGrade>;
  partVariable: (l: { nom: string; rang: string; colonnes: string[]; ligne: string[] }) => number;
}): { salaries: LigneSalarie[]; total: number } {
  const iNomTrouve = indexColonne(colonnes, ALIAS.nom), iNom = iNomTrouve === -1 ? 0 : iNomTrouve;
  const iRang = indexColonne(colonnes, ALIAS.rang), iHeures = indexColonne(colonnes, ALIAS.heures);
  const parNom = new Map([...grades].map(([cle, g]) => [normaliserNom(cle), g]));
  const salaries: LigneSalarie[] = [];
  lignes.forEach((ligne, index) => {
    const nom = String(ligne[iNom] ?? '').trim();
    if (!nom || estTotal(ligne)) return;
    const rang = iRang === -1 ? '' : String(ligne[iRang] ?? '').trim();
    const g = parNom.get(normaliserNom(rang)) ?? null;
    const heures = iHeures === -1 ? '' : String(ligne[iHeures] ?? '').trim();
    const minutes = dureeEnMinutes(heures);
    const salaireFixe = g?.salaireActif ? Math.round(g.salaireFixe) : 0;
    const paieHoraire = g && g.tauxHoraire > 0 && minutes !== null ? Math.round((minutes * g.tauxHoraire) / 60) : 0;
    const variable = Math.round(Number(partVariable({ nom, rang, colonnes, ligne })) || 0);
    salaries.push({ index, nom, rang, grade: g?.libelle ?? null, salaireFixe, heures, minutes, paieHoraire, partVariable: variable, total: salaireFixe + paieHoraire + variable });
  });
  return { salaries, total: salaries.reduce((s, x) => s + x.total, 0) };
}

export type Tranche = { seuilMin: number; seuilMax: number; taux: number; salaireMaxEmploye: number; salaireMaxPatron: number; primeMaxEmploye: number; primeMaxPatron: number };

// Déclaration DOT : CA brut − dépenses déductibles = bénéfice imposable → tranche du barème → impôts ; puis salaires et
// retraits. Bénéfice net (définition de la DOT) : après impôts, moins les retraits ; les salaires sont une ligne à part.
// Sous la première tranche, pas d'impôt. Tout est null tant qu'aucun relevé avec une colonne de total n'est importé.
export function resumeDot({ ca, depenses, retraits, salaires, bareme }: { ca: number | null; depenses: number; retraits: number; salaires: number; bareme: Tranche[] }) {
  if (ca === null) return { caBrut: null, depenses, retraits, beneficeImposable: null, taux: null, impots: null, apresImpots: null, salaires, apresSalaires: null, net: null, plafonds: null };
  const imposable = ca - depenses;
  const b = Math.max(0, Math.round(imposable));
  const tranches = [...bareme].sort((x, y) => x.seuilMin - y.seuilMin);
  const tranche = tranches.find(t => b >= t.seuilMin && b <= t.seuilMax) ?? (b > (tranches.at(-1)?.seuilMax ?? 0) ? tranches.at(-1) : null) ?? null;
  const impots = tranche ? Math.round(imposable * tranche.taux) : 0;
  const apresImpots = imposable - impots;
  return {
    caBrut: ca, depenses, retraits, beneficeImposable: imposable, taux: tranche?.taux ?? 0, impots, apresImpots,
    salaires, apresSalaires: apresImpots - salaires, net: apresImpots - retraits,
    plafonds: tranche && { salaireMaxEmploye: tranche.salaireMaxEmploye, salaireMaxPatron: tranche.salaireMaxPatron, primeMaxEmploye: tranche.primeMaxEmploye, primeMaxPatron: tranche.primeMaxPatron },
  };
}
