// ============================================================================
// Schéma PostgreSQL : application (compte admin) et vérification (compte app)
// ----------------------------------------------------------------------------
// Jusqu'ici, le serveur rejouait schema.postgres.sql à CHAQUE démarrage, ce
// qui obligeait le compte utilisé par l'application à pouvoir créer des
// tables (droits d'administration sur la base). Désormais :
//
//   - le schéma est appliqué UNE fois, par scripts/appliquer-schema.js, avec
//     un compte administrateur (service « migration » du compose) ;
//   - l'application démarre avec un compte restreint (SELECT, INSERT, UPDATE,
//     DELETE seulement) et se contente de VÉRIFIER que le schéma attendu est
//     là (verifierSchema) : aucune instruction CREATE n'est exécutée.
//
// La liste des tables et colonnes attendues est déduite du fichier SQL
// lui-même : rien à tenir à jour en double quand le schéma évolue.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CHEMIN_SCHEMA = path.join(RACINE, "schema.postgres.sql");

export function lireSchema(chemin = CHEMIN_SCHEMA) {
  return fs.readFileSync(chemin, "utf8");
}

// Retire les commentaires « -- … » pour ne pas confondre un exemple écrit en
// commentaire avec une vraie instruction.
function sansCommentaires(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

export function tablesAttendues(sql) {
  const noms = new Set();
  const creations = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_]+)/gi;
  for (const m of sansCommentaires(sql).matchAll(creations)) noms.add(m[1].toLowerCase());
  // Les tables explicitement supprimées par le schéma (nettoyages passés) ne
  // sont évidemment pas attendues.
  const suppressions = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_]+)/gi;
  for (const m of sansCommentaires(sql).matchAll(suppressions)) noms.delete(m[1].toLowerCase());
  return [...noms].sort();
}

export function colonnesAttendues(sql) {
  const paires = new Set();
  const ajouts = /ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_]+)/gi;
  for (const m of sansCommentaires(sql).matchAll(ajouts)) paires.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  return [...paires].sort();
}

// Applique le schéma complet (idempotent : tout est écrit en « si ça n'existe
// pas déjà »). Réservé au compte administrateur.
export async function appliquerSchema(executant, sql = lireSchema()) {
  await executant.query(sql);
}

// Vérifie, avec de simples SELECT, que tables et colonnes attendues existent.
// Renvoie { ok, tablesManquantes, colonnesManquantes }.
export async function verifierSchema(executant, sql = lireSchema()) {
  const tables = tablesAttendues(sql);
  const colonnes = colonnesAttendues(sql);

  const presentes = await executant.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])",
    [tables]
  );
  const trouvees = new Set(presentes.rows.map((r) => r.table_name.toLowerCase()));
  const tablesManquantes = tables.filter((t) => !trouvees.has(t));

  const colonnesPresentes = await executant.query(
    `SELECT table_name || '.' || column_name AS paire FROM information_schema.columns
      WHERE table_schema = current_schema() AND (table_name || '.' || column_name) = ANY($1::text[])`,
    [colonnes]
  );
  const trouveesColonnes = new Set(colonnesPresentes.rows.map((r) => r.paire.toLowerCase()));
  const colonnesManquantes = colonnes.filter((c) => !trouveesColonnes.has(c) && !tablesManquantes.includes(c.split(".")[0]));

  return { ok: !tablesManquantes.length && !colonnesManquantes.length, tablesManquantes, colonnesManquantes };
}
