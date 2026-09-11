// ============================================================================
// Migration des anciennes photos base64 vers storage.fbfa.fr — SCRIPT MANUEL
// ----------------------------------------------------------------------------
// Jamais lancé par server.js. N'écrit RIEN (ni en base, ni sur le stockage)
// tant que --apply n'est pas passé. Logique détaillée : src/migration-medias.js.
//
// Usage (depuis la racine du projet, ou dans le conteneur :
//        docker compose exec app node scripts/migrer-images-fbfa.js …) :
//   node scripts/migrer-images-fbfa.js                       simulation (inventaire + rapport)
//   node scripts/migrer-images-fbfa.js --apply               migration réelle (relançable : reprend où elle s'est arrêtée)
//   node scripts/migrer-images-fbfa.js --annuler             simulation du retour arrière
//   node scripts/migrer-images-fbfa.js --annuler --apply     retour arrière réel
// Options :
//   --table biens|membres    une seule table (défaut : les deux)
//   --limite N               traite au plus N images (essai progressif)
//   --rapport chemin.json    fichier du compte rendu (défaut : rapports/…)
//
// AVANT --apply : faire une sauvegarde complète de la base (pg_dump, voir
// deploy/*/README). Les anciennes valeurs sont en plus conservées dans la
// table medias_migration_sauvegarde, utilisée par --annuler.
// Variables : DATABASE_URL, FBFA_STORAGE_TOKEN (pour --apply), et les
// réglages FBFA_* optionnels (préfixe, délai…).
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import { lireConfigMedias, creerClientDepuisConfig } from "../src/medias.js";
import { migrerImagesBase64, annulerMigration } from "../src/migration-medias.js";

const args = process.argv.slice(2);
const APPLIQUER = args.includes("--apply");
const ANNULER = args.includes("--annuler");
function option(nom) {
  const i = args.indexOf(nom);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas définie.");
  const table = option("--table");
  if (table && !["biens", "membres"].includes(table)) throw new Error("--table doit valoir biens ou membres.");
  const limite = option("--limite") ? Number(option("--limite")) : 0;
  if (!Number.isInteger(limite) || limite < 0) throw new Error("--limite doit être un entier positif.");

  const config = lireConfigMedias(process.env);
  if (APPLIQUER && !ANNULER && !config.token) throw new Error("FBFA_STORAGE_TOKEN est requis pour --apply.");

  const pool = creerPool(process.env.DATABASE_URL);
  const db = creerAdaptateurDB();
  const mode = APPLIQUER ? "actif" : "simulation";
  try {
    const rapport = ANNULER
      ? await annulerMigration({ db, config, mode, limite })
      : await migrerImagesBase64({
          db,
          client: creerClientDepuisConfig(config),
          config,
          mode,
          tables: table ? [table] : ["biens", "membres"],
          limite,
        });

    const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const fichier = option("--rapport") || path.join("rapports", `${ANNULER ? "annulation" : "migration"}-medias-${mode}-${horodatage}.json`);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, JSON.stringify(rapport, null, 2));

    console.log(`${ANNULER ? "Retour arrière" : "Migration"} — mode ${mode}${mode === "simulation" ? " (aucune écriture)" : ""}`);
    console.log(JSON.stringify(rapport.totaux, null, 2));
    if (rapport.interrompu) console.log(`Arrêt anticipé : ${rapport.interrompu} (voir le rapport).`);
    console.log(`Compte rendu complet : ${fichier}`);
    if (rapport.interrompu || (rapport.totaux.erreurs || 0) > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("ÉCHEC :", (e && e.message) || e);
  process.exitCode = 1;
});
