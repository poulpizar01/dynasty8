// Déconnexion réellement effective : « Se déconnecter » n'effaçait que le
// cookie côté navigateur ; un cookie copié restait valable jusqu'à 12 h.
// Nécessite TEST_DATABASE_URL (voir tests/medias-integration.test.js).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);

let base;
let pool;
let env;
let membre;
const SITE = "https://dynasty8.fbfa.fr";

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("session");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST };
  membre = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
     VALUES ('agent', 'Agent', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
  )).rows[0];
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

const appeler = (chemin, cookie, methode = "GET") =>
  worker.fetch(new Request(SITE + chemin, { method: methode, headers: cookie ? { Cookie: cookie, Origin: SITE } : { Origin: SITE } }), env);

it("après déconnexion, un cookie copié ne vaut plus rien", async () => {
  await pool.query("UPDATE membres SET sessions_invalides_avant = NULL WHERE id = $1", [membre.id]);
  const cookie = cookieSession(membre);

  assert.equal((await appeler("/api/moi", cookie)).status, 200, "session valable au départ");

  const sortie = await appeler("/api/deconnexion", cookie, "POST");
  assert.equal(sortie.status, 200);
  assert.ok(sortie.headers.getSetCookie().some((c) => /Max-Age=0/.test(c)), "le cookie est aussi effacé côté navigateur");

  // C'est tout l'intérêt : la copie du cookie, elle, n'a pas été effacée.
  assert.equal((await appeler("/api/moi", cookie)).status, 401, "la copie est désormais refusée");
});

it("une session émise APRÈS la déconnexion fonctionne normalement", async () => {
  await pool.query("UPDATE membres SET sessions_invalides_avant = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1", [membre.id]);
  await new Promise((r) => setTimeout(r, 1100)); // l'horodatage est à la seconde
  assert.equal((await appeler("/api/moi", cookieSession(membre))).status, 200);
});

it("un cookie émis avant cette mise à jour (sans horodatage) est refusé après une déconnexion", async () => {
  // Ces cookies circulent encore chez les agents connectés : impossible de
  // savoir s ils précèdent ou non la déconnexion, donc on refuse.
  await pool.query("UPDATE membres SET sessions_invalides_avant = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1", [membre.id]);
  const ancien = cookieSession(membre, { sansIat: true });
  assert.equal((await appeler("/api/moi", ancien)).status, 401);
});

it("les autres membres ne sont pas déconnectés", async () => {
  const autre = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
     VALUES ('collegue', 'Agent', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`
  )).rows[0];
  const cookieAutre = cookieSession(autre);
  await appeler("/api/deconnexion", cookieSession(membre), "POST");
  assert.equal((await appeler("/api/moi", cookieAutre)).status, 200);
});

it("sans invalidation enregistrée, une session valable reste acceptée", async () => {
  await pool.query("UPDATE membres SET sessions_invalides_avant = NULL WHERE id = $1", [membre.id]);
  assert.equal((await appeler("/api/moi", cookieSession(membre))).status, 200);
});
