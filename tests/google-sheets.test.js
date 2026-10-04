// Lecture du Google Sheets de recap (src/google-sheets.js) : analyse CSV et
// extraction des lignes utiles. C'est la source des ventes et locations
// affichées dans « Mon profil » et utilisées pour les primes : un champ mal
// découpé décale une colonne entière, sans que rien ne le signale à l'écran.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyserCSV, analyserLignesSheet, lireConfigSheet, synchroniserSheetSansErreur } from "../src/google-sheets.js";
import { synchroniserSheet } from "../src/google-sheets.js";
import { montantPalier } from "../src/stats-calc.js";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { RACINE, cookieSession, SECRET_TEST, creerBaseDeTest } from "./aide-medias.js";

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
    l[4] = "Agent";
    return analyserLignesSheet([l])[0].nomNormalise;
  };
  assert.equal(avecNom("Jean Dupont"), avecNom("JEAN DUPONT"));
  assert.equal(avecNom("Héloïse Ménard"), avecNom("HELOISE MENARD"));
});

test("titres de section et ligne d'en-tête ne sont pas des agents ; grade écrit comme sur le site", () => {
  const ligne = (nom, grade) => {
    const l = new Array(16).fill("");
    l[3] = nom; l[4] = grade;
    return l;
  };
  const lignes = analyserLignesSheet([
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
  const aExaminer = ["src", "public", "tests", "deploy", "server.js", "README.md", "schema.postgres.sql"];
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

// ---------------------------------------------------------------------------
// Onglet « Synchro Google Sheets » : un réglage absent n'est pas un échec.
// ---------------------------------------------------------------------------

// Base factice : un compte Direction valide, aucune donnée de synchro.
function envDirection(reglages = {}) {
  const membre = { id: 1, pseudo: "Direction test", grade: "Patron", statut: "valide", actif: 1, sessions_invalides_avant: null };
  const requete = (sql) => {
    const r = {
      first: async () => (/FROM membres WHERE id/.test(sql) ? membre : null),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    };
    return { ...r, bind: () => r };
  };
  return { env: { DB: { prepare: requete }, SESSION_SECRET: SECRET_TEST, ...reglages }, cookie: cookieSession(membre) };
}

test("sans GOOGLE_SHEET_ID : l'état annonce « non configuré » et le bouton ne tente rien", async () => {
  const { env, cookie } = envDirection();
  const etat = await (await worker.fetch(new Request("http://localhost/api/sync-sheet/etat", { headers: { Cookie: cookie } }), env)).json();
  assert.equal(etat.configure, false);

  const fetchOriginal = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error("aucun appel réseau ne devrait avoir lieu"); };
  try {
    const r = await worker.fetch(new Request("http://localhost/api/sync-sheet/synchroniser", { method: "POST", headers: { Cookie: cookie } }), env);
    assert.equal(r.status, 503, "absence de réglage, pas une panne du classeur (502)");
    assert.match((await r.json()).erreur, /GOOGLE_SHEET_ID/);
    assert.equal(appels, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("avec GOOGLE_SHEET_ID : l'état annonce « configuré »", async () => {
  const { env, cookie } = envDirection({ GOOGLE_SHEET_ID: "c".repeat(44) });
  const etat = await (await worker.fetch(new Request("http://localhost/api/sync-sheet/etat", { headers: { Cookie: cookie } }), env)).json();
  assert.equal(etat.configure, true);
});

// ---------------------------------------------------------------------------
// Bout en bout, sur une vraie base : le tableur alimente le référentiel de
// Ventes & statistiques (fiches créées, grades alignés), le récapitulatif et
// la section « Chiffres du tableur ». Ignoré sans TEST_DATABASE_URL.
// ---------------------------------------------------------------------------
const BASE_ACTIVE = !!process.env.TEST_DATABASE_URL;

function csvTableur(lignes) {
  // Colonnes absolues du Sheet : D = nom (3), E = grade (4), L = ventes (11), M = locations (12).
  const enTete = new Array(13).fill("x").join(",");
  return [enTete, ...lignes.map(([nom, grade, ventes, locations]) => {
    const l = new Array(13).fill("");
    l[3] = nom; l[4] = grade; l[11] = ventes ?? ""; l[12] = locations ?? "";
    return l.join(",");
  })].join("\n");
}

test("synchro : le tableur alimente le référentiel, le récapitulatif et « Chiffres du tableur »", { skip: BASE_ACTIVE ? false : "TEST_DATABASE_URL non définie" }, async () => {
  const base = await creerBaseDeTest("tableur");
  const pool = creerPool(base.url);
  const fetchOriginal = globalThis.fetch;
  try {
    const env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, GOOGLE_SHEET_ID: "t".repeat(30) };
    // Avant : une seule fiche, avec pseudo, et un grade différent du tableur.
    await pool.query(
      "INSERT INTO stats_agents (discord_pseudo, discord_pseudo_normalise, identite_rp, grade) VALUES ('.matlow.', '.matlow.', 'Caleb Duval', 'Agent')"
    );
    const direction = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ('Direction test', 'Patron', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
    )).rows[0];
    const cookie = cookieSession(direction);

    const csv = csvTableur([
      ["Informations", ""],
      ["Identité RP", "Grade"],
      ["Caleb Duval", "Agent Expert", 31, 23],
      ["Zaim Tekno", "Agent Novice", 54, 76],
      ["Gianni Sottero", "Agent Novice", 46, 41],
    ]);
    globalThis.fetch = async () => new Response(csv, { status: 200, headers: { "Content-Type": "text/csv" } });

    // Deux synchros lancées en même temps (passe automatique + bouton) : une seule exécution.
    const [etat] = await Promise.all([synchroniserSheet(env), synchroniserSheet(env)]);
    assert.equal(etat.nb_lignes, 3, "titres de section et en-tête écartés");
    assert.deepEqual(etat.referentiel, { crees: 2, gradesMisAJour: 1 });

    const fiches = (await pool.query("SELECT identite_rp, grade, discord_pseudo, discord_pseudo_normalise FROM stats_agents ORDER BY identite_rp")).rows;
    assert.deepEqual(fiches, [
      { identite_rp: "Caleb Duval", grade: "Agent Expert", discord_pseudo: ".matlow.", discord_pseudo_normalise: ".matlow." },
      { identite_rp: "Gianni Sottero", grade: "Agent Novice", discord_pseudo: "", discord_pseudo_normalise: null },
      { identite_rp: "Zaim Tekno", grade: "Agent Novice", discord_pseudo: "", discord_pseudo_normalise: null },
    ]);

    // Relance : rien de plus, aucun doublon.
    const relance = await synchroniserSheet(env);
    assert.deepEqual(relance.referentiel, { crees: 0, gradesMisAJour: 0 });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM stats_agents")).rows[0].n, 3);

    // Récapitulatif (et donc DOT) : chaque fiche une seule fois, même sans pseudo.
    const recap = await (await worker.fetch(new Request("http://localhost/api/stats/recap?semaine=S40-26", { headers: { Cookie: cookie } }), env)).json();
    const parRp = Object.fromEntries(recap.agents.map((a) => [a.identiteRp, a]));
    assert.equal(recap.agents.length, 3);
    assert.equal(parRp["Caleb Duval"].grade, "Agent Expert");
    assert.equal(parRp["Zaim Tekno"].identite, "", "aucun pseudo inventé");
    assert.equal(parRp["Zaim Tekno"].gradeConnu, true);

    // « Chiffres du tableur » : lignes, fiches reliées, primes = barèmes du site.
    const tableur = await (await worker.fetch(new Request("http://localhost/api/stats/tableur", { headers: { Cookie: cookie } }), env)).json();
    const baremes = (await pool.query("SELECT type, seuil, montant FROM stats_baremes_primes")).rows;
    const attendu = (type, n) => montantPalier(baremes.filter((b) => b.type === type), n);
    assert.deepEqual(tableur.lignes.map((l) => l.nom), ["Caleb Duval", "Zaim Tekno", "Gianni Sottero"]);
    const zaim = tableur.lignes.find((l) => l.nom === "Zaim Tekno");
    assert.equal(zaim.primeVente, attendu("vente", 54));
    assert.equal(zaim.primeLocations, attendu("location", 76));
    assert.equal(zaim.primeTotale, zaim.primeVente + zaim.primeLocations);
    assert.deepEqual(zaim.fiche && zaim.fiche.discordPseudo, "");
    assert.equal(tableur.lignes.find((l) => l.nom === "Caleb Duval").fiche.discordPseudo, ".matlow.");
  } finally {
    globalThis.fetch = fetchOriginal;
    await pool.end();
    await base.supprimer();
  }
});
