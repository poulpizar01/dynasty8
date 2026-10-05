// Module RH (src/rh.js) : la fiche employé, source de vérité. Sur une vraie
// base (ignoré sans TEST_DATABASE_URL) : permissions vérifiées côté serveur,
// données sensibles, validation, désactivation sans perte d'historique,
// rattachement des ventes par ID Discord puis pseudo, permissions
// paramétrables, et reprise unique de l'existant.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { creerBaseDeTest, cookieSession, SECRET_TEST, RACINE } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
const CLE_BOT = "cle-bot-de-test";
const SECRET_WEBHOOK = "secret-abonnement-candidatures-de-test";

let base;
let pool;
let env;
const cookies = {};

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("rh");
  pool = creerPool(base.url);
  env = { DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST, STATS_BOT_SECRET: CLE_BOT, RECRUTEMENT_WEBHOOK_SECRET: SECRET_WEBHOOK };
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

// Événement poussé par le bot Discord, au format exact de son webhookDispatcher :
// corps { guildId, eventType, payload, sentAt }, signé HMAC-SHA256 (hexadécimal)
// dans l'en-tête X-Signature-256.
const SERVEUR = "444444444444444444";
async function evenementDuBot(payload, { secret = SECRET_WEBHOOK, eventType = "recruitment.updated", guildId = SERVEUR } = {}) {
  const corps = JSON.stringify({ guildId, eventType, payload, sentAt: "2026-10-04T21:30:00.000Z" });
  const r = await worker.fetch(new Request("http://localhost/api/rh/bot/candidatures", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature-256": createHmac("sha256", secret).update(corps).digest("hex") },
    body: corps,
  }), env);
  return { status: r.status, corps: await r.json() };
}
const candidature = (champs = {}) => ({
  ticketId: "ckticket001", channelId: "1290000000000000001", candidateId: "999999999999999999",
  submittedById: "333333333333333333", status: "ACCEPTED", statusChangedVia: "DISCORD", statusChangedById: "111111111111111111",
  recruiterId: null, submittedAt: "2026-10-04T20:00:00.000Z", attachments: [],
  answers: [
    { question: "Nom RP", answer: "Lina De la Recrue" },
    { question: "Numéro de téléphone", answer: "555-0199" },
    { question: "RIB", answer: "FR76-BOT" },
    { question: "Motivation", answer: "Vendre des villas." },
  ],
  ...champs,
});

it("bot Discord : une candidature acceptée crée la fiche, une seule fois, selon les réglages de RH", async () => {
  assert.equal((await evenementDuBot(candidature(), { secret: "mauvais-secret" })).status, 401, "signature vérifiée");
  assert.equal((await evenementDuBot(candidature(), { eventType: "absence.updated" })).status, 400, "seul recruitment.updated est géré");

  // Une candidature pas encore acceptée ne crée rien.
  const enAttente = await evenementDuBot(candidature({ status: "INTERVIEW" }));
  assert.deepEqual([enAttente.status, !!enAttente.corps.ignore], [200, true]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM rh_arrivees_bot")).rows[0].n, 0);

  // Acceptée, mais rien n'est réglé : gardée « à traiter » (le bot ne renverrait pas un 4xx).
  const aTraiter = await evenementDuBot(candidature());
  assert.deepEqual([aTraiter.status, aTraiter.corps.resultat], [202, "refusee"]);
  assert.match(aTraiter.corps.motif, /Nom RP/, "le motif cite les questions reçues");
  const ecranAvant = await appel("Patron", "/api/rh/bot");
  assert.ok(ecranAvant.corps.questionsVues.includes("Numéro de téléphone"), "libellés proposés pour le réglage");
  assert.ok(!JSON.stringify(ecranAvant.corps).includes("FR76-BOT"), "jamais les réponses elles-mêmes");

  // Réglages : réservés aux grades administrateurs, cohérents.
  const reglages = { gradeArrivee: "Stagiaire", serveurDiscord: SERVEUR, questionIdentite: "nom rp",
    questionTelephone: "Numéro de téléphone", questionRib: "RIB" };
  assert.equal((await appel("DRH", "/api/rh/bot/reglages", { method: "PUT", corps: reglages })).status, 403);
  assert.equal((await appel("Patron", "/api/rh/bot/reglages", { method: "PUT", corps: { ...reglages, gradeArrivee: "Patron" } })).status, 400);
  assert.equal((await appel("Patron", "/api/rh/bot/reglages", { method: "PUT", corps: { ...reglages, questionPrenom: "Prénom" } })).status, 400);
  assert.equal((await appel("Patron", "/api/rh/bot/reglages", { method: "PUT", corps: reglages })).status, 200);

  // RH retraite le ticket : la fiche est créée, active, ID provisoire.
  const ligne = (await appel("Patron", "/api/rh/bot")).corps.arrivees.find((a) => a.ticketId === "ckticket001");
  assert.equal(ligne.traitable, true);
  assert.equal((await appel("Agent", `/api/rh/bot/arrivees/${ligne.id}/traiter`, { method: "POST", corps: {} })).status, 403);
  const retraite = await appel("Manager", `/api/rh/bot/arrivees/${ligne.id}/traiter`, { method: "POST", corps: {} });
  assert.deepEqual([retraite.status, retraite.corps.resultat], [200, "creee"]);
  const fiche = (await pool.query("SELECT * FROM employes WHERE id = $1", [retraite.corps.employeId])).rows[0];
  assert.deepEqual(
    [fiche.prenom, fiche.nom, fiche.grade, fiche.statut, fiche.discord_id, fiche.telephone, fiche.rib, fiche.id_provisoire, fiche.date_arrivee],
    ["Lina", "De la Recrue", "Stagiaire", "actif", "333333333333333333", "555-0199", "FR76-BOT", 1, "2026-10-04"]
  );
  assert.match(fiche.id_employe, /^PROV-B\d{4,}$/);
  const apres = (await pool.query("SELECT charge FROM rh_arrivees_bot WHERE ticket_id = 'ckticket001'")).rows[0];
  assert.equal(apres.charge, null, "réponses effacées une fois la fiche créée");

  // Le bot renvoie le même ticket (changement de recruteur...) : rien de plus.
  const renvoi = await evenementDuBot(candidature({ recruiterId: "888888888888888888" }));
  assert.deepEqual([renvoi.status, renvoi.corps.deja, renvoi.corps.employeId], [200, true, fiche.id]);

  // Autre ticket du même compte Discord : pas de deuxième fiche, la première intacte.
  const autre = await evenementDuBot(candidature({ ticketId: "ckticket002", answers: [{ question: "Nom RP", answer: "Autre Nom" }] }));
  assert.deepEqual([autre.status, autre.corps.resultat, autre.corps.employeId], [200, "existante", fiche.id]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM employes WHERE discord_id = '333333333333333333'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT prenom FROM employes WHERE id = $1", [fiche.id])).rows[0].prenom, "Lina");

  // Nouveau candidat, réglages en place : fiche créée dès la réception.
  const direct = await evenementDuBot(candidature({ ticketId: "ckticket003", submittedById: "666666666666666666",
    answers: [{ question: "Nom RP", answer: "Noa Direct" }] }));
  assert.deepEqual([direct.status, direct.corps.resultat], [201, "creee"]);

  // Nom incomplet : à traiter, avec le motif.
  const incomplet = await evenementDuBot(candidature({ ticketId: "ckticket004", submittedById: "777777777777777777",
    answers: [{ question: "Nom RP", answer: "Mononyme" }] }));
  assert.deepEqual([incomplet.status, incomplet.corps.resultat], [202, "refusee"]);

  // Embauche constatée en jeu (log FiveM) : pas de fiche, en attente d'approbation.
  const enJeu = await evenementDuBot(candidature({ ticketId: "ckticket006", submittedById: "121212121212121212",
    statusChangedVia: "MONITORING", statusChangedById: null, answers: [{ question: "Nom RP", answer: "Sam Enjeu" }] }));
  assert.deepEqual([enJeu.status, enJeu.corps.resultat], [202, "attente"]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM employes WHERE discord_id = '121212121212121212'")).rows[0].n, 0);
  // Un renvoi du bot (pièce jointe...) ne change rien ; une validation dans Discord crée la fiche.
  assert.equal((await evenementDuBot(candidature({ ticketId: "ckticket006", submittedById: "121212121212121212",
    statusChangedVia: "MONITORING", answers: [{ question: "Nom RP", answer: "Sam Enjeu" }] }))).corps.resultat, "attente");
  const valideDiscord = await evenementDuBot(candidature({ ticketId: "ckticket006", submittedById: "121212121212121212",
    answers: [{ question: "Nom RP", answer: "Sam Enjeu" }] }));
  assert.deepEqual([valideDiscord.status, valideDiscord.corps.resultat], [201, "creee"]);

  // Ancienne version du bot (sans statusChangedVia) : prudence, en attente aussi.
  const sansOrigine = await evenementDuBot(candidature({ ticketId: "ckticket007", submittedById: "131313131313131313",
    statusChangedVia: undefined, answers: [{ question: "Nom RP", answer: "Alex Approuve" }] }));
  assert.equal(sansOrigine.corps.resultat, "attente");
  // RH approuve depuis le site : la fiche est créée.
  const enAttente2 = (await appel("Patron", "/api/rh/bot")).corps.arrivees.find((a) => a.ticketId === "ckticket007");
  assert.deepEqual([enAttente2.resultat, enAttente2.traitable, enAttente2.ecartable], ["attente", true, true]);
  const approuve = await appel("DRH", `/api/rh/bot/arrivees/${enAttente2.id}/traiter`, { method: "POST", corps: {} });
  assert.deepEqual([approuve.status, approuve.corps.resultat], [200, "creee"]);
  assert.equal((await pool.query("SELECT prenom FROM employes WHERE discord_id = '131313131313131313'")).rows[0].prenom, "Alex");

  // Écartée depuis le site : aucune fiche, réponses effacées, plus rien ne la relance.
  await evenementDuBot(candidature({ ticketId: "ckticket008", submittedById: "141414141414141414", statusChangedVia: "MONITORING",
    answers: [{ question: "Nom RP", answer: "Lou Ecarte" }] }));
  const aEcarter = (await appel("Patron", "/api/rh/bot")).corps.arrivees.find((a) => a.ticketId === "ckticket008");
  assert.equal((await appel("Manager", `/api/rh/bot/arrivees/${aEcarter.id}/ecarter`, { method: "POST", corps: {} })).status, 200);
  const ecartee = (await pool.query("SELECT resultat, charge FROM rh_arrivees_bot WHERE ticket_id = 'ckticket008'")).rows[0];
  assert.deepEqual([ecartee.resultat, ecartee.charge], ["ecartee", null]);
  assert.equal((await evenementDuBot(candidature({ ticketId: "ckticket008", submittedById: "141414141414141414",
    answers: [{ question: "Nom RP", answer: "Lou Ecarte" }] }))).corps.deja, true);

  // Refusée dans Discord alors qu'elle attendait : écartée.
  await evenementDuBot(candidature({ ticketId: "ckticket009", submittedById: "151515151515151515", statusChangedVia: "MONITORING",
    answers: [{ question: "Nom RP", answer: "Max Refuse" }] }));
  const refus = await evenementDuBot(candidature({ ticketId: "ckticket009", submittedById: "151515151515151515", status: "REJECTED",
    answers: [{ question: "Nom RP", answer: "Max Refuse" }] }));
  assert.equal(refus.corps.resultat, "ecartee");

  // Autre serveur Discord que celui réglé : refusé.
  assert.equal((await evenementDuBot(candidature({ ticketId: "ckticket005" }), { guildId: "555555555555555555" })).status, 403);

  // Écran RH : visible avec « voir », jamais téléphone ni RIB.
  const ecran = await appel("Manager", "/api/rh/bot");
  assert.equal(ecran.corps.configure, true);
  assert.ok(!JSON.stringify(ecran.corps).includes("FR76-BOT") && !JSON.stringify(ecran.corps).includes("555-0199"));
  assert.equal((await appel("Agent", "/api/rh/bot")).status, 403);

  // Sans secret sur le serveur : 503, le bot réessaiera plus tard.
  const sansSecret = await worker.fetch(new Request("http://localhost/api/rh/bot/candidatures", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }), { ...env, RECRUTEMENT_WEBHOOK_SECRET: "" });
  assert.equal(sansSecret.status, 503);
});
