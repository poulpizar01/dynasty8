// Paie à l'heure des stagiaires (src/paie-horaire.js) : heures de service du
// relevé Tablettes × taux horaire du grade, en plus des paliers, reprise dans
// le salaire de la DOT. La partie « vraie base » est ignorée sans TEST_DATABASE_URL.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { dureeEnMinutes, calculerPaieHoraire } from "../src/paie-horaire.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST } from "./aide-medias.js";

test("durées du relevé : formats lus, rien n'est deviné", () => {
  assert.equal(dureeEnMinutes("0h52min"), 52);
  assert.equal(dureeEnMinutes("12h05min"), 725);
  assert.equal(dureeEnMinutes("3h"), 180);
  assert.equal(dureeEnMinutes("1h 5min"), 65);
  assert.equal(dureeEnMinutes("45min"), 45);
  assert.equal(dureeEnMinutes("2:30"), 150);
  for (const illisible of ["", "-", "52", "abc", "1h75min", "2:75", null]) assert.equal(dureeEnMinutes(illisible), null, String(illisible));
});

const COLONNES = ["Nom", "Rang", "Facture", "Total entreprise", "Heures de service"];
const LIGNES = [
  ["Lina Morel", "Stagiaire", "0", "0", "2h30min"],
  ["Noam Finley", "Agent", "5 000", "5 000", "10h00min"],
  ["Sans Fiche", "Stagiaire", "0", "0", "0h52min"],
  ["Heure Illisible", "Stagiaire", "0", "0", "beaucoup"],
  ["TOTAL", "-", "5 000", "5 000"],
];

test("calcul : seuls les grades payés à l'heure, grade de la fiche RH d'abord", () => {
  const p = calculerPaieHoraire({
    colonnes: COLONNES,
    lignes: LIGNES,
    tauxParGrade: new Map([["Stagiaire", 6000], ["Agent", 0]]),
    // RH fait foi : « Noam Finley » est Stagiaire dans sa fiche, même si le relevé dit Agent.
    employes: [{ prenom: "Lina", nom: "Morel", grade: "Stagiaire" }, { prenom: "Noam", nom: "Finley", grade: "Stagiaire" }],
  });
  assert.equal(p.colonneHeures, "Heures de service");
  assert.deepEqual(p.lignes.map((l) => [l.nom, l.minutes, l.montant, l.gradeSource]), [
    ["Lina Morel", 150, 15000, "rh"],
    ["Noam Finley", 600, 60000, "rh"],
    ["Sans Fiche", 52, 5200, "releve"],
    ["Heure Illisible", null, 0, "releve"],
  ]);
  assert.equal(p.lignes[3].lisible, false);
  assert.equal(p.total, 80200);
  assert.equal(calculerPaieHoraire({ colonnes: COLONNES, lignes: LIGNES, tauxParGrade: new Map([["Stagiaire", 0]]) }).lignes.length, 0, "aucun taux réglé : rien");
});

// ---- sur une vraie base --------------------------------------------------------

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
let base;
let pool;
let env;
let cookie;

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("paie_horaire");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST };
  const m = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
     VALUES ('patron', 'Patron', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
  )).rows[0];
  cookie = cookieSession(m);
  await pool.query(
    `INSERT INTO employes (id_employe, prenom, nom, grade, statut, date_arrivee)
     VALUES ('D8-901', 'Lina', 'Morel', 'Stagiaire', 'actif', '2026-09-01')`
  );
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

async function appel(chemin, { method = "GET", corps } = {}) {
  const r = await worker.fetch(new Request("http://localhost" + chemin, {
    method, headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env);
  return { status: r.status, corps: await r.json().catch(() => null) };
}

it("taux réglé dans Comptabilité → Paramètres, détail dans Tablettes, inclus dans le salaire DOT", async () => {
  const regle = await appel(`/api/stats/remuneration/grades/${encodeURIComponent("Stagiaire")}`, { method: "PATCH", corps: { tauxHoraire: 6000 } });
  assert.equal(regle.status, 200, JSON.stringify(regle.corps));
  assert.equal((await appel(`/api/stats/remuneration/grades/Stagiaire`, { method: "PATCH", corps: { tauxHoraire: -5 } })).status, 400);
  const remu = await appel("/api/stats/remuneration");
  assert.equal(remu.corps.grades.find((g) => g.grade === "Stagiaire").tauxHoraire, 6000);

  assert.equal((await appel("/api/comptabilite/tablettes", { method: "POST", corps: { colonnes: COLONNES, lignes: LIGNES } })).status, 200);
  const releve = await appel("/api/comptabilite/tablettes");
  const lina = releve.corps.paie_horaire.lignes.find((l) => l.nom === "Lina Morel");
  assert.deepEqual([lina.minutes, lina.taux, lina.montant], [150, 6000, 15000]);

  const dot = await appel("/api/comptabilite/dot/salaries?semaine=S41-26");
  assert.equal(dot.status, 200, JSON.stringify(dot.corps));
  const ligneDot = dot.corps.agents.find((a) => (a.identiteRp || a.identite) === "Lina Morel");
  assert.ok(ligneDot, JSON.stringify(dot.corps.agents));
  assert.equal(ligneDot.paieHoraire, 15000);
  assert.equal(ligneDot.salaireTotal, (ligneDot.salaireFixe || 0) + (ligneDot.primeTotale || 0) + 15000);
  const sansFiche = dot.corps.agents.find((a) => a.identite === "Sans Fiche");
  assert.equal(sansFiche.paieHoraire, 5200);
});
