// Lecture du Google Sheets de recap (src/google-sheets.js) : analyse CSV et
// extraction des lignes utiles. C'est la source des ventes et locations
// affichées dans « Mon profil » et utilisées pour les primes : un champ mal
// découpé décale une colonne entière, sans que rien ne le signale à l'écran.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyserCSV, analyserLignesSheet, lireConfigSheet, synchroniserSheetSansErreur } from "../src/google-sheets.js";
import { synchroniserSheet, semaineParis, semaineArchivable, archiverSemaineSiDue } from "../src/google-sheets.js";
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
    assert.match(etat.erreur, /onglet Paramètres/, "le message dit où le régler");
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
// `reglagesSite` : lignes de reglages_site (l'onglet Paramètres), seule
// source du lien du tableur — une variable d'environnement n'y fait rien.
function envDirection(reglages = {}, reglagesSite = []) {
  const membre = { id: 1, pseudo: "Direction test", grade: "Patron", statut: "valide", actif: 1, sessions_invalides_avant: null };
  const requete = (sql) => {
    const r = {
      first: async () => (/FROM membres WHERE id/.test(sql) ? membre : null),
      all: async () => ({ results: /FROM reglages_site/.test(sql) ? reglagesSite : [] }),
      run: async () => ({}),
    };
    return { ...r, bind: () => r };
  };
  return { env: { DB: { prepare: requete }, SESSION_SECRET: SECRET_TEST, ...reglages }, cookie: cookieSession(membre) };
}

test("sans tableur réglé : l'état annonce « non configuré » et le bouton ne tente rien — même avec l'ancienne variable du .env", async () => {
  const { env, cookie } = envDirection({ GOOGLE_SHEET_ID: "c".repeat(44) });
  const etat = await (await worker.fetch(new Request("http://localhost/api/sync-sheet/etat", { headers: { Cookie: cookie } }), env)).json();
  assert.equal(etat.configure, false);

  const fetchOriginal = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error("aucun appel réseau ne devrait avoir lieu"); };
  try {
    const r = await worker.fetch(new Request("http://localhost/api/sync-sheet/synchroniser", { method: "POST", headers: { Cookie: cookie } }), env);
    assert.equal(r.status, 503, "absence de réglage, pas une panne du classeur (502)");
    assert.match((await r.json()).erreur, /onglet Paramètres/);
    assert.equal(appels, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("tableur réglé dans l'onglet Paramètres : l'état annonce « configuré »", async () => {
  const { env, cookie } = envDirection({}, [{ cle: "sheet_id", valeur: "c".repeat(44) }, { cle: "sheet_gid", valeur: "0" }]);
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

// Une seule base pour les tests d'intégration de ce fichier : l'adaptateur
// (src/db-pg.js) garde un pool unique par processus, lié à la première base.
let base = null;
let pool = null;
before(async () => {
  if (!BASE_ACTIVE) return;
  base = await creerBaseDeTest("tableur");
  pool = creerPool(base.url);
});
after(async () => {
  if (!BASE_ACTIVE) return;
  await pool.end();
  await base.supprimer();
});
const avecBase = (nom, fn) => test(nom, { skip: BASE_ACTIVE ? false : "TEST_DATABASE_URL non définie" }, fn);

avecBase("synchro : RH fait foi — le tableur est rattaché aux fiches RH, sans en créer ni changer de grade", async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    const env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, GOOGLE_SHEET_ID: "t".repeat(30) };
    // RH : Caleb Duval existe (grade RH « Agent », le tableur dit « Agent Expert »).
    const caleb = (await pool.query(
      `INSERT INTO employes (id_employe, prenom, nom, discord_pseudo, discord_pseudo_normalise, grade, statut, date_arrivee)
       VALUES ('D8-0001', 'Caleb', 'Duval', '.matlow.', '.matlow.', 'Agent', 'actif', '2026-01-10') RETURNING id`
    )).rows[0];
    const direction = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ('Direction test', 'Patron', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
    )).rows[0];
    const cookie = cookieSession(direction);
    const appel = async (chemin) => (await worker.fetch(new Request("http://localhost" + chemin, { headers: { Cookie: cookie } }), env)).json();

    const csv = csvTableur([
      ["Informations", ""],
      ["Identité RP", "Grade"],
      ["Caleb Duval", "Agent Expert", 31, 23],
      ["Zaim Tekno", "Agent Novice", 54, 76],
    ]);
    globalThis.fetch = async () => new Response(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
    const employesAvant = (await pool.query("SELECT count(*)::int AS n FROM employes")).rows[0].n;

    // Deux synchros lancées en même temps (passe automatique + bouton) : une seule exécution.
    const [etat] = await Promise.all([synchroniserSheet(env), synchroniserSheet(env)]);
    assert.equal(etat.nb_lignes, 2, "titres de section et en-tête écartés");
    assert.equal(etat.sansFicheRh, 1, "Zaim Tekno n'a pas de fiche RH");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM employes")).rows[0].n, employesAvant, "aucune fiche créée par le tableur");
    assert.equal((await pool.query("SELECT grade FROM employes WHERE id = $1", [caleb.id])).rows[0].grade, "Agent", "le grade RH n'est pas touché");
    const lignes = (await pool.query("SELECT nom_sheet, employe_id FROM sync_sheet_agents ORDER BY ligne_sheet")).rows;
    assert.deepEqual(lignes, [{ nom_sheet: "Caleb Duval", employe_id: caleb.id }, { nom_sheet: "Zaim Tekno", employe_id: null }]);

    const baremes = (await pool.query("SELECT type, seuil, montant FROM stats_baremes_primes")).rows;
    const attendu = (type, n) => montantPalier(baremes.filter((b) => b.type === type), n);

    // DOT : l'employé RH, avec son grade RH et les primes de SA ligne du tableur.
    const dot = await appel("/api/comptabilite/dot/salaries?semaine=S40-26");
    const calebDot = dot.agents.find((a) => a.employeId === caleb.id);
    assert.equal(calebDot.identiteRp, "Caleb Duval");
    assert.equal(calebDot.idEmploye, "D8-0001");
    assert.equal(calebDot.grade, "Agent");
    assert.equal(calebDot.primeTotale, attendu("vente", 31) + attendu("location", 23));
    assert.equal(dot.agents.filter((a) => a.employeId === caleb.id).length, 1);

    // « Chiffres du tableur » : identité RH quand la ligne a sa fiche.
    const tableur = await appel("/api/stats/tableur");
    const ligneCaleb = tableur.lignes.find((l) => l.nomTableur === "Caleb Duval");
    assert.equal(ligneCaleb.employe.idEmploye, "D8-0001");
    assert.equal(ligneCaleb.grade, "Agent", "grade lu dans RH");
    const zaim = tableur.lignes.find((l) => l.nomTableur === "Zaim Tekno");
    assert.equal(zaim.employe, null);
    assert.equal(zaim.primeTotale, attendu("vente", 54) + attendu("location", 76));

    // RH → « À rattacher » liste la ligne sans fiche.
    const aRattacher = await appel("/api/rh/a-rattacher");
    assert.deepEqual(aRattacher.tableur.map((l) => l.nom), ["Zaim Tekno"]);

    // Une modification RH est reprise partout, sans rien toucher d'autre.
    await pool.query("UPDATE employes SET prenom = 'Kaleb', grade = 'Agent Expert' WHERE id = $1", [caleb.id]);
    const apres = await appel("/api/comptabilite/dot/salaries?semaine=S40-26");
    const calebApres = apres.agents.find((a) => a.employeId === caleb.id);
    assert.deepEqual([calebApres.identiteRp, calebApres.grade], ["Kaleb Duval", "Agent Expert"]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ---------------------------------------------------------------------------
// Archives hebdomadaires : dimanche 23:59, heure de Paris.
// ---------------------------------------------------------------------------

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

avecBase("archive : figée à 23:59, une seule fois, primes gelées, consultable", async () => {
  const env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, GOOGLE_SHEET_ID: "t".repeat(30) };
  await pool.query("DELETE FROM tableur_archives");
  await pool.query("DELETE FROM sync_sheet_agents");
  const lire = (maj) => pool.query(
    `INSERT INTO sync_sheet_agents (nom_sheet, nom_normalise, grade_sheet, nb_ventes, nb_locations, ligne_sheet, maj)
     VALUES ('Zaim Tekno', 'zaim tekno', 'Agent Novice', 54, 76, 47, $1), ('Ava Snow', 'ava snow', 'Référent Immobilier', 3, 1, 20, $1)`,
    [maj]
  );
  // Tableur lu dimanche 4 octobre à 22:00, heure de Paris (semaine S40-26).
  await lire("2026-10-04 20:00:00");

  // 23:58 : la semaine due est S39, mais les chiffres sont de S40 -> rien.
  let r = await archiverSemaineSiDue(env, { maintenant: new Date("2026-10-04T21:58:00Z") });
  assert.deepEqual([r.archivee, r.raison], [false, "chiffres d'une autre semaine"]);
  // 23:59:30, avec le délai que respecte une synchro ordinaire -> pas encore.
  r = await archiverSemaineSiDue(env, { maintenant: new Date("2026-10-04T21:59:30Z"), grace: 60_000 });
  assert.deepEqual([r.archivee, r.raison], [false, "pas encore"]);
  // 23:59:30, tâche d'archivage -> S40 archivée.
  r = await archiverSemaineSiDue(env, { maintenant: new Date("2026-10-04T21:59:30Z") });
  assert.deepEqual([r.archivee, r.semaine], [true, "S40-26"]);
  // Une seconde fois -> rien.
  r = await archiverSemaineSiDue(env, { maintenant: new Date("2026-10-04T21:59:45Z") });
  assert.deepEqual([r.archivee, r.raison], [false, "déjà archivée"]);

  // Un barème modifié après coup ne réécrit pas l'archive.
  const primesAvant = (await pool.query("SELECT nom, prime_vente, prime_locations FROM tableur_archives_lignes ORDER BY nom")).rows;
  await pool.query("UPDATE stats_baremes_primes SET montant = montant + 1000");
  assert.deepEqual((await pool.query("SELECT nom, prime_vente, prime_locations FROM tableur_archives_lignes ORDER BY nom")).rows, primesAvant);

  // Serveur arrêté le dimanche suivant : archive faite au redémarrage (mardi),
  // avec les derniers chiffres lus dans la semaine S41, marquée « en retard ».
  await pool.query("DELETE FROM sync_sheet_agents");
  await lire("2026-10-10 12:00:00");
  r = await archiverSemaineSiDue(env, { maintenant: new Date("2026-10-13T08:00:00Z") });
  assert.deepEqual([r.archivee, r.semaine], [true, "S41-26"]);
  assert.equal((await pool.query("SELECT en_retard FROM tableur_archives WHERE semaine = 'S41-26'")).rows[0].en_retard, 1);

  // Consultation : liste des semaines, puis une archive précise.
  const direction = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
     VALUES ('Direction archives', 'Patron', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
  )).rows[0];
  const cookie = cookieSession(direction);
  const appel = async (chemin) => worker.fetch(new Request("http://localhost" + chemin, { headers: { Cookie: cookie } }), env);
  const liste = await (await appel("/api/stats/tableur")).json();
  assert.deepEqual(liste.archives.map((a) => a.semaine), ["S41-26", "S40-26"]);
  const s40 = await (await appel("/api/stats/tableur?semaine=S40-26")).json();
  assert.equal(s40.archive.semaine, "S40-26");
  assert.equal(s40.archive.enRetard, false);
  assert.deepEqual(s40.lignes.map((l) => [l.nom, l.ventes, l.locations]), [["Ava Snow", 3, 1], ["Zaim Tekno", 54, 76]]);
  assert.deepEqual(s40.lignes.map((l) => [l.nom, l.primeVente, l.primeLocations]), primesAvant.map((p) => [p.nom, p.prime_vente, p.prime_locations]));
  assert.equal((await appel("/api/stats/tableur?semaine=S99-26")).status, 404);
});
