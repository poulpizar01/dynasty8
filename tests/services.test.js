// Membres en service (src/services.js) : lecture du salon Discord des prises
// et fins de service (messages du bot « Agatha »), cas particuliers et
// encadré « En service ». La partie « vraie base » est ignorée sans
// TEST_DATABASE_URL. Les messages reproduisent ceux des captures du
// 8 octobre 2026 ; Discord n'est jamais appelé (fausse API).
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { lireEmbedService, lireHorodatageDiscord, discordIdDepuisAvatar, lireServices } from "../src/services.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST } from "./aide-medias.js";

const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const quand = (iso) => `<t:${t(iso)}:f>\n<t:${t(iso)}:R>`;
const AVATAR_GREY = "https://cdn.discordapp.com/avatars/411111111111111111/a1b2c3.png";

function embedDebut({ nom = "Grey Brook", id = "cmuzjk6sl04ql3ao1asdrh25z", debut = "2026-10-08T12:57:00Z", avatar = AVATAR_GREY } = {}) {
  return {
    title: "🟢 Service démarré",
    author: { name: nom, icon_url: avatar },
    fields: [
      { name: "Employé", value: nom, inline: true },
      { name: "Mode", value: "Autonome", inline: true },
      { name: "Début", value: quand(debut), inline: true },
      { name: "ID service", value: "`" + id + "`" },
    ],
    footer: { text: "Dynasty8 Services" },
  };
}
function embedFin({ titre = "⚫ Service terminé", nom = "Grey Brook", id = "cmuzjk6sl04ql3ao1asdrh25z", cause = "Fin normale",
  debut = "2026-10-08T12:57:00Z", fin = "2026-10-08T13:51:00Z", avatar = AVATAR_GREY, extra = [] } = {}) {
  return {
    title: titre,
    author: { name: nom, icon_url: avatar },
    fields: [
      { name: "Employé", value: nom, inline: true },
      { name: "Cause de fin", value: cause, inline: true },
      { name: "Durée réelle", value: "54m", inline: true },
      { name: "Début", value: quand(debut), inline: true },
      { name: "Fin", value: quand(fin), inline: true },
      ...extra,
      { name: "ID service", value: "`" + id + "`" },
    ],
    footer: { text: "Dynasty8 Services" },
  };
}

test("lecture des messages du bot des services (formats des captures)", () => {
  assert.equal(lireHorodatageDiscord(quand("2026-10-08T12:57:00Z")).toISOString(), "2026-10-08T12:57:00.000Z");
  assert.equal(lireHorodatageDiscord("8 octobre 2026 14:57"), null, "un texte n'est jamais interprété comme une date");
  assert.equal(discordIdDepuisAvatar(AVATAR_GREY), "411111111111111111");
  assert.equal(discordIdDepuisAvatar("https://cdn.discordapp.com/guilds/1/users/422222222222222222/avatars/x.png"), "422222222222222222");
  assert.equal(discordIdDepuisAvatar("https://cdn.discordapp.com/embed/avatars/0.png"), null);

  const d = lireEmbedService(embedDebut());
  assert.deepEqual([d.type, d.serviceId, d.employe, d.mode, d.discordId, d.debut.toISOString()],
    ["debut", "cmuzjk6sl04ql3ao1asdrh25z", "Grey Brook", "Autonome", "411111111111111111", "2026-10-08T12:57:00.000Z"]);

  for (const [titre, cause] of [["⚫ Service terminé", "Fin normale"], ["🟣 Service fermé pour inactivité", "Inactivité"], ["🔴 Service terminé en avance", "Fin anticipée"]]) {
    const f = lireEmbedService(embedFin({ titre, cause }));
    assert.equal(f.type, "fin", titre);
    assert.equal(f.cause, cause);
    assert.equal(f.fin.toISOString(), "2026-10-08T13:51:00.000Z");
  }
  assert.equal(lireEmbedService({ title: "Nouvelle annonce", fields: [] }), null);
  assert.equal(lireEmbedService({ ...embedDebut(), fields: embedDebut().fields.filter((f) => f.name !== "ID service") }), null, "sans ID service : ignoré");
});

// ---- sur une vraie base --------------------------------------------------------

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
const SALON = "1400000000000000001";
let base;
let pool;
let env;
let cookies = {};
let salon = []; // messages du faux salon Discord
let reponseForcee = null;
let numero = 1000;

function publier(embed, { auteur = { id: "1399999999999999999", username: "Agatha", bot: true }, horodatage = "2026-10-08T13:00:00Z" } = {}) {
  salon.push({ id: String(1500000000000000000n + BigInt(numero++)), author: auteur, timestamp: horodatage, embeds: [embed] });
}

// Fausse API Discord : GET /channels/{salon}/messages?limit=100[&after=…]
async function fauxDiscord(url, options) {
  assert.match(options.headers.Authorization, /^Bot jeton-de-test$/);
  if (reponseForcee) return new Response("{}", { status: reponseForcee });
  const u = new URL(url);
  assert.equal(u.pathname, `/api/v10/channels/${SALON}/messages`);
  const apres = u.searchParams.get("after");
  const lot = salon.filter((m) => !apres || BigInt(m.id) > BigInt(apres)).slice(0, 100);
  return new Response(JSON.stringify([...lot].reverse()), { status: 200 });
}

const passe = (maintenant = new Date("2026-10-08T14:00:00Z")) => lireServices(
  { ...env, REGLAGES_SITE: { services_salon_id: SALON, services_cloture_heures: "12" } },
  { fetchImpl: fauxDiscord, maintenant }
);
const ligne = async (id) => (await pool.query("SELECT * FROM services WHERE service_id = $1", [id])).rows[0];

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("services");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, DISCORD_BOT_TOKEN: "jeton-de-test" };
  for (const [cle, grade] of [["patron", "Patron"], ["agent", "Agent"]]) {
    const m = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`, [cle, grade]
    )).rows[0];
    cookies[cle] = cookieSession(m);
  }
  await pool.query(
    `INSERT INTO employes (id_employe, prenom, nom, discord_id, grade, statut, date_arrivee)
     VALUES ('D8-100', 'Grey', 'Brook', '411111111111111111', 'Agent', 'actif', '2026-09-01')`
  );
});

after(async () => {
  if (!ACTIF) return;
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  salon = [];
  reponseForcee = null;
  await pool.query("TRUNCATE services, services_etat RESTART IDENTITY");
  await pool.query("INSERT INTO reglages_site (cle, valeur) VALUES ('services_salon_id', $1) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur", [SALON]);
});

async function api(qui, chemin) {
  const r = await worker.fetch(new Request("http://localhost" + chemin, { headers: { Cookie: cookies[qui] } }), env);
  return { status: r.status, corps: await r.json().catch(() => null) };
}

it("prise puis fin de service : en service avec l'identité RH, puis plus en service", async () => {
  publier(embedDebut());
  let r = await passe();
  assert.deepEqual([r.statut, r.reconnus], ["ok", 1]);
  const ouvert = await ligne("cmuzjk6sl04ql3ao1asdrh25z");
  assert.equal(ouvert.debut, "2026-10-08 12:57:00");
  assert.equal(ouvert.fin, null);
  assert.ok(ouvert.employe_id, "rattaché à la fiche RH par l'ID Discord de l'avatar");

  // Les membres voient l'encadré ; l'état de lecture est réservé aux réglages.
  const enCours = await api("agent", "/api/services/en-cours");
  assert.equal(enCours.status, 200);
  assert.deepEqual(enCours.corps.en_service.map((p) => [p.nom, p.depuis]), [["Grey Brook", "2026-10-08 12:57:00"]]);
  assert.equal((await api("agent", "/api/services/etat")).status, 403);

  publier(embedFin({ titre: "🔴 Service terminé en avance", cause: "Fin anticipée", extra: [{ name: "Justification", value: "zz" }] }));
  r = await passe();
  assert.equal(r.lus, 1, "seuls les nouveaux messages sont relus");
  const ferme = await ligne("cmuzjk6sl04ql3ao1asdrh25z");
  assert.deepEqual([ferme.fin, ferme.cause_fin, ferme.fin_source, ferme.anomalie], ["2026-10-08 13:51:00", "Fin anticipée", "bot", ""]);
  assert.deepEqual((await api("agent", "/api/services/en-cours")).corps.en_service, []);
});

it("fin sans début lu : ligne créée depuis le message de fin, signalée", async () => {
  publier(embedFin({ nom: "Noam Finley NO MP", id: "cmuziej0e04q33ao1csmoctkl", debut: "2026-10-08T12:25:00Z", fin: "2026-10-08T13:26:00Z", avatar: null }));
  await passe();
  const l = await ligne("cmuziej0e04q33ao1csmoctkl");
  assert.deepEqual([l.debut, l.fin, l.anomalie, l.employe_nom, l.employe_id], ["2026-10-08 12:25:00", "2026-10-08 13:26:00", "fin_sans_debut", "Noam Finley NO MP", null]);
});

it("double prise de service : la précédente est fermée à l'heure de la nouvelle", async () => {
  publier(embedDebut({ id: "service-un-0001", debut: "2026-10-08T10:00:00Z" }));
  publier(embedDebut({ id: "service-deux-0002", debut: "2026-10-08T11:30:00Z" }));
  await passe();
  const premier = await ligne("service-un-0001");
  assert.deepEqual([premier.fin, premier.fin_source, premier.anomalie], ["2026-10-08 11:30:00", "doublon", "debut_en_double"]);
  assert.equal((await ligne("service-deux-0002")).fin, null);
  assert.equal((await api("agent", "/api/services/en-cours")).corps.en_service.length, 1, "une personne n'apparaît qu'une fois");
});

it("service jamais fermé : clôture automatique, remplacée par la vraie fin si elle arrive", async () => {
  publier(embedDebut({ id: "service-oublie-01", debut: "2026-10-07T20:00:00Z" }));
  await passe(new Date("2026-10-08T09:00:00Z"));
  let l = await ligne("service-oublie-01");
  assert.deepEqual([l.fin, l.fin_source, l.anomalie], ["2026-10-08 08:00:00", "auto", "cloture_auto"]);

  publier(embedFin({ titre: "🟣 Service fermé pour inactivité", cause: "Inactivité", id: "service-oublie-01", debut: "2026-10-07T20:00:00Z", fin: "2026-10-07T23:10:00Z" }));
  await passe(new Date("2026-10-08T09:01:00Z"));
  l = await ligne("service-oublie-01");
  assert.deepEqual([l.fin, l.cause_fin, l.fin_source, l.anomalie], ["2026-10-07 23:10:00", "Inactivité", "bot", ""]);
});

it("messages relus, messages d'un membre et sans ID : rien en double, rien d'inventé", async () => {
  publier(embedDebut({ id: "service-unique-01" }));
  publier(embedDebut({ id: "service-imite-001" }), { auteur: { id: "1388888888888888888", username: "un membre" } });
  publier({ title: "🟢 Service démarré", fields: [{ name: "Employé", value: "X" }] });
  await passe();
  await pool.query("UPDATE services_etat SET dernier_message_id = NULL"); // tout relire
  await passe();
  const lignes = (await pool.query("SELECT service_id FROM services ORDER BY id")).rows.map((r) => r.service_id);
  assert.deepEqual(lignes, ["service-unique-01"]);
});

it("accès refusé par Discord : erreur claire dans Paramètres, aucune donnée touchée", async () => {
  reponseForcee = 403;
  const r = await passe();
  assert.equal(r.statut, "erreur");
  const etat = await api("patron", "/api/services/etat");
  assert.equal(etat.status, 200);
  assert.match(etat.corps.etat.erreur, /pas accès à ce salon/);
});
