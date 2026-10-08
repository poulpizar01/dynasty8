// Grades (src/grades.js) : une seule définition, une hiérarchie réglable
// (Patron et Développeur web au même rang), et les règles contre l'élévation
// de droits dans Comptes & accès. La partie « vraie base » est ignorée sans
// TEST_DATABASE_URL.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import {
  NOMS_GRADES, rangsGrades, gradesOrdonnes, peutGererCompte, peutAttribuerGrade, validerRangs, CLE_REGLAGE_RANGS,
} from "../src/grades.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST, RACINE } from "./aide-medias.js";

const DEFAUT = rangsGrades({});

test("hiérarchie par défaut : Patron et Développeur web au même rang, Stagiaire en bas", () => {
  assert.equal(DEFAUT["Patron"], DEFAUT["Développeur web"]);
  assert.deepEqual(gradesOrdonnes(DEFAUT).map((g) => g.nom), [
    "Patron", "Développeur web", "Co Patron", "Manager", "DRH", "Secrétaire de Direction",
    "Référent Immobilier", "Agent Expert", "Agent", "Agent Novice", "Stagiaire",
  ]);
});

test("rangs réglés : appliqués s'ils sont lisibles, ignorés sinon", () => {
  const regles = rangsGrades({ [CLE_REGLAGE_RANGS]: JSON.stringify({ Agent: 6, "Référent Immobilier": 8, Inconnu: 1, DRH: "x" }) });
  assert.equal(regles.Agent, 6);
  assert.equal(regles["Référent Immobilier"], 8);
  assert.equal(regles.DRH, DEFAUT.DRH, "valeur illisible ignorée");
  assert.ok(!("Inconnu" in regles));
  assert.deepEqual(rangsGrades({ [CLE_REGLAGE_RANGS]: "pas du json" }), DEFAUT);
});

test("élévation de droits : on ne gère que plus bas que soi, et seuls les administrateurs nomment un administrateur", () => {
  assert.equal(peutGererCompte("Manager", "Agent", DEFAUT), true);
  assert.equal(peutGererCompte("Manager", "Patron", DEFAUT), false);
  assert.equal(peutGererCompte("Manager", "Manager", DEFAUT), false, "même rang : non");
  assert.equal(peutGererCompte("Patron", "Développeur web", DEFAUT), false, "rangs égaux");
  assert.equal(peutGererCompte("Secrétaire de Direction", "", DEFAUT), true, "demande en attente (grade vide)");

  assert.equal(peutAttribuerGrade("Manager", "Patron", DEFAUT), false);
  assert.equal(peutAttribuerGrade("Manager", "Co Patron", DEFAUT), false);
  assert.equal(peutAttribuerGrade("Manager", "Manager", DEFAUT), true, "jusqu'à son propre grade");
  assert.equal(peutAttribuerGrade("DRH", "Manager", DEFAUT), false, "jamais au-dessus de soi");
  assert.equal(peutAttribuerGrade("Co Patron", "Patron", DEFAUT), true);
  assert.equal(peutAttribuerGrade("Patron", "Développeur web", DEFAUT), true);
  assert.equal(peutAttribuerGrade("Patron", "Président", DEFAUT), false);
});

test("réglage des rangs : complet, entier, et administrateurs toujours au-dessus", () => {
  const base = Object.fromEntries(NOMS_GRADES.map((n) => [n, DEFAUT[n]]));
  assert.ok(validerRangs(base).rangs);
  assert.match(validerRangs({ ...base, Stagiaire: 1 }).erreur, /au-dessus/);
  assert.match(validerRangs({ ...base, "Co Patron": 3 }).erreur, /au-dessus/, "Co Patron à égalité avec Manager");
  assert.match(validerRangs({ ...base, Agent: 0 }).erreur, /Rang invalide/);
  assert.match(validerRangs({ ...base, Agent: 2.5 }).erreur, /Rang invalide/);
  const { Agent, ...sansAgent } = base;
  assert.match(validerRangs(sansAgent).erreur, /Agent/);
});

test("plus aucune liste de grades écrite ailleurs que dans src/grades.js", () => {
  const fichiers = ["server.js", "public/layout.js", "public/admin.js", "src/index.js", "src/rh.js", "src/reglages.js"];
  for (const f of fichiers) {
    const contenu = fs.readFileSync(path.join(RACINE, f), "utf8");
    assert.doesNotMatch(contenu, /"Référent Immobilier",\s*"Agent Expert"/, `${f} recopie la liste des grades`);
    assert.doesNotMatch(contenu, /\["Patron", "Co Patron", "Développeur web"\]/, `${f} recopie le trio administrateur`);
  }
});

// ---- sur une vraie base --------------------------------------------------------

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
let base;
let pool;
let env;
const comptes = {};

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("grades");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST };
  for (const [cle, grade] of [["patron", "Patron"], ["dev", "Développeur web"], ["copatron", "Co Patron"], ["manager", "Manager"], ["drh", "DRH"], ["agent", "Agent"], ["stagiaire", "Stagiaire"]]) {
    const m = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`,
      [`Compte ${grade}`, grade]
    )).rows[0];
    comptes[cle] = { ...m, cookie: cookieSession(m) };
  }
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

async function appel(qui, chemin, { method = "GET", corps } = {}) {
  const r = await worker.fetch(new Request("http://localhost" + chemin, {
    method,
    headers: { Cookie: comptes[qui].cookie, "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env);
  return { status: r.status, corps: await r.json().catch(() => null) };
}
const gradeEnBase = async (cle) => (await pool.query("SELECT grade FROM membres WHERE id = $1", [comptes[cle].id])).rows[0].grade;

it("Comptes & accès : un Manager ne peut ni toucher un Patron ni nommer un Patron", async () => {
  assert.equal((await appel("manager", `/api/membres?id=${comptes.patron.id}`, { method: "PATCH", corps: { grade: "Stagiaire" } })).status, 403);
  assert.equal((await appel("manager", `/api/membres?id=${comptes.patron.id}`, { method: "PATCH", corps: { actif: false } })).status, 403);
  assert.equal((await appel("manager", `/api/membres?id=${comptes.patron.id}`, { method: "DELETE" })).status, 403);
  assert.equal(await gradeEnBase("patron"), "Patron");

  const promotion = await appel("manager", `/api/membres?id=${comptes.agent.id}`, { method: "PATCH", corps: { grade: "Patron" } });
  assert.equal(promotion.status, 403);
  assert.equal(await gradeEnBase("agent"), "Agent");
  assert.equal((await appel("manager", `/api/membres?id=${comptes.manager.id}`, { method: "PATCH", corps: { grade: "Patron" } })).status, 400, "pas sur soi-même");
  assert.equal(await gradeEnBase("manager"), "Manager");

  assert.equal((await appel("manager", "/api/membres", { method: "POST", corps: { discord_pseudo: "nouveau.patron", grade: "Patron" } })).status, 403);
  assert.equal((await appel("drh", `/api/membres?id=${comptes.manager.id}`, { method: "PATCH", corps: { grade: "Agent" } })).status, 403, "DRH sous Manager");
});

it("Comptes & accès : on gère normalement ce qui est en dessous de soi", async () => {
  const r = await appel("manager", `/api/membres?id=${comptes.agent.id}`, { method: "PATCH", corps: { grade: "Agent Expert" } });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.equal(await gradeEnBase("agent"), "Agent Expert");
  assert.equal((await appel("copatron", `/api/membres?id=${comptes.stagiaire.id}`, { method: "PATCH", corps: { grade: "Patron" } })).status, 200,
    "un administrateur peut nommer un administrateur");
  assert.equal(await gradeEnBase("stagiaire"), "Patron");
  assert.equal((await appel("patron", `/api/membres?id=${comptes.dev.id}`, { method: "PATCH", corps: { grade: "Agent" } })).status, 403,
    "Patron et Développeur web sont au même rang");
});

it("hiérarchie réglable dans Paramètres, appliquée aussitôt", async () => {
  assert.equal((await appel("manager", "/api/reglages/grades")).status, 403);
  const lu = await appel("patron", "/api/reglages/grades");
  assert.equal(lu.status, 200);
  const rangs = Object.fromEntries(lu.corps.grades.map((g) => [g.nom, g.rang]));

  assert.equal((await appel("patron", "/api/reglages/grades", { method: "PUT", corps: { rangs: { ...rangs, Stagiaire: 1 } } })).status, 400);
  const regle = await appel("patron", "/api/reglages/grades", { method: "PUT", corps: { rangs: { ...rangs, Agent: 6, "Référent Immobilier": 8 } } });
  assert.equal(regle.status, 200, JSON.stringify(regle.corps));
  const ordre = (await appel("agent", "/api/moi")).corps.grades.map((g) => g.nom);
  assert.ok(ordre.indexOf("Agent") < ordre.indexOf("Référent Immobilier"), "nouvel ordre envoyé à l'espace agents");
  await appel("patron", "/api/reglages/grades", { method: "PUT", corps: { rangs } });
});
