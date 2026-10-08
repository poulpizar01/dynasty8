// Agenda (src/agenda.js) : visibilité par rôle Discord, droits de création
// réglés dans Paramètres, événements « Perso » envoyés dans le ticket de la
// personne (jamais créés si son ticket est introuvable). Discord n'est jamais
// appelé : fausse API. La partie « vraie base » est ignorée sans TEST_DATABASE_URL.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import { routeAgenda, droitsAgenda, lireIdsDiscord, parisVersDate } from "../src/agenda.js";
import { creerBaseDeTest, SECRET_TEST } from "./aide-medias.js";

const ROLE_PATRONS = "700000000000000001";
const ROLE_DIRECTION = "700000000000000002";
const ROLE_TOUS = "700000000000000003";
const ROLE_RH = "700000000000000004";
const REGLAGES = {
  agenda_roles_patrons: ROLE_PATRONS,
  agenda_roles_direction: `${ROLE_DIRECTION} ${ROLE_PATRONS}`,
  agenda_role_tous: ROLE_TOUS,
  agenda_createurs_direction: ROLE_DIRECTION,
  agenda_createurs_perso: ROLE_RH,
  agenda_categories_tickets: "800000000000000001",
};

test("IDs Discord, droits et heure de Paris", () => {
  assert.deepEqual(lireIdsDiscord("700000000000000001, 700000000000000002\nabc 12"), ["700000000000000001", "700000000000000002"]);
  const agent = droitsAgenda({ grade: "Agent", roles: [ROLE_TOUS] }, REGLAGES);
  assert.deepEqual([...agent.voit].sort(), ["perso", "tous"]);
  assert.deepEqual([...agent.cree], ["perso"]);
  assert.equal(agent.persoAutrui, false);
  const manager = droitsAgenda({ grade: "Manager", roles: [ROLE_DIRECTION, ROLE_TOUS] }, REGLAGES);
  assert.ok(manager.voit.has("direction") && !manager.voit.has("patrons"));
  assert.ok(manager.cree.has("direction") && !manager.cree.has("tous"));
  const patron = droitsAgenda({ grade: "Patron", roles: [] }, {});
  assert.deepEqual([...patron.cree].sort(), ["direction", "patrons", "perso", "tous"], "le trio crée toujours, même sans rôle réglé");
  assert.equal(patron.voit.has("patrons"), false, "voir dépend uniquement des rôles Discord");

  assert.equal(parisVersDate("2026-10-08", "14:30").toISOString(), "2026-10-08T12:30:00.000Z", "heure d'été");
  assert.equal(parisVersDate("2026-12-01", "14:30").toISOString(), "2026-12-01T13:30:00.000Z", "heure d'hiver");
});

// ---- sur une vraie base --------------------------------------------------------

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
let base;
let pool;
let env;
const membres = {};
const fiches = {};
let appelsDiscord = [];
let salonsDiscord = [];
let refusPost = null;

async function fauxDiscord(url, options) {
  const u = new URL(url);
  appelsDiscord.push({ methode: options.method, chemin: u.pathname, corps: options.body ? JSON.parse(options.body) : null });
  assert.equal(options.headers.Authorization, "Bot jeton-bot");
  if (options.method === "GET" && u.pathname === "/api/v10/guilds/900000000000000001/channels") {
    return new Response(JSON.stringify(salonsDiscord), { status: 200 });
  }
  if (options.method === "POST" && /^\/api\/v10\/channels\/\d+\/messages$/.test(u.pathname)) {
    if (refusPost) return new Response("{}", { status: refusPost });
    return new Response(JSON.stringify({ id: "990000000000000001" }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("agenda");
  pool = creerPool(base.url);
  env = {
    DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, REGLAGES_SITE: REGLAGES,
    DISCORD_BOT_TOKEN: "jeton-bot", DISCORD_GUILD_ID: "900000000000000001",
  };
  const comptes = [
    ["patron", "Patron", "600000000000000001", []],
    ["manager", "Manager", "600000000000000002", [ROLE_DIRECTION, ROLE_TOUS]],
    ["rh", "DRH", "600000000000000003", [ROLE_RH, ROLE_TOUS]],
    ["agent", "Agent", "600000000000000004", [ROLE_TOUS]],
    ["stagiaire", "Stagiaire", "600000000000000005", []],
  ];
  for (const [cle, grade, discordId, roles] of comptes) {
    membres[cle] = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut, discord_id, discord_roles)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide', $3, $4) RETURNING id, pseudo, grade`,
      [cle, grade, discordId, JSON.stringify(roles)]
    )).rows[0];
  }
  for (const [cle, prenom, nom, discordId] of [["agent", "Ava", "Stone", "600000000000000004"], ["sansDiscord", "Sam", "Nodis", null], ["externe", "Eli", "Hors", "600000000000000099"]]) {
    fiches[cle] = (await pool.query(
      `INSERT INTO employes (id_employe, prenom, nom, discord_id, grade, statut, date_arrivee)
       VALUES ($1, $2, $3, $4, 'Agent', 'actif', '2026-09-01') RETURNING id`, [`D8-${cle}`, prenom, nom, discordId]
    )).rows[0];
  }
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  appelsDiscord = [];
  refusPost = null;
  salonsDiscord = [];
  await pool.query("TRUNCATE evenements_agenda RESTART IDENTITY");
});

async function api(qui, methode, chemin, corps, envSup = {}) {
  const url = new URL("http://localhost" + chemin);
  const requete = new Request(url, { method: methode, headers: { "Content-Type": "application/json" }, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const r = await routeAgenda(requete, url, { ...env, ...envSup }, membres[qui], { fetchImpl: fauxDiscord });
  return { status: r.status, corps: await r.json() };
}
const evenement = (extra = {}) => ({ titre: "Réunion", jour: "2026-10-08", heure_debut: "14:00", heure_fin: "15:00", notes: "", ...extra });
const visibles = async (qui) => (await api(qui, "GET", "/api/agenda?debut=2026-10-01&fin=2026-10-31")).corps.evenements.map((e) => e.titre).sort();

it("visibilité : chaque groupe ne voit que ce que ses rôles Discord permettent", async () => {
  await pool.query(
    `INSERT INTO evenements_agenda (membre_id, titre, jour, heure_debut, heure_fin, notes) VALUES ($1, 'Ancienne note', '2026-10-05', '09:00', '10:00', '')`,
    [membres.agent.id]
  );
  assert.equal((await api("patron", "POST", "/api/agenda", evenement({ titre: "Patrons", visibilite: "patrons" }))).status, 200);
  assert.equal((await api("manager", "POST", "/api/agenda", evenement({ titre: "Direction", visibilite: "direction" }))).status, 200);
  assert.equal((await api("patron", "POST", "/api/agenda", evenement({ titre: "Tous", visibilite: "tous" }))).status, 200);

  assert.deepEqual(await visibles("agent"), ["Ancienne note", "Tous"], "ancien événement resté privé, + « Tous »");
  assert.deepEqual(await visibles("manager"), ["Direction", "Tous"]);
  assert.deepEqual(await visibles("stagiaire"), [], "sans rôle : rien de partagé");
  assert.deepEqual(await visibles("patron"), ["Patrons", "Tous"], "le créateur voit toujours les siens");
});

it("création : seuls les rôles réglés (et le trio) créent une visibilité partagée", async () => {
  const refus = await api("agent", "POST", "/api/agenda", evenement({ visibilite: "direction" }));
  assert.equal(refus.status, 403);
  assert.match(refus.corps.erreur, /Direction/);
  assert.equal((await api("manager", "POST", "/api/agenda", evenement({ visibilite: "tous" }))).status, 403);
  const droits = (await api("manager", "GET", "/api/agenda?debut=2026-10-01&fin=2026-10-31")).corps.droits;
  assert.deepEqual(droits, { cree: ["perso", "direction"], perso_autrui: false });
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM evenements_agenda")).rows[0].n, 0);
});

it("Perso pour quelqu'un d'autre : posté dans SON ticket le plus récent, visible dans son agenda", async () => {
  salonsDiscord = [
    { id: "810000000000000001", type: 0, parent_id: "800000000000000001", permission_overwrites: [{ id: "600000000000000004", type: 1 }] },
    { id: "810000000000000009", type: 0, parent_id: "800000000000000001", permission_overwrites: [{ id: "600000000000000004", type: 1 }] },
    { id: "810000000000000020", type: 0, parent_id: "800000000000000001", permission_overwrites: [{ id: "600000000000000005", type: 1 }] },
    { id: "810000000000000030", type: 0, parent_id: "855555555555555555", permission_overwrites: [{ id: "600000000000000004", type: 1 }] },
  ];
  const r = await api("rh", "POST", "/api/agenda", evenement({ titre: "Entretien", visibilite: "perso", pour_employe_id: fiches.agent.id, notes: "Bureau du DRH" }));
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.deepEqual([r.corps.envoye_discord, r.corps.ticket], [true, "810000000000000009"], "ticket le plus récent, dans une catégorie réglée");
  const post = appelsDiscord.find((a) => a.methode === "POST");
  assert.equal(post.chemin, "/api/v10/channels/810000000000000009/messages");
  assert.equal(post.corps.content, "<@600000000000000004>");
  assert.deepEqual(post.corps.allowed_mentions, { users: ["600000000000000004"] });
  assert.equal(post.corps.embeds[0].fields[0].value, `<t:${Date.UTC(2026, 9, 8, 12, 0) / 1000}:F>`, "14:00 à Paris = 12:00 UTC");

  assert.deepEqual(await visibles("agent"), ["Entretien"], "visible dans l'agenda de la personne");
  assert.deepEqual(await visibles("rh"), ["Entretien"]);
  assert.deepEqual(await visibles("manager"), []);
  const vu = (await api("agent", "GET", "/api/agenda?debut=2026-10-01&fin=2026-10-31")).corps.evenements[0];
  assert.deepEqual([vu.modifiable, vu.auteur, vu.pour], [false, "rh", "Ava Stone"]);
  assert.equal((await api("agent", "DELETE", `/api/agenda?id=${vu.id}`)).status, 403);
});

it("Perso : pas de ticket, pas d'ID Discord, Discord qui refuse -> erreur claire et rien de créé", async () => {
  const sansTicket = await api("rh", "POST", "/api/agenda", evenement({ pour_employe_id: fiches.externe.id }));
  assert.equal(sansTicket.status, 409);
  assert.match(sansTicket.corps.erreur, /Aucun ticket ouvert par Eli Hors/);

  const sansId = await api("rh", "POST", "/api/agenda", evenement({ pour_employe_id: fiches.sansDiscord.id }));
  assert.equal(sansId.status, 409);
  assert.match(sansId.corps.erreur, /pas d'ID Discord/);

  salonsDiscord = [{ id: "810000000000000001", type: 0, parent_id: "800000000000000001", permission_overwrites: [{ id: "600000000000000099", type: 1 }] }];
  refusPost = 403;
  const refus = await api("rh", "POST", "/api/agenda", evenement({ pour_employe_id: fiches.externe.id }));
  assert.equal(refus.status, 502);
  assert.match(refus.corps.erreur, /n'a pas le droit d'écrire/);

  const nonConfigure = await api("rh", "POST", "/api/agenda", evenement({ pour_employe_id: fiches.externe.id }), { DISCORD_GUILD_ID: "" });
  assert.equal(nonConfigure.status, 503);
  assert.equal((await api("agent", "POST", "/api/agenda", evenement({ pour_employe_id: fiches.externe.id }))).status, 403, "rôle non autorisé");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM evenements_agenda")).rows[0].n, 0);
});
