// Migration des photos base64 (src/migration-medias.js) contre une vraie base
// PostgreSQL et un faux service FBFA : simulation sans écriture, reprise
// après échec, déduplication, conflit de contenu, retour arrière.
// Nécessite TEST_DATABASE_URL (voir tests/medias-integration.test.js).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import { lireConfigMedias, creerClientDepuisConfig, nettoyerMedias } from "../src/medias.js";
import { migrerImagesBase64, annulerMigration } from "../src/migration-medias.js";
import { creerBaseDeTest, demarrerFauxFbfa, jpegMinimal, pngValide, dataUrl } from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);

let base;
let pool;
let faux;
let db;
let config;
const PHOTO_A = dataUrl(jpegMinimal(8, 6));
const PHOTO_B = dataUrl(pngValide(3, 3), "image/png");
const GIF = "data:image/gif;base64," + Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;").toString("base64");
const LIEN = "https://exemple.fr/photo.jpg";
let ids;

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("migration");
  pool = creerPool(base.url);
  faux = await demarrerFauxFbfa();
  db = creerAdaptateurDB();
  config = lireConfigMedias({ FBFA_STORAGE_TOKEN: faux.jeton, FBFA_STORAGE_BASE: faux.base, FBFA_STORAGE_DELAI_MS: "1000" });
});

after(async () => {
  if (!ACTIF) return;
  await faux.arreter();
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  faux.reinitialiser();
  await pool.query("TRUNCATE medias_references, medias_migration_sauvegarde, medias, biens, membres RESTART IDENTITY CASCADE");
  const ajouter = async (titre, images, maj) => (await pool.query(
    `INSERT INTO biens (categorie, titre, images, cree_le, maj) VALUES ('habitation', $1, $2, '2026-01-01 00:00:00', $3) RETURNING id`,
    [titre, JSON.stringify(images), maj]
  )).rows[0].id;
  ids = {
    b1: await ajouter("Annonce 1", [PHOTO_A, LIEN, PHOTO_B, PHOTO_A], "2026-02-01 10:00:00"),
    b2: await ajouter("Annonce 2", [PHOTO_A, GIF], "2026-02-02 10:00:00"),
    b3: await ajouter("Sans base64", [LIEN], "2026-02-03 10:00:00"),
  };
  ids.m1 = (await pool.query(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut, photo, discord_avatar)
     VALUES ('agent', 'Agent', 'x', 'x', 1, '2026-01-01 00:00:00', 'valide', $1, 'https://cdn.discordapp.com/a.png') RETURNING id`,
    [PHOTO_B]
  )).rows[0].id;
});

const client = () => creerClientDepuisConfig(config);
const images = async (id) => JSON.parse((await pool.query("SELECT images FROM biens WHERE id = $1", [id])).rows[0].images);
const instantane = async () => (await pool.query("SELECT id, images, maj FROM biens ORDER BY id")).rows.concat((await pool.query("SELECT id, photo FROM membres ORDER BY id")).rows);

it("simulation : inventaire et compte rendu, aucune écriture ni appel distant", async () => {
  const avant = await instantane();
  const rapport = await migrerImagesBase64({ db, client: client(), config, mode: "simulation" });
  assert.deepEqual(rapport.totaux, {
    elements: 5, a_migrer: 4, migres: 0, reutilises: 0, invalides: 1, conflits: 0, erreurs: 0,
    octets_a_migrer: rapport.totaux.octets_a_migrer, octets_migres: 0, empreintes_uniques: 2,
  });
  assert.deepEqual(rapport.elements.find((e) => e.ligne_id === ids.b1 && e.mime === "image/jpeg").positions, [0, 3]);
  assert.equal(rapport.elements.find((e) => e.resultat === "invalide").ligne_id, ids.b2);
  assert.ok(!JSON.stringify(rapport).includes("base64,"), "le rapport ne recopie pas les images");
  assert.deepEqual(await instantane(), avant);
  assert.equal(faux.appels.length, 0);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias")).rows[0].n, 0);
});

it("migration réelle : remplacement après envoi confirmé, sauvegarde, rattachement, maj inchangée", async () => {
  const rapport = await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  assert.equal(rapport.totaux.erreurs, 0);
  assert.equal(rapport.totaux.invalides, 1);
  assert.equal(rapport.totaux.migres + rapport.totaux.reutilises, 4);

  const b1 = await images(ids.b1);
  assert.equal(b1[1], LIEN, "lien externe intact");
  assert.ok(b1[0].startsWith(`${faux.base}/view/`));
  assert.equal(b1[0], b1[3], "même image -> même URL");
  assert.deepEqual(await images(ids.b2), [b1[0], GIF], "image non prise en charge laissée telle quelle");
  assert.deepEqual(await images(ids.b3), [LIEN]);
  const photo = (await pool.query("SELECT photo, discord_avatar FROM membres WHERE id = $1", [ids.m1])).rows[0];
  assert.ok(photo.photo.startsWith(`${faux.base}/view/`));
  assert.equal(photo.discord_avatar, "https://cdn.discordapp.com/a.png");

  const maj = (await pool.query("SELECT maj FROM biens ORDER BY id")).rows.map((r) => r.maj);
  assert.deepEqual(maj, ["2026-02-01 10:00:00", "2026-02-02 10:00:00", "2026-02-03 10:00:00"], "ordre d'affichage public préservé");

  // PHOTO_A (2 annonces) et PHOTO_B (annonce + profil, clés distinctes biens/profils) : 3 objets distants.
  assert.equal(faux.objets.size, 3);
  const medias = (await pool.query("SELECT cle, statut, origine FROM medias ORDER BY cle")).rows;
  assert.ok(medias.every((m) => m.statut === "attache" && m.origine === "migration"));
  assert.ok(medias.every((m) => /^dynasty8\/(biens|profils)\/migration\/[0-9a-f]{64}\.(jpg|png)$/.test(m.cle)));
  const sauvegardes = (await pool.query("SELECT table_cible, ligne_id, position, ancienne_valeur FROM medias_migration_sauvegarde ORDER BY id")).rows;
  assert.equal(sauvegardes.length, 5, "une ligne par position remplacée");
  assert.ok(sauvegardes.some((s) => s.table_cible === "membres" && s.ancienne_valeur === PHOTO_B));

  // Relance : plus rien à faire.
  faux.appels.length = 0;
  const relance = await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  assert.equal(relance.totaux.a_migrer, 0);
  assert.equal(faux.appels.length, 0);
});

it("reprise : un échec distant n'altère rien, la relance termine sans doublon", async () => {
  let puts = 0;
  faux.regles = (a) => (a.methode === "PUT" && ++puts === 2 ? { status: 500, corps: "" } : undefined);
  const premier = await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  assert.equal(premier.totaux.erreurs, 1);
  const enErreur = premier.elements.find((e) => e.resultat === "erreur");
  assert.match(enErreur.erreur, /distant/);
  // L'image en erreur est toujours en base64 à sa place.
  const valeurs = enErreur.table === "biens" ? await images(enErreur.ligne_id) : [];
  if (enErreur.table === "biens") assert.ok(enErreur.positions.every((p) => valeurs[p].startsWith("data:image/")));

  faux.regles = null;
  const second = await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  assert.equal(second.totaux.erreurs, 0);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM biens WHERE strpos(images, 'data:image/jpeg') > 0 OR strpos(images, 'data:image/png') > 0")).rows[0].n, 0);
  assert.equal(faux.objets.size, 3, "aucun objet en double malgré la reprise");
});

it("arrêt immédiat si le jeton est refusé, sans rien remplacer", async () => {
  faux.regles = () => ({ status: 401, corps: JSON.stringify({ error: { code: "invalid_token" } }) });
  const rapport = await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  assert.equal(rapport.interrompu, "auth");
  assert.equal(rapport.totaux.erreurs, 1);
  assert.deepEqual(await images(ids.b1), [PHOTO_A, LIEN, PHOTO_B, PHOTO_A]);
  assert.equal((await pool.query("SELECT statut FROM medias")).rows[0].statut, "echec");
});

it("conflit : annonce modifiée pendant l'envoi -> rien n'est remplacé", async () => {
  faux.regles = (a) => (a.methode === "PUT" ? {
    avant: async () => { await pool.query("UPDATE biens SET images = $1 WHERE id = $2", [JSON.stringify([LIEN]), ids.b1]); },
  } : undefined);
  const rapport = await migrerImagesBase64({ db, client: client(), config, mode: "actif", tables: ["biens"], limite: 1 });
  assert.equal(rapport.totaux.conflits, 1);
  assert.deepEqual(await images(ids.b1), [LIEN]);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias_migration_sauvegarde")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT statut FROM medias")).rows[0].statut, "temporaire", "fichier envoyé laissé au nettoyage différé");
});

it("retour arrière : valeurs d'origine restaurées exactement, copies distantes orphelines puis nettoyées", async () => {
  const original = await instantane();
  await migrerImagesBase64({ db, client: client(), config, mode: "actif" });

  const simulation = await annulerMigration({ db, config, mode: "simulation" });
  assert.equal(simulation.totaux.restaures, 5);
  assert.notDeepEqual(await instantane(), original, "la simulation ne restaure rien");

  const rapport = await annulerMigration({ db, config, mode: "actif" });
  assert.equal(rapport.totaux.restaures, 5);
  assert.deepEqual(await instantane(), original);
  const statuts = (await pool.query("SELECT DISTINCT statut FROM medias")).rows.map((r) => r.statut);
  assert.deepEqual(statuts, ["a_supprimer"]);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias_migration_sauvegarde WHERE annule_le IS NULL")).rows[0].n, 0);

  // Deuxième annulation : rien à refaire.
  assert.equal((await annulerMigration({ db, config, mode: "actif" })).totaux.restaures, 0);

  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00'");
  await nettoyerMedias({ db, client: client(), mode: "actif", delaiSecondes: 86400 });
  assert.equal(faux.objets.size, 0);
});

it("retour arrière : une valeur modifiée depuis la migration n'est pas écrasée", async () => {
  await migrerImagesBase64({ db, client: client(), config, mode: "actif" });
  await pool.query("UPDATE biens SET images = $1 WHERE id = $2", [JSON.stringify(["https://exemple.fr/nouvelle.jpg"]), ids.b2]);
  const rapport = await annulerMigration({ db, config, mode: "actif" });
  assert.deepEqual(await images(ids.b2), ["https://exemple.fr/nouvelle.jpg"]);
  assert.equal(rapport.elements.find((e) => e.ligne_id === ids.b2 && e.table === "biens").deja_modifies, 1);
  assert.deepEqual(await images(ids.b1), [PHOTO_A, LIEN, PHOTO_B, PHOTO_A]);
});
