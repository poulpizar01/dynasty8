// ============================================================================
// Paie à l'heure (Comptabilité → Tablettes)
// ----------------------------------------------------------------------------
// Un grade dont le « taux horaire » est réglé (> 0) dans Comptabilité →
// Paramètres — les stagiaires — est payé selon ses heures de service de la
// semaine : colonne « Heures de service » du relevé Tablettes × taux. Ce
// montant s'ajoute aux paliers de primes, il ne les remplace pas.
//
// Le grade d'une ligne du relevé est celui de la fiche RH de même
// « Prénom Nom » (RH fait foi) ; sans fiche, celui de la colonne « Rang ».
// Une durée illisible n'est jamais devinée : la ligne est signalée, à 0 $.
// ============================================================================

export const ALIAS_HEURES = ["heures de service", "heure de service", "heures", "temps de service", "durée de service", "duree de service"];
const ALIAS_NOM = ["nom", "nom de l'employé", "nom du salarié", "employé", "employe"];
const ALIAS_RANG = ["rang", "grade", "poste", "rôle", "role"];

const normaliser = (v) => String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s]+/g, " ");

function indexColonne(colonnes, alias) {
  const normalisees = colonnes.map((c) => String(c).trim().toLowerCase());
  for (const nom of alias) {
    const i = normalisees.indexOf(nom);
    if (i !== -1) return i;
  }
  return -1;
}

// « 0h52min », « 1h », « 12h05 », « 45min », « 1:05 » -> minutes ; null si illisible.
export function dureeEnMinutes(texte) {
  const t = String(texte == null ? "" : texte).trim().toLowerCase().replace(/\s+/g, "");
  if (!t || t === "-") return null;
  let m = t.match(/^(\d{1,4})h(?:(\d{1,2})(?:min|mn|m)?)?$/);
  if (m) return Number(m[2] || 0) < 60 ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
  m = t.match(/^(\d{1,5})(?:min|mn|m)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d{1,4}):(\d{2})(?::\d{2})?$/);
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  return null;
}

export function formaterDuree(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// colonnes / lignes : le relevé tel qu'affiché (ligne « Total » comprise,
// ignorée ici). tauxParGrade : Map grade -> taux horaire ($ par heure).
// employes : fiches RH ({ prenom, nom, grade }).
// Renvoie { colonneHeures, lignes: [...], total } ; seules les lignes d'un
// grade payé à l'heure y figurent.
export function calculerPaieHoraire({ colonnes, lignes, tauxParGrade, employes = [] }) {
  const iNom = indexColonne(colonnes, ALIAS_NOM) === -1 ? 0 : indexColonne(colonnes, ALIAS_NOM);
  const iHeures = indexColonne(colonnes, ALIAS_HEURES);
  const iRang = indexColonne(colonnes, ALIAS_RANG);
  const gradesPayes = new Map([...tauxParGrade].filter(([, taux]) => Number(taux) > 0).map(([g, taux]) => [normaliser(g), { grade: g, taux: Math.round(Number(taux)) }]));
  const ficheParNom = new Map(employes.map((e) => [normaliser(`${e.prenom || ""} ${e.nom || ""}`), e]));

  const resultat = { colonneHeures: iHeures === -1 ? null : colonnes[iHeures], lignes: [], total: 0 };
  if (!gradesPayes.size) return resultat;

  lignes.forEach((ligne, index) => {
    const nom = String(ligne[iNom] == null ? "" : ligne[iNom]).trim();
    if (!nom || ["total", "totaux"].includes(normaliser(nom))) return;
    const fiche = ficheParNom.get(normaliser(nom));
    const grade = fiche ? fiche.grade : (iRang !== -1 ? ligne[iRang] : "");
    const paye = gradesPayes.get(normaliser(grade));
    if (!paye) return;
    const heures = iHeures === -1 ? "" : String(ligne[iHeures] == null ? "" : ligne[iHeures]).trim();
    const minutes = dureeEnMinutes(heures);
    const montant = minutes == null ? 0 : Math.round((minutes * paye.taux) / 60);
    resultat.lignes.push({
      index, nom, grade: paye.grade, gradeSource: fiche ? "rh" : "releve",
      heures, minutes, lisible: minutes != null, taux: paye.taux, montant,
    });
    resultat.total += montant;
  });
  return resultat;
}
