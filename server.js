// ============================================================================
// Point d'entrée Node.js / Railway
// ----------------------------------------------------------------------------
// Ce fichier remplace, pour l'hébergement Railway, ce que Cloudflare Workers
// faisait tout seul : servir les fichiers du dossier /public, et envoyer
// les adresses /api/* au code de src/index.js (qui n'a lui-même PAS été
// réécrit — il est resté écrit en "standard web" (Request/Response), qui
// fonctionne aussi bien sous Cloudflare Workers que sous Node.js).
// ============================================================================

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "./src/index.js";
import { creerPool, creerAdaptateurDB } from "./src/db-pg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL n'est pas définie — vérifie les variables du service sur Railway.");
}
const pool = creerPool(process.env.DATABASE_URL);
const adaptateurDB = creerAdaptateurDB();

// Applique le schéma (création des tables) au démarrage. Sans danger de le
// relancer à chaque déploiement : tout est écrit en "si ça n'existe pas déjà"
// (CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING) — jamais destructif.
async function appliquerSchema() {
  const chemin = path.join(__dirname, "schema.postgres.sql");
  const sql = fs.readFileSync(chemin, "utf8");
  await pool.query(sql);
  console.log("Schéma PostgreSQL vérifié/appliqué avec succès.");
}

function construireEnv() {
  return {
    DB: adaptateurDB,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
    STATS_BOT_SECRET: process.env.STATS_BOT_SECRET,
  };
}

// ---- /api/* : transmis tel quel au Worker (Request web standard entrant, Response web standard sortant) ----
app.use("/api", async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    const headers = new Headers();
    for (const [cle, valeur] of Object.entries(req.headers)) {
      if (valeur == null) continue;
      if (Array.isArray(valeur)) valeur.forEach((v) => headers.append(cle, v));
      else headers.set(cle, String(valeur));
    }

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const morceaux = [];
      for await (const morceau of req) morceaux.push(morceau);
      body = Buffer.concat(morceaux);
    }

    const requeteWeb = new Request(url, { method: req.method, headers, body });
    const reponse = await worker.fetch(requeteWeb, construireEnv());

    res.status(reponse.status);
    for (const [cle, valeur] of reponse.headers.entries()) {
      if (cle.toLowerCase() === "set-cookie") continue; // géré à part ci-dessous (plusieurs cookies possibles)
      res.setHeader(cle, valeur);
    }
    const cookies = typeof reponse.headers.getSetCookie === "function" ? reponse.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader("Set-Cookie", cookies);

    const tampon = Buffer.from(await reponse.arrayBuffer());
    res.end(tampon);
  } catch (e) {
    console.error("Erreur /api :", e);
    res.status(500).json({ erreur: "Erreur interne", detail: String((e && e.message) || e) });
  }
});

// ---- tout le reste : fichiers statiques du dossier /public ----
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"), (err) => {
    if (err) res.status(404).send("Page introuvable.");
  });
});

appliquerSchema()
  .catch((e) => {
    console.error("Impossible d'appliquer le schéma PostgreSQL au démarrage :", e);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Dynasty 8 (Node/Railway) en écoute sur le port ${PORT}`);
    });
  });
