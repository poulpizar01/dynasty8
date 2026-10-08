// ============================================================================
// Dynasty 8 — grades : la SEULE définition du site
// ----------------------------------------------------------------------------
// Tout le code (comptes, RH, comptabilité, page équipe, espace agents) lit les
// grades ici. Chaque grade a :
//   nom      le libellé enregistré en base (ne jamais le renommer sans migrer
//            les colonnes qui le stockent) ;
//   niveau   les droits d'accès dans l'espace agents :
//              "direction"  -> accès total (annonces + comptes & accès…)
//              "commercial" -> gestion des annonces
//              "membre"     -> « Mon profil » seulement ;
//   couleur  la pastille affichée dans l'espace agents ;
//   rang     la place dans la hiérarchie (1 = le plus haut). Deux grades
//            peuvent partager un rang : Patron et Développeur web sont égaux.
//
// Le rang est RÉGLABLE dans l'onglet Paramètres (clé « rangs_grades » de
// reglages_site) ; la valeur ci-dessous sert par défaut. Le niveau et le
// trio administrateur ne le sont pas : ce sont des droits, gardés dans le code.
// ============================================================================

export const CATALOGUE_GRADES = [
  { nom: "Patron", niveau: "direction", couleur: "#e3a1a1", rang: 1 },
  { nom: "Développeur web", niveau: "direction", couleur: "#7fd4c9", rang: 1 },
  { nom: "Co Patron", niveau: "direction", couleur: "#e3a1a1", rang: 2 },
  { nom: "Manager", niveau: "direction", couleur: "#e3a1a1", rang: 3 },
  { nom: "DRH", niveau: "direction", couleur: "#e3a1a1", rang: 4 },
  { nom: "Secrétaire de Direction", niveau: "direction", couleur: "#e3a1a1", rang: 5 },
  { nom: "Référent Immobilier", niveau: "commercial", couleur: "#c1a8e8", rang: 6 },
  { nom: "Agent Expert", niveau: "commercial", couleur: "#a3d9a5", rang: 7 },
  { nom: "Agent", niveau: "commercial", couleur: "#9dc6ea", rang: 8 },
  { nom: "Agent Novice", niveau: "commercial", couleur: "#bfe0f5", rang: 9 },
  { nom: "Stagiaire", niveau: "membre", couleur: "#f0b8a0", rang: 10 },
];

export const NOMS_GRADES = CATALOGUE_GRADES.map((g) => g.nom);
export const NIVEAU_PAR_GRADE = Object.fromEntries(CATALOGUE_GRADES.map((g) => [g.nom, g.niveau]));
export const GRADES_DIRECTION = CATALOGUE_GRADES.filter((g) => g.niveau === "direction").map((g) => g.nom);

// Les trois grades administrateurs : tous les droits RH, les Paramètres, et
// seuls à pouvoir nommer quelqu'un à l'un de ces trois grades.
export const GRADES_ADMINISTRATEURS = ["Patron", "Co Patron", "Développeur web"];

// Grade donné à une demande validée d'un clic : le plus prudent.
export const GRADE_PAR_DEFAUT = "Stagiaire";

export const CLE_REGLAGE_RANGS = "rangs_grades";
const RANG_MAX = 99;

// Rangs en vigueur : ceux réglés dans Paramètres (JSON { grade: rang }), à
// défaut ceux du catalogue. Une valeur illisible est ignorée, jamais devinée.
export function rangsGrades(reglagesSite) {
  const rangs = Object.fromEntries(CATALOGUE_GRADES.map((g) => [g.nom, g.rang]));
  let regles = {};
  try { regles = JSON.parse((reglagesSite && reglagesSite[CLE_REGLAGE_RANGS]) || "{}") || {}; } catch { regles = {}; }
  for (const [nom, rang] of Object.entries(regles)) {
    if (nom in rangs && Number.isInteger(rang) && rang >= 1 && rang <= RANG_MAX) rangs[nom] = rang;
  }
  return rangs;
}

// Rang d'un grade (inconnu ou vide = en dessous de tous).
export function rangDe(grade, rangs) {
  return rangs && grade in rangs ? rangs[grade] : RANG_MAX + 1;
}

// Tri hiérarchique : rang, puis ordre du catalogue à rang égal.
export function comparerGrades(a, b, rangs) {
  return rangDe(a, rangs) - rangDe(b, rangs) || ordreCatalogue(a) - ordreCatalogue(b);
}
function ordreCatalogue(nom) {
  const i = NOMS_GRADES.indexOf(nom);
  return i === -1 ? NOMS_GRADES.length : i;
}

// Catalogue trié selon les rangs en vigueur, tel qu'envoyé au navigateur.
export function gradesOrdonnes(rangs) {
  return [...CATALOGUE_GRADES]
    .map((g) => ({ ...g, rang: rangDe(g.nom, rangs) }))
    .sort((a, b) => comparerGrades(a.nom, b.nom, rangs));
}

// ---- règles contre l'élévation de droits (Comptes & accès) --------------------

// On ne gère (modifie, suspend, supprime) qu'un compte de grade STRICTEMENT
// inférieur au sien.
export function peutGererCompte(gradeActeur, gradeCible, rangs) {
  return rangDe(gradeCible, rangs) > rangDe(gradeActeur, rangs);
}

// Grade qu'on peut attribuer : jamais au-dessus du sien ; et seuls les
// administrateurs nomment à un grade administrateur.
export function peutAttribuerGrade(gradeActeur, nouveauGrade, rangs) {
  if (!NOMS_GRADES.includes(nouveauGrade)) return false;
  if (GRADES_ADMINISTRATEURS.includes(nouveauGrade)) return GRADES_ADMINISTRATEURS.includes(gradeActeur);
  return rangDe(nouveauGrade, rangs) >= rangDe(gradeActeur, rangs);
}

// Réglage des rangs (Paramètres) : un entier de 1 à 99 par grade connu, et
// les administrateurs toujours strictement au-dessus de tous les autres —
// les droits en dépendent. Renvoie { rangs } ou { erreur }.
export function validerRangs(saisie) {
  if (!saisie || typeof saisie !== "object" || Array.isArray(saisie)) return { erreur: "Rangs illisibles." };
  const rangs = {};
  for (const nom of NOMS_GRADES) {
    const v = Number(saisie[nom]);
    if (!Number.isInteger(v) || v < 1 || v > RANG_MAX) return { erreur: `Rang invalide pour « ${nom} » (entier de 1 à ${RANG_MAX}).` };
    rangs[nom] = v;
  }
  const pireAdmin = Math.max(...GRADES_ADMINISTRATEURS.map((n) => rangs[n]));
  const meilleurAutre = Math.min(...NOMS_GRADES.filter((n) => !GRADES_ADMINISTRATEURS.includes(n)).map((n) => rangs[n]));
  if (pireAdmin >= meilleurAutre) {
    return { erreur: `${GRADES_ADMINISTRATEURS.join(", ")} doivent rester au-dessus de tous les autres grades.` };
  }
  return { rangs };
}
