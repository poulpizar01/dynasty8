// ============================================================================
// Application du schéma PostgreSQL — SCRIPT D'ADMINISTRATION
// ----------------------------------------------------------------------------
// Sépare enfin « migrer la base » (droits d'administration, une fois par
// déploiement) et « faire tourner le site » (compte restreint, sans droit de
// création). Avant, le serveur rejouait schema.postgres.sql à chaque
// démarrage : le compte applicatif devait donc pouvoir créer des tables.
//
// Usage :
//   node scripts/appliquer-schema.js                 vérifie, n'écrit rien
//   node scripts/appliquer-schema.js --apply         applique le schéma et les droits
//   Options : --exiger-compte-applicatif (échoue si APP_DB_USER n'est pas défini)
//
// Variables :
//   DATABASE_URL_ADMIN  connexion du compte administrateur (à défaut : DATABASE_URL)
//   APP_DB_USER         nom du compte applicatif restreint à créer/mettre à jour
//   APP_DB_PASSWORD     son mot de passe (jamais affiché ni journalisé)
//
// Le compte applicatif reçoit SELECT, INSERT, UPDATE, DELETE sur les tables et
// USAGE sur les séquences — jamais CREATE. Relancer ce script après chaque
// mise à jour du schéma, et après une restauration de sauvegarde (pg_restore
// recrée les tables et efface donc les droits accordés).
// ============================================================================

import pg from "pg";
import { lireSchema, appliquerSchema, verifierSchema, tablesAttendues } from "../src/schema.js";

const args = process.argv.slice(2);
const APPLIQUER = args.includes("--apply");
const EXIGER_APP = args.includes("--exiger-compte-applicatif");

const DROITS_TABLES = "SELECT, INSERT, UPDATE, DELETE";
const DROITS_SEQUENCES = "USAGE, SELECT";

// Toutes les instructions de droits sont fabriquées par PostgreSQL lui-même
// (format %I / %L) : aucun nom ni mot de passe n'est concaténé à la main.
async function sql(client, modele, ...valeurs) {
  const r = await client.query(`SELECT format(${modele}) AS s`, valeurs);
  return r.rows[0].s;
}

async function compteApplicatif(client, utilisateur, motDePasse, rapport) {
  const existe = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [utilisateur]);
  const creation = !existe.rowCount;
  if (creation && !motDePasse) {
    // En mode vérification, on se contente de signaler ce qu'il manque.
    if (APPLIQUER) throw new Error("APP_DB_PASSWORD est obligatoire pour créer le compte applicatif.");
    rapport.compte_applicatif = "à créer (APP_DB_PASSWORD requis)";
    return;
  }

  const instructions = [];
  if (creation) {
    instructions.push(await sql(client, "'CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text", utilisateur, motDePasse));
  } else if (motDePasse) {
    instructions.push(await sql(client, "'ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text", utilisateur, motDePasse));
  }
  instructions.push(
    await sql(client, "'GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text", utilisateur),
    await sql(client, "'GRANT USAGE ON SCHEMA public TO %I', $1::text", utilisateur),
    // Jamais de droit de création : c'est tout l'intérêt de ce compte.
    await sql(client, "'REVOKE CREATE ON SCHEMA public FROM %I', $1::text", utilisateur),
    "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
    await sql(client, `'GRANT ${DROITS_TABLES} ON ALL TABLES IN SCHEMA public TO %I', $1::text`, utilisateur),
    await sql(client, `'GRANT ${DROITS_SEQUENCES} ON ALL SEQUENCES IN SCHEMA public TO %I', $1::text`, utilisateur),
    // Tables et séquences créées plus tard par l'admin : droits accordés d'office.
    await sql(client, `'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ${DROITS_TABLES} ON TABLES TO %I', current_user, $1::text`, utilisateur),
    await sql(client, `'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ${DROITS_SEQUENCES} ON SEQUENCES TO %I', current_user, $1::text`, utilisateur)
  );

  if (!APPLIQUER) {
    rapport.compte_applicatif = creation ? "à créer" : "à mettre à jour";
    return;
  }
  for (const instruction of instructions) await client.query(instruction);
  rapport.compte_applicatif = creation ? "créé" : "mis à jour";
}

// Contrôle final : le compte applicatif peut-il lire/écrire, et surtout ne
// peut-il PAS créer de table ?
async function verifierDroits(client, utilisateur, rapport) {
  // En mode vérification, le compte n'existe pas forcément encore.
  const existe = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [utilisateur]);
  if (!existe.rowCount) {
    rapport.droits = { compte_absent: true };
    return;
  }
  const r = await client.query(
    `SELECT
       has_schema_privilege($1::text, 'public', 'CREATE') AS peut_creer,
       has_schema_privilege($1::text, 'public', 'USAGE') AS peut_utiliser`,
    [utilisateur]
  );
  const tables = tablesAttendues(lireSchema());
  const sansDroits = await client.query(
    `SELECT t.nom FROM unnest($2::text[]) AS t(nom)
      WHERE to_regclass('public.' || t.nom) IS NOT NULL
        AND NOT (has_table_privilege($1::text, 'public.' || t.nom, 'SELECT')
                 AND has_table_privilege($1::text, 'public.' || t.nom, 'INSERT')
                 AND has_table_privilege($1::text, 'public.' || t.nom, 'UPDATE')
                 AND has_table_privilege($1::text, 'public.' || t.nom, 'DELETE'))`,
    [utilisateur, tables]
  );
  rapport.droits = {
    peut_creer_des_tables: r.rows[0].peut_creer,
    peut_utiliser_le_schema: r.rows[0].peut_utiliser,
    tables_sans_droits_complets: sansDroits.rows.map((x) => x.nom),
  };
  if (APPLIQUER && r.rows[0].peut_creer) {
    throw new Error(`le compte applicatif « ${utilisateur} » peut encore créer des tables : droits à revoir.`);
  }
}

async function main() {
  const adresse = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!adresse) throw new Error("DATABASE_URL_ADMIN (ou DATABASE_URL) n'est pas définie.");
  const utilisateur = (process.env.APP_DB_USER || "").trim();
  if (EXIGER_APP && !utilisateur) {
    throw new Error("APP_DB_USER n'est pas défini : le site doit tourner avec un compte PostgreSQL restreint (voir .env.example).");
  }

  const client = new pg.Client({ connectionString: adresse, ssl: /sslmode=require/.test(adresse) ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  const rapport = { mode: APPLIQUER ? "application" : "vérification (aucune écriture)" };
  try {
    if (APPLIQUER) {
      await appliquerSchema(client);
      rapport.schema = "appliqué";
    }
    const etat = await verifierSchema(client);
    rapport.schema_complet = etat.ok;
    if (!etat.ok) {
      rapport.tables_manquantes = etat.tablesManquantes;
      rapport.colonnes_manquantes = etat.colonnesManquantes;
    }
    if (utilisateur) {
      await compteApplicatif(client, utilisateur, process.env.APP_DB_PASSWORD || "", rapport);
      await verifierDroits(client, utilisateur, rapport);
    } else {
      rapport.compte_applicatif = "non configuré (APP_DB_USER absent) — le site utilisera le compte admin";
    }
    console.log(JSON.stringify(rapport, null, 2));
    if (APPLIQUER && !etat.ok) throw new Error("schéma toujours incomplet après application.");
    if (!APPLIQUER && !etat.ok) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("ÉCHEC :", (e && e.message) || e);
  process.exitCode = 1;
});
