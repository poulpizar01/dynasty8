// Les cookies de session sont en « SameSite=None » (nécessaire dans l'iframe de
// l'ordinateur en jeu) : le navigateur les envoie donc aussi depuis un site
// tiers. Toute écriture doit être refusée si elle ne vient pas de notre hôte.
// Ces tests rejouent l'attaque telle qu'elle réussissait avant le correctif :
// corps « text/plain » contenant du JSON, qui ne déclenche aucune vérification
// CORS préalable du navigateur.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);

let base;
let pool;
let env;
let direction;

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("csrf");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST };
  direction = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
     VALUES ('patron', 'Patron', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
  )).rows[0];
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  await pool.query("TRUNCATE biens RESTART IDENTITY CASCADE");
});

const SITE = "https://dynasty8.fbfa.fr";
const ANNONCE = { titre: "Villa", categorie: "habitation", dispo_vente: true, prix: 1000, images: [] };

async function poster(chemin, { origine, type = "text/plain", corps = ANNONCE, envSup } = {}) {
  const headers = { Cookie: cookieSession(direction), "Content-Type": type };
  if (origine !== undefined) headers.Origin = origine;
  const r = await worker.fetch(
    new Request(SITE + chemin, { method: "POST", headers, body: JSON.stringify(corps) }),
    { ...env, ...envSup }
  );
  return { status: r.status, json: await r.json().catch(() => null) };
}

const nbBiens = async () => (await pool.query("SELECT COUNT(*)::int AS n FROM biens")).rows[0].n;

it("écriture depuis un site tiers : refusée, rien en base", async () => {
  const r = await poster("/api/biens", { origine: "https://pirate.example" });
  assert.equal(r.status, 403);
  assert.match(r.json.erreur, /Origine/);
  assert.equal(await nbBiens(), 0);
});

it("écriture depuis notre propre site : acceptée", async () => {
  const r = await poster("/api/biens", { origine: SITE, type: "application/json" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(await nbBiens(), 1);
});

it("schéma différent mais même hôte (proxy mal réglé) : accepté", async () => {
  // Derrière un proxy qui ne transmet pas X-Forwarded-Proto, l'URL
  // reconstruite peut être en http alors que le navigateur est en https :
  // c'est l'hôte qui distingue un site tiers, pas le schéma.
  const r = await poster("/api/biens", { origine: "http://dynasty8.fbfa.fr", type: "application/json" });
  assert.equal(r.status, 200);
});

it("origine « null » (iframe bac à sable, page data:) : refusée", async () => {
  const r = await poster("/api/biens", { origine: "null" });
  assert.equal(r.status, 403);
  assert.equal(await nbBiens(), 0);
});

it("hôte supplémentaire autorisé par ORIGINES_AUTORISEES", async () => {
  const r = await poster("/api/biens", {
    origine: "https://intra.dynasty8.fbfa.fr",
    type: "application/json",
    envSup: { ORIGINES_AUTORISEES: "intra.dynasty8.fbfa.fr, autre.exemple" },
  });
  assert.equal(r.status, 200);
});

it("sans en-tête Origin (bot, curl) : accepté — ces appels ont leur propre secret", async () => {
  const r = await poster("/api/biens", { origine: undefined, type: "application/json" });
  assert.equal(r.status, 200);
});

it("la lecture publique reste ouverte à tous", async () => {
  const r = await worker.fetch(new Request(SITE + "/api/biens", { headers: { Origin: "https://pirate.example" } }), env);
  assert.equal(r.status, 200);
});

it("toutes les autres écritures sont couvertes, pas seulement les annonces", async () => {
  for (const chemin of ["/api/chat/messages", "/api/agenda", "/api/comptabilite/tablettes", "/api/membres", "/api/moi"]) {
    const r = await poster(chemin, { origine: "https://pirate.example" });
    assert.equal(r.status, 403, chemin);
  }
});
