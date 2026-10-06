// Réglages du site (src/reglages.js) : les liens se règlent dans l'onglet
// Paramètres, s'appliquent aussitôt, et remplacent les variables du .env.
// Sur une vraie base (ignoré sans TEST_DATABASE_URL), sauf l'analyse du lien
// Google Sheets.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { lireLienSheet, reprendreReglagesDuEnv } from "../src/reglages.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST, RACINE } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
const ID_SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg";

let base;
let pool;
let env;
const cookies = {};

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("reglages");
  pool = creerPool(base.url);
  // Un .env qui contient encore l'ancienne variable : elle ne doit plus servir.
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, GOOGLE_SHEET_ID: ID_SHEET, WEBMAP_ORIGIN: "https://env.exemple.fr" };
  for (const grade of ["Patron", "Manager"]) {
    const m = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`,
      [`Compte ${grade}`, grade]
    )).rows[0];
    cookies[grade] = cookieSession(m);
  }
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

async function appel(grade, chemin, { method = "GET", corps } = {}) {
  const r = await worker.fetch(new Request("http://localhost" + chemin, {
    method,
    headers: { ...(grade ? { Cookie: cookies[grade] } : {}), "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env);
  return { status: r.status, corps: await r.json().catch(() => null) };
}
const regler = (corps) => appel("Patron", "/api/reglages", { method: "PUT", corps });
const reglage = (r, cle) => r.corps.reglages.find((d) => d.cle === cle);

test("lien Google Sheets : identifiant et onglet extraits du lien de partage", () => {
  assert.deepEqual(lireLienSheet(`https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit#gid=1234`), { id: ID_SHEET, gid: "1234" });
  assert.deepEqual(lireLienSheet(`https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit?gid=77`), { id: ID_SHEET, gid: "77" });
  assert.deepEqual(lireLienSheet(`https://docs.google.com/spreadsheets/d/${ID_SHEET}`), { id: ID_SHEET, gid: "0" });
  assert.deepEqual(lireLienSheet(ID_SHEET), { id: ID_SHEET, gid: "0" });
  assert.equal(lireLienSheet("https://exemple.fr/spreadsheets/d/" + ID_SHEET), null, "seulement docs.google.com");
  assert.equal(lireLienSheet("n'importe quoi"), null);
});

test("aucune adresse externe écrite dans les pages : elles viennent des réglages", () => {
  const interdits = /discord\.com\/invite|discord\.gg\/|boutique\.flashbackfa|intra\.dynasty8/;
  for (const f of fs.readdirSync(path.join(RACINE, "public")).filter((n) => /\.(html|js)$/.test(n))) {
    assert.ok(!interdits.test(fs.readFileSync(path.join(RACINE, "public", f), "utf8")), `lien écrit en dur dans public/${f}`);
  }
});

it("liens publics : valeurs de départ servies à tous, modifiables aussitôt", async () => {
  const depart = await appel(null, "/api/liens");
  assert.equal(depart.status, 200);
  assert.match(depart.corps.discord_agence, /^https:\/\/discord\.com\//, "repris des pages au premier déploiement");
  assert.ok(!("webmap_origine" in depart.corps) && !("registre_url" in depart.corps), "rien de privé ici");

  assert.equal((await regler({ discord_agence: "https://discord.gg/nouveau" })).status, 200);
  assert.equal((await appel(null, "/api/liens")).corps.discord_agence, "https://discord.gg/nouveau");
  // Vidé : le lien disparaît (la page masque alors le bouton), sans revenir à la valeur de départ.
  await regler({ discord_agence: "" });
  assert.equal((await appel(null, "/api/liens")).corps.discord_agence, "");
  await pool.query(fs.readFileSync(path.join(RACINE, "schema.postgres.sql"), "utf8"));
  assert.equal((await appel(null, "/api/liens")).corps.discord_agence, "", "une migration ne réécrit pas un réglage vidé");
});

it("réglages : réservés à Patron, Co Patron et Développeur web, et validés", async () => {
  assert.equal((await appel(null, "/api/reglages")).status, 401);
  assert.equal((await appel("Manager", "/api/reglages")).status, 403, "la Direction seule ne suffit pas");
  assert.equal((await appel("Manager", "/api/reglages", { method: "PUT", corps: { boutique_vip: "https://x.exemple.fr" } })).status, 403);
  assert.equal((await appel("Patron", "/api/reglages")).status, 200);

  assert.equal((await regler({ boutique_vip: "http://pas-https.exemple.fr" })).status, 400);
  assert.equal((await regler({ boutique_vip: "javascript:alert(1)" })).status, 400);
  assert.equal((await regler({ sheet: "https://exemple.fr/pas-un-sheet" })).status, 400);
  // La WebMap fait faire des requêtes au serveur : jamais lui-même ni un réseau privé.
  for (const interne of ["https://localhost", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.10", "https://169.254.169.254", "https://postgres", "https://[::1]"]) {
    assert.equal((await regler({ webmap_origine: interne })).status, 400, interne);
  }
  const ok = await regler({ webmap_origine: "https://carte.exemple.fr/chemin/ignore?x=1" });
  assert.equal(reglage(ok, "webmap_origine").valeur, "https://carte.exemple.fr", "seule l'origine est gardée");
});

it("le .env n'est plus une source : seul le réglage du site compte", async () => {
  // Le .env de ce test contient encore GOOGLE_SHEET_ID et WEBMAP_ORIGIN : ils ne servent à rien.
  assert.equal((await appel("Patron", "/api/sync-sheet/etat")).corps.configure, false);
  assert.equal(reglage(await appel("Patron", "/api/reglages"), "sheet").regle, false);
  assert.ok(!("lien_coherences" in (await appel("Patron", "/api/moi")).corps), "plus de lien de cohérences : elles sont dans le site");
});

it("reprise unique des anciennes variables du .env, au démarrage", async () => {
  await pool.query("DELETE FROM reglages_site WHERE cle IN ('webmap_origine', 'sheet_id', 'sheet_gid')");
  const ancienEnv = { WEBMAP_ORIGIN: "https://carte.exemple.fr/", GOOGLE_SHEET_ID: ID_SHEET, GOOGLE_SHEET_GID: "7",
    COHERENCES_SHEET_URL: "https://docs.exemple.fr/coherences" };
  assert.deepEqual((await reprendreReglagesDuEnv(env, ancienEnv)).sort(), ["GOOGLE_SHEET_ID", "WEBMAP_ORIGIN"], "COHERENCES_SHEET_URL n'existe plus");
  const apres = await appel("Patron", "/api/reglages");
  assert.equal(reglage(apres, "webmap_origine").valeur, "https://carte.exemple.fr");
  assert.equal(reglage(apres, "coherences_url"), undefined, "les cohérences ne sont plus un réglage");
  assert.equal(reglage(apres, "sheet").valeur, `https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit#gid=7`);

  // Redémarrages suivants : rien n'est repris, même si le .env change ou si le réglage a été vidé.
  await regler({ webmap_origine: "" });
  assert.deepEqual(await reprendreReglagesDuEnv(env, { ...ancienEnv, GOOGLE_SHEET_GID: "99" }), []);
  const ensuite = await appel("Patron", "/api/reglages");
  assert.equal(reglage(ensuite, "webmap_origine").valeur, "", "un réglage vidé n'est pas réécrit par le .env");
  assert.equal(reglage(ensuite, "sheet").valeur, `https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit#gid=7`);

  // Une ancienne valeur invalide (adresse interne) n'est pas reprise.
  await pool.query("DELETE FROM reglages_site WHERE cle = 'webmap_origine'");
  assert.deepEqual(await reprendreReglagesDuEnv(env, { WEBMAP_ORIGIN: "http://127.0.0.1:8080" }), []);
  await regler({ sheet: "" });
});

it("Google Sheets : la synchronisation devient configurée dès que le lien est réglé", async () => {
  const configure = async () => (await appel("Patron", "/api/sync-sheet/etat")).corps.configure;
  assert.equal(await configure(), false);
  const regle = await regler({ sheet: `https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit#gid=42` });
  assert.equal(regle.status, 200);
  assert.equal(reglage(regle, "sheet").valeur, `https://docs.google.com/spreadsheets/d/${ID_SHEET}/edit#gid=42`);
  assert.equal(await configure(), true);
  const lignes = (await pool.query("SELECT cle, valeur FROM reglages_site WHERE cle IN ('sheet_id', 'sheet_gid') ORDER BY cle")).rows;
  assert.deepEqual(lignes.map((l) => l.valeur), ["42", ID_SHEET]);
  await regler({ sheet: "" });
  assert.equal(await configure(), false);
});

it("registre : lien de l'espace agents lu dans les réglages", async () => {
  assert.match((await appel("Patron", "/api/moi")).corps.lien_registre, /^https:\/\//);
  await regler({ registre_url: "" });
  assert.equal((await appel("Patron", "/api/moi")).corps.lien_registre, "");
  assert.equal((await appel("Patron", "/api/moi")).corps.peut_regler_liens, true);
  assert.equal((await appel("Manager", "/api/moi")).corps.peut_regler_liens, false);
});
