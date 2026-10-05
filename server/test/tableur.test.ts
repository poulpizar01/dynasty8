// Lecture du Google Sheets de la Direction (src/entreprise/stats/tableur.ts, repris de l'ancien src/google-sheets.js) :
// analyse CSV, extraction des lignes utiles, semaines à l'heure de Paris. Un champ mal découpé décale une colonne
// entière, sans que rien ne le signale à l'écran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyserCSV, analyserLignesSheet, semaineArchivable, semaineParis } from '../src/entreprise/stats/tableur.js';

// libellés de grades créés dans la page Grades (exemple)
const GRADES = ['Patron', 'Co Patron', 'Manager', 'Référent Immobilier', 'Agent Expert', 'Agent', 'Agent Novice', 'Stagiaire'];
const lire = (lignes: string[][]) => analyserLignesSheet(lignes, GRADES);
test("CSV simple", () => {
  assert.deepEqual(analyserCSV("a,b,c\n1,2,3"), [["a", "b", "c"], ["1", "2", "3"]]);
});
test("champs entre guillemets : virgules, retours à la ligne et guillemets doublés", () => {
  assert.deepEqual(analyserCSV('"Doe, John",Agent'), [["Doe, John", "Agent"]], "virgule interne");
  assert.deepEqual(analyserCSV('"ligne 1\nligne 2",x'), [["ligne 1\nligne 2", "x"]], "retour à la ligne interne");
  assert.deepEqual(analyserCSV('"Jean ""Le Chat"" Dupont",y'), [['Jean "Le Chat" Dupont', "y"]], "guillemets doublés");
});
test("champs vides et fins de ligne", () => {
  assert.deepEqual(analyserCSV("a,,c"), [["a", "", "c"]], "champ vide au milieu");
  assert.deepEqual(analyserCSV("a,b,"), [["a", "b", ""]], "champ vide en fin de ligne");
  assert.deepEqual(analyserCSV("a,b\r\nc,d"), [["a", "b"], ["c", "d"]], "fins de ligne Windows");
  assert.deepEqual(analyserCSV(""), [], "fichier vide");
});
test("lignes du Sheet : seules les colonnes utiles sont retenues", () => {
  // Colonnes A..P : D = nom, E = grade, L = ventes, M = locations.
  const ligne = (nom: string, grade: string, ventes: string, locations: string) => {
    const l = new Array(16).fill("");
    l[3] = nom; l[4] = grade; l[11] = ventes; l[12] = locations;
    return l;
  };
  const lignes = lire([
    ligne("Jean Dupont", "Agent", "12", "3"),
    ligne("", "Agent", "99", "99"),           // sans nom : ignorée, ce n'est pas une anomalie
    ligne("  Marie Curie  ", "Manager", "", ""), // nom à espacer, compteurs vides
  ]);

  assert.equal(lignes.length, 2, "la ligne sans nom est écartée");
  assert.deepEqual(lignes[0], {
    ligneSheet: 2, nom: "Jean Dupont", nomNormalise: "jean dupont",
    grade: "Agent", nbVentes: 12, nbLocations: 3,
  });
  assert.equal(lignes[1].nom, "Marie Curie", "espaces retirés");
  assert.equal(lignes[1].ligneSheet, 4, "le numéro suit le fichier, pas la liste filtrée");
  assert.equal(lignes[1].nbVentes, 0, "une case vide vaut 0");
});
test("le nom normalisé ignore casse et accents (appariement des comptes)", () => {
  const avecNom = (nom: string) => {
    const l = new Array(16).fill("");
    l[3] = nom;
    l[4] = "Agent";
    return lire([l])[0].nomNormalise;
  };
  assert.equal(avecNom("Jean Dupont"), avecNom("JEAN DUPONT"));
  assert.equal(avecNom("Héloïse Ménard"), avecNom("HELOISE MENARD"));
});
test("titres de section et ligne d'en-tête ne sont pas des agents ; grade écrit comme sur le site", () => {
  const ligne = (nom: string, grade: string) => {
    const l = new Array(16).fill("");
    l[3] = nom; l[4] = grade;
    return l;
  };
  const lignes = lire([
    ligne("Informations", ""),           // titre de section
    ligne("Identité RP", "Grade"),       // en-tête du tableau
    ligne("Directions", ""),             // titre de section
    ligne("Caleb Duval", "agent expert"), // casse différente
    ligne("Ava Snow", "Referent Immobilier"), // accent manquant
  ]);
  assert.deepEqual(lignes.map((l) => [l.nom, l.grade]), [
    ["Caleb Duval", "Agent Expert"],
    ["Ava Snow", "Référent Immobilier"],
  ]);
});
test("semaines du site : lundi 00:00 → dimanche 23:59 heure de Paris, été comme hiver", () => {
  // Été (UTC+2) : dimanche 4 octobre 2026, 23:59 à Paris = 21:59 UTC.
  assert.equal(semaineParis(new Date("2026-10-04T21:58:59Z")).code, "S40-26");
  assert.equal(semaineParis(new Date("2026-10-04T21:59:00Z")).fin.toISOString(), "2026-10-04T21:59:00.000Z");
  assert.equal(semaineArchivable(new Date("2026-10-04T21:58:59Z")).code, "S39-26", "avant 23:59 : la semaine précédente");
  assert.equal(semaineArchivable(new Date("2026-10-04T21:59:00Z")).code, "S40-26", "à 23:59 : la semaine qui se termine");
  // Lundi 00:00 à Paris = dimanche 22:00 UTC (été) : déjà la semaine suivante.
  assert.equal(semaineParis(new Date("2026-10-04T22:00:00Z")).code, "S41-26");
  // Passage à l'heure d'hiver (dimanche 25 octobre) : 23:59 à Paris = 22:59 UTC.
  assert.equal(semaineParis(new Date("2026-10-25T12:00:00Z")).fin.toISOString(), "2026-10-25T22:59:00.000Z");
  // Fin d'année : 2026 compte 53 semaines ISO.
  assert.equal(semaineParis(new Date("2027-01-02T12:00:00Z")).code, "S53-26");
});
