// Lecture du Google Sheets de recap (src/google-sheets.js) : analyse CSV et
// extraction des lignes utiles. C'est la source des ventes et locations
// affichées dans « Mon profil » et utilisées pour les primes : un champ mal
// découpé décale une colonne entière, sans que rien ne le signale à l'écran.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyserCSV, analyserLignesSheet, lireConfigSheet, synchroniserSheetSansErreur } from "../src/google-sheets.js";
import { RACINE } from "./aide-medias.js";

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

// ---------------------------------------------------------------------------
// Identifiant du classeur : hors du dépôt (public), comme l'adresse de la
// WebMap. Ce classeur est partagé « toute personne disposant du lien », donc
// son identifiant seul suffit à lire les chiffres de l'agence.
// ---------------------------------------------------------------------------

test("lireConfigSheet : rien de deviné quand le réglage manque", () => {
  assert.equal(lireConfigSheet({}), null, "aucune variable");
  assert.equal(lireConfigSheet({ GOOGLE_SHEET_ID: "" }), null, "valeur vide");
  assert.equal(lireConfigSheet({ GOOGLE_SHEET_ID: "   " }), null, "espaces seuls");
  assert.equal(lireConfigSheet({ GOOGLE_SHEET_ID: "trop-court" }), null, "identifiant invraisemblable");
  assert.equal(lireConfigSheet({ GOOGLE_SHEET_ID: "a".repeat(30), GOOGLE_SHEET_GID: "pas-un-nombre" }), null, "gid illisible");
});

test("lireConfigSheet : réglage complet, et gid par défaut", () => {
  const id = "b".repeat(44);
  assert.deepEqual(lireConfigSheet({ GOOGLE_SHEET_ID: id, GOOGLE_SHEET_GID: "1211846791" }), { id, gid: "1211846791" });
  assert.deepEqual(lireConfigSheet({ GOOGLE_SHEET_ID: " " + id + " " }), { id, gid: "0" }, "sans gid : premier onglet");
});

test("sans réglage, la synchro ne sort jamais sur le réseau et le dit", async () => {
  const fetchOriginal = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error("aucun appel réseau ne devrait avoir lieu"); };
  const ecrits = [];
  const env = {
    DB: { prepare: () => ({ bind: (...v) => ({ run: async () => { ecrits.push(v); return {}; } }) }) },
  };
  try {
    const etat = await synchroniserSheetSansErreur(env);
    assert.equal(appels, 0, "aucune requête vers Google");
    assert.equal(etat.statut, "desactive", "un réglage absent n'est pas une panne");
    assert.match(etat.erreur, /GOOGLE_SHEET_ID/, "le message dit quoi renseigner");
    assert.equal(ecrits.length, 1, "l'état est tout de même enregistré pour l'onglet");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("aucun identifiant de classeur codé en dur dans le dépôt", () => {
  // Une seule ligne réintroduite ici rendrait les chiffres de l'agence
  // lisibles par n'importe quel visiteur du dépôt. Ce test la rattrape.
  const suspect = new RegExp("docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]{15,}");
  const guillemets = String.fromCharCode(34, 39); // " et ' sans les ecrire ici
  const affectation = new RegExp("(SPREADSHEET|SHEET)[A-Z_]*ID[^=]{0,10}=[ ]*[" + guillemets + "][A-Za-z0-9_-]{15,}");
  const extensions = new RegExp("[.](js|html|md|css|sql|yaml|yml|example|sh|bat)$");
  const aExaminer = ["src", "public", "tests", "scripts", "deploy", "server.js", "README.md", "schema.postgres.sql"];
  const fautifs = [];
  const parcourir = (relatif) => {
    const absolu = path.join(RACINE, relatif);
    if (fs.statSync(absolu).isDirectory()) {
      for (const entree of fs.readdirSync(absolu)) {
        if (entree === "vendor" || entree === "img" || entree === "backups" || entree === "node_modules") continue;
        parcourir(path.join(relatif, entree));
      }
      return;
    }
    if (!extensions.test(relatif)) return;
    const contenu = fs.readFileSync(absolu, "utf8");
    if (suspect.test(contenu) || affectation.test(contenu)) fautifs.push(relatif);
  };
  aExaminer.forEach(parcourir);
  assert.deepEqual(fautifs, [], "identifiant de classeur trouvé dans : " + fautifs.join(", "));
});
