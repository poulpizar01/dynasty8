// Lecture du Google Sheets de recap (src/google-sheets.js) : analyse CSV et
// extraction des lignes utiles. C'est la source des ventes et locations
// affichées dans « Mon profil » et utilisées pour les primes : un champ mal
// découpé décale une colonne entière, sans que rien ne le signale à l'écran.
import test from "node:test";
import assert from "node:assert/strict";
import { analyserCSV, analyserLignesSheet } from "../src/google-sheets.js";

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
  const ligne = (nom, grade, ventes, locations) => {
    const l = new Array(16).fill("");
    l[3] = nom; l[4] = grade; l[11] = ventes; l[12] = locations;
    return l;
  };
  const lignes = analyserLignesSheet([
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
  const avecNom = (nom) => {
    const l = new Array(16).fill("");
    l[3] = nom;
    return analyserLignesSheet([l])[0].nomNormalise;
  };
  assert.equal(avecNom("Jean Dupont"), avecNom("JEAN DUPONT"));
  assert.equal(avecNom("Héloïse Ménard"), avecNom("HELOISE MENARD"));
});
