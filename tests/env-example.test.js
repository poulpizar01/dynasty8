// Les trois modèles deploy/*/.env.example documentent TOUTES les variables
// que le serveur lit : un nouveau réglage oublié dans un modèle fait échouer
// ce test. Ils ne contiennent aucun secret pré-rempli.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RACINE } from "./aide-medias.js";

const MODELES = ["deploy/vps/.env.example", "deploy/operateur/.env.example", "deploy/systemd/.env.example"];

// Variables imposées par le déploiement lui-même (Dockerfile, compose, unité
// systemd), pas par le .env.
const IMPOSEES = new Set(["PORT", "NODE_ENV", "DB_SCHEMA_AUTO", "HOST"]);
// Lues seulement une fois au démarrage pour reprendre d'anciens réglages.
const ANCIENNES = new Set(["WEBMAP_ORIGIN", "GOOGLE_SHEET_ID", "GOOGLE_SHEET_GID"]);

function variablesLues() {
  const fichiers = ["server.js", ...fs.readdirSync(path.join(RACINE, "src")).map((f) => path.join("src", f))];
  const noms = new Set(["API_TAILLE_CORPS_MAX"]); // lue via l'objet process.env passé à src/corps-requete.js
  for (const f of fichiers) {
    const contenu = fs.readFileSync(path.join(RACINE, f), "utf8");
    for (const m of contenu.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) noms.add(m[1]);
  }
  return [...noms].filter((n) => !IMPOSEES.has(n) && !ANCIENNES.has(n)).sort();
}

test("chaque variable lue par le serveur est documentée dans les trois modèles", () => {
  const lues = variablesLues();
  assert.ok(lues.includes("SESSION_SECRET") && lues.includes("FBFA_STORAGE_BASE"));
  for (const modele of MODELES) {
    const contenu = fs.readFileSync(path.join(RACINE, modele), "utf8");
    // Docker construit DATABASE_URL dans le compose, à partir des comptes PostgreSQL.
    const attendues = modele.includes("systemd") ? lues : lues.filter((n) => n !== "DATABASE_URL");
    const absentes = attendues.filter((n) => !new RegExp(`^#?\\s*${n}=`, "m").test(contenu));
    assert.deepEqual(absentes, [], `${modele} : variables non documentées`);
  }
});

test("aucun secret pré-rempli dans les modèles", () => {
  for (const modele of MODELES) {
    const contenu = fs.readFileSync(path.join(RACINE, modele), "utf8");
    for (const cle of ["SESSION_SECRET", "POSTGRES_PASSWORD", "APP_DB_PASSWORD", "DISCORD_CLIENT_SECRET", "FBFA_STORAGE_TOKEN", "STATS_BOT_SECRET", "RECRUTEMENT_WEBHOOK_SECRET"]) {
      const ligne = contenu.split(/\r?\n/).find((l) => l.startsWith(cle + "="));
      if (ligne) assert.equal(ligne, cle + "=", `${modele} : ${cle} doit rester vide`);
    }
  }
});
