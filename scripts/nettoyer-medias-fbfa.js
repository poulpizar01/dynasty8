// ============================================================================
// Nettoyage des médias FBFA — SCRIPT MANUEL
// ----------------------------------------------------------------------------
// Même traitement que la tâche horaire de server.js (nettoyerMedias() dans
// src/medias.js), lancé à la demande avec un compte rendu détaillé.
// N'écrit rien et n'appelle pas le stockage tant que --apply n'est pas passé.
//
//   node scripts/nettoyer-medias-fbfa.js              simulation : liste ce qui serait supprimé
//   node scripts/nettoyer-medias-fbfa.js --apply      applique (suppressions distantes par clé)
//   Option : --limite N (défaut 100 médias par étape)
//
// Seuls les médias suivis dans la table medias sont concernés : jamais une
// URL simplement présente dans une annonce ou un profil.
// ============================================================================

import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import { lireConfigMedias, creerClientDepuisConfig, nettoyerMedias, etatMedias } from "../src/medias.js";

const args = process.argv.slice(2);
const APPLIQUER = args.includes("--apply");
const iLimite = args.indexOf("--limite");
const limite = iLimite !== -1 ? Number(args[iLimite + 1]) : 100;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas définie.");
  if (!Number.isInteger(limite) || limite <= 0) throw new Error("--limite doit être un entier positif.");
  const config = lireConfigMedias(process.env);
  if (APPLIQUER && !config.token) throw new Error("FBFA_STORAGE_TOKEN est requis pour --apply.");

  const pool = creerPool(process.env.DATABASE_URL);
  const db = creerAdaptateurDB();
  try {
    const rapport = await nettoyerMedias({
      db,
      client: creerClientDepuisConfig(config),
      mode: APPLIQUER ? "actif" : "simulation",
      delaiSecondes: config.delaiNettoyageHeures * 3600,
      limite,
    });
    console.log(JSON.stringify({ rapport, etat: await etatMedias(db) }, null, 2));
    if (rapport.interrompu || rapport.erreurs.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("ÉCHEC :", (e && e.message) || e);
  process.exitCode = 1;
});
