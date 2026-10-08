// Connexion Discord : l'autorisation « guilds.members.read » est demandée, et
// les rôles du membre sur le serveur de l'agence (DISCORD_GUILD_ID) sont
// enregistrés à chaque connexion — ils décident de la visibilité de l'agenda.
// Discord n'est jamais appelé : fetch est remplacé le temps du test.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { creerBaseDeTest, SECRET_TEST } from "./aide-medias.js";

const ENV_DISCORD = {
  SESSION_SECRET: SECRET_TEST, DISCORD_CLIENT_ID: "111", DISCORD_CLIENT_SECRET: "secret", COOKIES_HTTP: "1",
  DISCORD_REDIRECT_URI: "http://localhost/api/auth/discord/callback", DISCORD_GUILD_ID: "900000000000000001",
};

test("l'autorisation demandée à Discord inclut la lecture de ses propres rôles, rien de plus", async () => {
  // Base factice : aucun réglage enregistré (cette route n'écrit rien).
  const requete = { bind() { return this; }, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) };
  const r = await worker.fetch(new Request("http://localhost/api/auth/discord"), { ...ENV_DISCORD, DB: { prepare: () => requete } });
  const cible = new URL(r.headers.get("Location"));
  assert.equal(cible.searchParams.get("scope"), "identify guilds.members.read");
});

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
let base;
let pool;
let env;

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("connexion_roles");
  pool = creerPool(base.url);
  env = { ...ENV_DISCORD, DB: creerAdaptateurDB() };
  await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut, discord_id, discord_pseudo, discord_roles)
     VALUES ('ava', 'Agent', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide', '600000000000000004', 'ava', '["700000000000000009"]')`
  );
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

async function connexion(reponseMembre) {
  const fetchOrigine = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "jeton", token_type: "Bearer" }), { status: 200 });
    if (u.endsWith("/users/@me")) return new Response(JSON.stringify({ id: "600000000000000004", username: "ava" }), { status: 200 });
    if (u.endsWith("/users/@me/guilds/900000000000000001/member")) return reponseMembre();
    throw new Error("appel inattendu : " + u);
  };
  try {
    const r = await worker.fetch(new Request("http://localhost/api/auth/discord/callback?code=abc&state=etat", {
      headers: { Cookie: "d8_oauth_state=etat" },
    }), env);
    return r;
  } finally {
    globalThis.fetch = fetchOrigine;
  }
}
const rolesEnBase = async () => JSON.parse((await pool.query("SELECT discord_roles FROM membres WHERE discord_id = '600000000000000004'")).rows[0].discord_roles);

it("rôles relus à chaque connexion ; gardés si Discord ne répond pas", async () => {
  let r = await connexion(() => new Response(JSON.stringify({ roles: ["700000000000000001", "700000000000000003"] }), { status: 200 }));
  assert.equal(r.headers.get("Location"), "/admin.html");
  assert.deepEqual(await rolesEnBase(), ["700000000000000001", "700000000000000003"]);

  r = await connexion(() => new Response("{}", { status: 500 }));
  assert.equal(r.headers.get("Location"), "/admin.html", "la connexion n'échoue pas pour autant");
  assert.deepEqual(await rolesEnBase(), ["700000000000000001", "700000000000000003"], "derniers rôles connus gardés");

  await connexion(() => new Response("{}", { status: 404 }));
  assert.deepEqual(await rolesEnBase(), [], "plus sur le serveur : plus aucun rôle");
});
