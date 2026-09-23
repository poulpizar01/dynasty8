// Schéma PostgreSQL : analyse du fichier SQL, vérification au démarrage, et
// séparation des droits (compte admin qui migre / compte applicatif restreint).
// Les tests qui ont besoin d'une vraie base sont ignorés sans TEST_DATABASE_URL
// (voir tests/medias-integration.test.js pour la commande Docker).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import pg from "pg";
import { tablesAttendues, colonnesAttendues, verifierSchema, appliquerSchema, lireSchema } from "../src/schema.js";
import { RACINE } from "./aide-medias.js";

const executer = promisify(execFile);
const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);

test("analyse du fichier SQL : tables créées, tables supprimées, colonnes ajoutées", () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS membres (id SERIAL PRIMARY KEY);
    CREATE TABLE biens (id SERIAL PRIMARY KEY);
    -- CREATE TABLE exemple_en_commentaire (id INT);
    DROP TABLE IF EXISTS roxwood_config CASCADE;
    CREATE TABLE IF NOT EXISTS roxwood_config (id INT);
    DROP TABLE IF EXISTS roxwood_config CASCADE;
    ALTER TABLE membres ADD COLUMN IF NOT EXISTS nom_sheet TEXT;
  `;
  assert.deepEqual(tablesAttendues(sql), ["biens", "membres"]);
  assert.deepEqual(colonnesAttendues(sql), ["membres.nom_sheet"]);
});

test("le vrai schéma du projet est analysable et contient les tables connues", () => {
  const tables = tablesAttendues(lireSchema());
  for (const attendue of ["membres", "biens", "medias", "medias_references", "stats_logs_ventes"]) {
    assert.ok(tables.includes(attendue), `table ${attendue} attendue`);
  }
  assert.ok(!tables.includes("roxwood_config"), "les tables supprimées par le schéma ne sont pas attendues");
  // Les colonnes ajoutées après coup (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
  // doivent toutes être vérifiées au démarrage : on contrôle leur présence,
  // sans figer la liste, qui s allonge à chaque évolution du schéma.
  const colonnes = colonnesAttendues(lireSchema());
  for (const attendue of ["membres.nom_sheet", "stats_logs_ventes.event_id", "membres.sessions_invalides_avant"]) {
    assert.ok(colonnes.includes(attendue), `colonne ${attendue} attendue`);
  }
});

let admin;
let nomBase;
let urlBase;

before(async () => {
  if (!ACTIF) return;
  nomBase = `d8_test_schema_${process.pid}`;
  const racine = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await racine.connect();
  await racine.query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  await racine.query(`CREATE DATABASE ${nomBase}`);
  await racine.query("DROP ROLE IF EXISTS d8_test_app");
  await racine.end();
  const u = new URL(process.env.TEST_DATABASE_URL);
  u.pathname = "/" + nomBase;
  urlBase = u.toString();
  admin = new pg.Client({ connectionString: urlBase });
  await admin.connect();
});

after(async () => {
  if (!ACTIF) return;
  await admin.end();
  const racine = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await racine.connect();
  await racine.query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  await racine.query("DROP ROLE IF EXISTS d8_test_app");
  await racine.end();
});

it("base vide : la vérification échoue et liste ce qui manque", async () => {
  const etat = await verifierSchema(admin);
  assert.equal(etat.ok, false);
  assert.ok(etat.tablesManquantes.includes("membres"));
});

it("le script de migration applique le schéma et crée un compte applicatif restreint", async () => {
  const env = { ...process.env, DATABASE_URL_ADMIN: urlBase, APP_DB_USER: "d8_test_app", APP_DB_PASSWORD: "motdepassetest" };
  const { stdout } = await executer("node", [path.join(RACINE, "scripts/appliquer-schema.js"), "--apply", "--exiger-compte-applicatif"], { env });
  const rapport = JSON.parse(stdout);
  assert.equal(rapport.schema_complet, true);
  assert.equal(rapport.compte_applicatif, "créé");
  assert.equal(rapport.droits.peut_creer_des_tables, false);
  assert.deepEqual(rapport.droits.tables_sans_droits_complets, []);
  assert.equal((await verifierSchema(admin)).ok, true);

  // Relance : idempotent.
  const relance = JSON.parse((await executer("node", [path.join(RACINE, "scripts/appliquer-schema.js"), "--apply"], { env })).stdout);
  assert.equal(relance.compte_applicatif, "mis à jour");
  assert.equal(relance.schema_complet, true);
});

it("le compte applicatif peut lire et écrire, mais jamais créer ni supprimer une table", async () => {
  const u = new URL(urlBase);
  u.username = "d8_test_app";
  u.password = "motdepassetest";
  const app = new pg.Client({ connectionString: u.toString() });
  await app.connect();
  try {
    // Lecture/écriture : ce dont le site a besoin (y compris les séquences SERIAL).
    const insere = await app.query(
      "INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut) VALUES ('essai','Patron','x','x',1,'2026-01-01 00:00:00','valide') RETURNING id"
    );
    assert.ok(insere.rows[0].id > 0, "la séquence SERIAL doit être utilisable");
    await app.query("UPDATE membres SET pseudo = 'essai2' WHERE id = $1", [insere.rows[0].id]);
    await app.query("DELETE FROM membres WHERE id = $1", [insere.rows[0].id]);

    // Le schéma est vérifiable avec ce compte (ce que fait le serveur au démarrage).
    assert.equal((await verifierSchema(app)).ok, true);

    // Et aucune modification de structure n'est possible.
    await assert.rejects(() => app.query("CREATE TABLE interdit (id int)"), /permission denied/i);
    await assert.rejects(() => app.query("DROP TABLE membres"), /must be owner|permission denied/i);
    await assert.rejects(() => app.query("ALTER TABLE membres ADD COLUMN interdit TEXT"), /must be owner|permission denied/i);
  } finally {
    await app.end();
  }
});

it("les tables créées plus tard par l'admin restent accessibles au compte applicatif", async () => {
  await appliquerSchema(admin, "CREATE TABLE IF NOT EXISTS essai_nouvelle_table (id SERIAL PRIMARY KEY, valeur TEXT)");
  const u = new URL(urlBase);
  u.username = "d8_test_app";
  u.password = "motdepassetest";
  const app = new pg.Client({ connectionString: u.toString() });
  await app.connect();
  try {
    await app.query("INSERT INTO essai_nouvelle_table (valeur) VALUES ('ok')");
    assert.equal((await app.query("SELECT count(*)::int n FROM essai_nouvelle_table")).rows[0].n, 1);
  } finally {
    await app.end();
    await admin.query("DROP TABLE essai_nouvelle_table");
  }
});
