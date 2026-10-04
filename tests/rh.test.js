// Module RH (src/rh.js) : la fiche employé, source de vérité. Sur une vraie
// base (ignoré sans TEST_DATABASE_URL) : permissions vérifiées côté serveur,
// données sensibles, validation, désactivation sans perte d'historique,
// rattachement des ventes par ID Discord puis pseudo, permissions
// paramétrables, et reprise unique de l'existant.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST, RACINE } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
const CLE_BOT = "cle-bot-de-test";
const CLE_BOT_RH = "cle-bot-rh-de-test";

let base;
let pool;
let env;
const cookies = {};

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("rh");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, STATS_BOT_SECRET: CLE_BOT, RH_BOT_SECRET: CLE_BOT_RH };
  for (const grade of ["Patron", "DRH", "Manager", "Secrétaire de Direction", "Agent"]) {
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
    headers: { Cookie: cookies[grade], "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env);
  return { status: r.status, corps: await r.json().catch(() => null) };
}

// Vente envoyée par le bot (clé secrète, sans session).
let numeroEvenement = 0;
async function venteDuBot(champs) {
  const r = await worker.fetch(new Request("http://localhost/api/stats/ventes", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLE_BOT}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: `test-rh-${++numeroEvenement}`, numeroVente: `V-${numeroEvenement}`, dateVente: "05/10/2026",
      type: "Vente", interieur: "Villa", achat: 1000, semaine: "S41-26", ...champs,
    }),
  }), env);
  assert.equal(r.status, 200, await r.text());
}
const employeDeLaVente = async (eventId) =>
  (await pool.query("SELECT employe_id FROM stats_logs_ventes WHERE event_id = $1", [eventId])).rows[0].employe_id;

let compteur = 0;
const fiche = (champs = {}) => ({
  idEmploye: `T-${++compteur}`, prenom: "Prénom", nom: `Nom${compteur}`, grade: "Agent", dateArrivee: "2026-01-15", ...champs,
});

it("permissions : RH refusé sans droit ; téléphone et RIB réservés à la permission « sensible »", async () => {
  assert.equal((await appel("Agent", "/api/rh/employes")).status, 403, "un Agent n'a aucun droit RH");

  const creee = await appel("Patron", "/api/rh/employes", { method: "POST", corps: fiche({ telephone: "555-0101", rib: "FR76-TEST" }) });
  assert.equal(creee.status, 201);
  const id = creee.corps.id;

  const vueDrh = await appel("DRH", `/api/rh/employes/${id}`);
  assert.deepEqual([vueDrh.corps.telephone, vueDrh.corps.rib], ["555-0101", "FR76-TEST"], "le DRH a « sensible » par défaut");

  const vueManager = await appel("Manager", `/api/rh/employes/${id}`);
  assert.equal(vueManager.status, 200);
  assert.ok(!("telephone" in vueManager.corps) && !("rib" in vueManager.corps), "jamais envoyés sans la permission");
  const listeManager = await appel("Manager", "/api/rh/employes");
  assert.ok(listeManager.corps.employes.every((e) => !("rib" in e)));

  assert.equal((await appel("Manager", `/api/rh/employes/${id}`, { method: "PATCH", corps: { rib: "AUTRE" } })).status, 403);
  // À la création, sans la permission, téléphone et RIB sont ignorés.
  const parManager = await appel("Manager", "/api/rh/employes", { method: "POST", corps: fiche({ rib: "NE-DOIT-PAS-PASSER" }) });
  assert.equal(parManager.status, 201);
  assert.equal((await pool.query("SELECT rib FROM employes WHERE id = $1", [parManager.corps.id])).rows[0].rib, "");
  // Une Secrétaire de Direction peut ajouter et modifier, pas désactiver (valeurs par défaut).
  assert.equal((await appel("Secrétaire de Direction", `/api/rh/employes/${id}/desactiver`, { method: "POST", corps: {} })).status, 403);
});

it("création : champs obligatoires, dates et unicité", async () => {
  const essai = (champs) => appel("Patron", "/api/rh/employes", { method: "POST", corps: fiche(champs) });
  assert.equal((await essai({ idEmploye: "" })).status, 400);
  assert.equal((await essai({ prenom: " " })).status, 400);
  assert.equal((await essai({ dateArrivee: "" })).status, 400);
  assert.equal((await essai({ dateArrivee: "2026-02-30" })).status, 400, "date impossible");
  assert.equal((await essai({ dateDepart: "2025-12-31" })).status, 400, "départ avant l'arrivée");
  assert.equal((await essai({ discordId: "pas-un-nombre" })).status, 400);
  assert.equal((await essai({ grade: "Président" })).status, 400);

  assert.equal((await essai({ idEmploye: "D8-UNIQUE", discordId: "111111111111111111" })).status, 201);
  assert.equal((await essai({ idEmploye: "d8-unique" })).status, 409, "ID employé unique, majuscules ignorées");
  assert.equal((await essai({ discordId: "111111111111111111" })).status, 409, "ID Discord unique");
});

it("désactivation : hors effectif, historique conservé, réactivation possible", async () => {
  const creee = await appel("Patron", "/api/rh/employes", { method: "POST", corps: fiche({ discordPseudo: "vendeur.depart" }) });
  const id = creee.corps.id;
  await venteDuBot({ identite: "vendeur.depart" });
  const evenement = `test-rh-${numeroEvenement}`;
  assert.equal(await employeDeLaVente(evenement), id);

  const effectifAvant = (await appel("Patron", "/api/rh/employes")).corps.effectif;
  assert.equal((await appel("Manager", `/api/rh/employes/${id}/desactiver`, { method: "POST", corps: {} })).status, 200);
  const apres = await appel("Patron", `/api/rh/employes/${id}`);
  assert.equal(apres.corps.statut, "inactif");
  assert.match(apres.corps.dateDepart, /^\d{4}-\d{2}-\d{2}$/, "date de départ posée");
  assert.equal(apres.corps.historique.ventesEnregistrees, 1, "ses ventes restent rattachées");
  const effectifApres = (await appel("Patron", "/api/rh/employes")).corps.effectif;
  assert.deepEqual([effectifApres.actifs, effectifApres.inactifs], [effectifAvant.actifs - 1, effectifAvant.inactifs + 1]);
  assert.equal(await employeDeLaVente(evenement), id);

  // Une saisie depuis le site ne peut pas viser un employé inactif.
  const saisie = await appel("Patron", "/api/stats/ventes", {
    method: "POST",
    corps: { identite: "vendeur.depart", type: "Vente", interieur: "Villa", achat: 500, semaine: "S41-26" },
  });
  assert.equal(saisie.status, 409);

  assert.equal((await appel("Manager", `/api/rh/employes/${id}/reactiver`, { method: "POST", corps: {} })).status, 200);
  const reactive = await appel("Patron", `/api/rh/employes/${id}`);
  assert.deepEqual([reactive.corps.statut, reactive.corps.dateDepart], ["actif", ""]);
});

it("ventes : rattachées par l'ID Discord, sinon par le pseudo ; vendeur inconnu à rattacher", async () => {
  const id = (await appel("Patron", "/api/rh/employes", {
    method: "POST", corps: fiche({ discordId: "222222222222222222", discordPseudo: "ancien.pseudo" }),
  })).corps.id;

  // L'ID Discord fait foi, même si le pseudo envoyé a changé.
  await venteDuBot({ identite: "nouveau.pseudo", discordId: "222222222222222222" });
  assert.equal(await employeDeLaVente(`test-rh-${numeroEvenement}`), id);

  // Vendeur inconnu : la vente est gardée, sans employé, et signalée dans RH.
  await venteDuBot({ identite: "inconnu.42" });
  const venteInconnue = `test-rh-${numeroEvenement}`;
  assert.equal(await employeDeLaVente(venteInconnue), null);
  const aRattacher = await appel("Patron", "/api/rh/a-rattacher");
  assert.ok(aRattacher.corps.vendeurs.some((v) => v.pseudo === "inconnu.42"));

  // Une fiche reçoit ce pseudo : la vente lui est rattachée aussitôt.
  const nouvelle = (await appel("Patron", "/api/rh/employes", { method: "POST", corps: fiche() })).corps.id;
  assert.equal((await appel("Patron", `/api/rh/employes/${nouvelle}`, { method: "PATCH", corps: { discordPseudo: "inconnu.42" } })).status, 200);
  assert.equal(await employeDeLaVente(venteInconnue), nouvelle);
  const plusRien = await appel("Patron", "/api/rh/a-rattacher");
  assert.ok(!plusRien.corps.vendeurs.some((v) => v.pseudo === "inconnu.42"));
});

it("permissions paramétrables par grade, réglées seulement par Patron / Co Patron / Développeur web", async () => {
  assert.equal((await appel("Manager", "/api/rh/permissions")).status, 403);
  const matrice = await appel("Patron", "/api/rh/permissions");
  assert.ok(matrice.corps.grades.every((g) => !["Patron", "Co Patron", "Développeur web"].includes(g.grade)));

  // « voir » est ajouté d'office : toute permission suppose de consulter.
  const regle = await appel("Patron", "/api/rh/permissions", { method: "PUT", corps: { grade: "Agent", permissions: ["sensible"] } });
  assert.equal(regle.status, 200, JSON.stringify(regle.corps));
  assert.deepEqual(regle.corps.permissions.sort(), ["sensible", "voir"]);
  const vueAgent = await appel("Agent", "/api/rh/employes");
  assert.equal(vueAgent.status, 200);
  assert.ok(vueAgent.corps.employes.some((e) => "rib" in e), "l'Agent voit maintenant les données sensibles");

  assert.equal((await appel("Patron", "/api/rh/permissions", { method: "PUT", corps: { grade: "Patron", permissions: [] } })).status, 400);
  await appel("Patron", "/api/rh/permissions", { method: "PUT", corps: { grade: "Agent", permissions: [] } });
  assert.equal((await appel("Agent", "/api/rh/employes")).status, 403);
});

it("reprise de l'existant : fiches agents et anciens vendeurs, une seule fois", async () => {
  // On rejoue la reprise comme sur une base qui ne l'a pas encore faite.
  await pool.query("DELETE FROM stats_config WHERE cle = 'rh_reprise_faite'");
  await pool.query(
    `INSERT INTO stats_agents (discord_pseudo, discord_pseudo_normalise, identite_rp, grade, actif)
     VALUES ('reprise.un', 'reprise.un', 'Jean Reprise', 'Agent Expert', 1)`
  );
  await pool.query(
    `INSERT INTO stats_logs_ventes (identite, type, interieur, achat, semaine, event_id)
     VALUES ('reprise.un', 'Vente', 'Villa', 100, 'S30-26', 'reprise-1'), ('Ancien.Vendeur', 'Vente', 'Villa', 100, 'S20-26', 'reprise-2')`
  );
  const schema = fs.readFileSync(path.join(RACINE, "schema.postgres.sql"), "utf8");
  await pool.query(schema);
  await pool.query(schema); // rejouée : aucun doublon

  const jean = (await pool.query("SELECT * FROM employes WHERE discord_pseudo_normalise = 'reprise.un'")).rows;
  assert.equal(jean.length, 1);
  assert.deepEqual([jean[0].prenom, jean[0].nom, jean[0].grade, jean[0].statut, jean[0].id_provisoire], ["Jean", "Reprise", "Agent Expert", "actif", 1]);
  const ancien = (await pool.query("SELECT * FROM employes WHERE discord_pseudo_normalise = 'ancien.vendeur'")).rows;
  assert.equal(ancien.length, 1);
  assert.equal(ancien[0].statut, "inactif", "un vendeur sans fiche devient un ancien employé");
  const ventes = (await pool.query("SELECT event_id, employe_id FROM stats_logs_ventes WHERE event_id IN ('reprise-1', 'reprise-2') ORDER BY event_id")).rows;
  assert.deepEqual(ventes.map((v) => v.employe_id), [jean[0].id, ancien[0].id]);

  // Reprise faite : un nouveau vendeur inconnu ne crée plus de fiche.
  await pool.query("INSERT INTO stats_logs_ventes (identite, type, interieur, achat, semaine, event_id) VALUES ('tout.nouveau', 'Vente', 'Villa', 1, 'S41-26', 'reprise-3')");
  await pool.query(schema);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM employes WHERE discord_pseudo_normalise = 'tout.nouveau'")).rows[0].n, 0);
});

// Arrivée envoyée par le bot de recrutement (clé RH_BOT_SECRET, sans session).
async function arriveeDuBot(corps, cle = CLE_BOT_RH) {
  const r = await worker.fetch(new Request("http://localhost/api/rh/bot/arrivees", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  }), env);
  return { status: r.status, corps: await r.json() };
}

it("bot de recrutement : un ticket crée la fiche, une seule fois, avec les réglages de RH", async () => {
  const ticket = { ticketId: "ticket-001", discordId: "333333333333333333", discordPseudo: "nouvelle.recrue",
    prenom: "Lina", nom: "Recrue", telephone: "555-0199", rib: "FR76-BOT" };

  assert.equal((await arriveeDuBot(ticket, "mauvaise-cle")).status, 401);
  assert.equal((await arriveeDuBot({ ...ticket, ticketId: "" })).status, 400, "ticketId obligatoire");

  // Ni grade dans le ticket, ni grade d'arrivée réglé : refusé, et consigné.
  const sansGrade = await arriveeDuBot(ticket);
  assert.equal(sansGrade.status, 400);
  assert.equal(sansGrade.corps.resultat, "refusee");

  // Réglages : réservés aux grades administrateurs, grades de direction exclus.
  const reglages = { gradeArrivee: "Stagiaire", serveurDiscord: "444444444444444444" };
  assert.equal((await appel("DRH", "/api/rh/bot/reglages", { method: "PUT", corps: reglages })).status, 403);
  assert.equal((await appel("Patron", "/api/rh/bot/reglages", { method: "PUT", corps: { gradeArrivee: "Patron" } })).status, 400);
  assert.equal((await appel("Patron", "/api/rh/bot/reglages", { method: "PUT", corps: reglages })).status, 200);

  // Serveur Discord différent de celui réglé : refusé.
  assert.equal((await arriveeDuBot({ ...ticket, serveurDiscord: "555555555555555555" })).status, 403);

  // Le même ticket, renvoyé corrigé : la fiche est créée, active, ID provisoire.
  const creee = await arriveeDuBot({ ...ticket, serveurDiscord: "444444444444444444" });
  assert.equal(creee.status, 201, JSON.stringify(creee.corps));
  assert.equal(creee.corps.resultat, "creee");
  assert.match(creee.corps.idEmploye, /^PROV-B\d{4,}$/);
  const fiche = (await pool.query("SELECT * FROM employes WHERE id = $1", [creee.corps.employeId])).rows[0];
  assert.deepEqual(
    [fiche.prenom, fiche.nom, fiche.grade, fiche.statut, fiche.discord_id, fiche.telephone, fiche.rib, fiche.id_provisoire],
    ["Lina", "Recrue", "Stagiaire", "actif", "333333333333333333", "555-0199", "FR76-BOT", 1]
  );
  assert.match(fiche.date_arrivee, /^\d{4}-\d{2}-\d{2}$/, "date d'arrivée du jour par défaut");

  // Renvoi du même ticket (réponse perdue côté bot) : rien de plus.
  const renvoi = await arriveeDuBot({ ...ticket, serveurDiscord: "444444444444444444" });
  assert.deepEqual([renvoi.status, renvoi.corps.deja, renvoi.corps.employeId], [200, true, creee.corps.employeId]);

  // Autre ticket pour le même compte Discord : pas de deuxième fiche, la
  // première n'est pas modifiée.
  const autre = await arriveeDuBot({ ...ticket, ticketId: "ticket-002", prenom: "Autre", serveurDiscord: "444444444444444444" });
  assert.deepEqual([autre.status, autre.corps.resultat, autre.corps.employeId], [200, "existante", creee.corps.employeId]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM employes WHERE discord_id = '333333333333333333'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT prenom FROM employes WHERE id = $1", [creee.corps.employeId])).rows[0].prenom, "Lina");

  // ID employé fourni et grade du ticket : repris tels quels ; grade de direction refusé.
  const avecId = await arriveeDuBot({ ticketId: "ticket-003", discordId: "666666666666666666", prenom: "Noa", nom: "Direct",
    idEmploye: "D8-0777", grade: "Agent", serveurDiscord: "444444444444444444" });
  assert.deepEqual([avecId.status, avecId.corps.idEmploye, avecId.corps.idProvisoire], [201, "D8-0777", false]);
  const patron = await arriveeDuBot({ ticketId: "ticket-004", discordId: "777777777777777777", prenom: "Pat", nom: "Ron",
    grade: "Patron", serveurDiscord: "444444444444444444" });
  assert.equal(patron.status, 400);

  // L'écran RH liste les tickets reçus, sans téléphone ni RIB.
  const ecran = await appel("Manager", "/api/rh/bot");
  assert.equal(ecran.status, 200);
  assert.equal(ecran.corps.configure, true);
  assert.equal(ecran.corps.reglages.gradeArrivee, "Stagiaire");
  const t1 = ecran.corps.arrivees.find((a) => a.ticketId === "ticket-001");
  assert.deepEqual([t1.resultat, t1.employe.idEmploye], ["creee", creee.corps.idEmploye]);
  assert.ok(!JSON.stringify(ecran.corps).includes("FR76-BOT") && !JSON.stringify(ecran.corps).includes("555-0199"));
  assert.equal((await appel("Agent", "/api/rh/bot")).status, 403);

  // Sans clé sur le serveur, la réception le dit.
  const sansCle = await worker.fetch(new Request("http://localhost/api/rh/bot/arrivees", {
    method: "POST", headers: { Authorization: "Bearer x", "Content-Type": "application/json" }, body: "{}",
  }), { ...env, RH_BOT_SECRET: "" });
  assert.equal(sansCle.status, 503);
});
