// ============================================================================
// Point d'entrée Node.js (Express + PostgreSQL)
// ----------------------------------------------------------------------------
// Sert les fichiers du dossier /public et transmet les adresses /api/* au
// code de src/index.js, écrit en "standard web" (Request/Response).
// ============================================================================

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "./src/index.js";
import { creerPool, creerAdaptateurDB } from "./src/db-pg.js";
import { synchroniserSheetSansErreur } from "./src/google-sheets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Le site tourne toujours derrière un reverse proxy (Caddy sur le VPS, ou le
// proxy de l'opérateur FlashbackFA) qui termine le HTTPS : on lui fait
// confiance pour X-Forwarded-Proto / X-Forwarded-For, sinon req.protocol vaut
// "http" et l'URL reconstruite pour /api (redirections OAuth, cookies Secure)
// est fausse.
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

// ---- Autoriser l'affichage du site dans l'ordinateur en jeu (FolkOS / FiveM) ----
// Le navigateur embarqué de FiveM vérifie chaque « ancêtre » de l'iframe via
// frame-ancestors : s'il en manque un, la page reste blanche sans message.
// Vrai en-tête HTTP sur TOUTES les réponses (une balise <meta> serait ignorée),
// et surtout jamais de X-Frame-Options (il contredirait cette règle).
const CSP_FRAME_ANCESTORS =
  "frame-ancestors 'self' https://*.fbfa.fr https://fbfa.fr https://cfx-nui-external-iframe nui://game nui:";
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP_FRAME_ANCESTORS);
  res.removeHeader("X-Frame-Options");
  next();
});

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL n'est pas définie — vérifie le fichier .env (deploy/vps ou deploy/operateur).");
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

// Amorçage du tout premier compte Direction : si AUCUN compte Direction
// "valide" n'existe encore dans la base (cas d'un site tout juste installé),
// la toute première demande de connexion en attente est automatiquement
// validée et promue "Patron". Dès qu'un compte Direction existe, cette
// fonction ne fait plus jamais rien — elle ne sert qu'à débloquer le tout
// premier démarrage, sans quoi personne ne pourrait jamais rien valider.
const GRADES_DIRECTION = ["Développeur web", "Patron", "Co Patron", "Manager", "DRH", "Secrétaire de Direction"];
async function amorcerPremierAdmin() {
  const admin = await pool.query(
    `SELECT id FROM membres WHERE statut = 'valide' AND actif = 1 AND grade = ANY($1) LIMIT 1`,
    [GRADES_DIRECTION]
  );
  if (admin.rows.length) return;

  // Réparation ponctuelle : une version précédente de cette fonction (2 sept.
  // 2026) oubliait de remettre actif = 1 en promouvant le tout premier compte,
  // ce qui laissait le compte "valide" mais affiché comme désactivé. Si c'est
  // le cas ici, on corrige simplement l'oubli plutôt que de recréer un
  // deuxième compte Direction.
  const casse = await pool.query(
    `SELECT id, pseudo FROM membres WHERE statut = 'valide' AND actif = 0 AND grade = ANY($1) LIMIT 1`,
    [GRADES_DIRECTION]
  );
  if (casse.rows.length) {
    const { id, pseudo } = casse.rows[0];
    await pool.query(`UPDATE membres SET actif = 1 WHERE id = $1`, [id]);
    console.log(`Compte Direction "${pseudo}" (id ${id}) réactivé (oubli corrigé de l'amorçage précédent).`);
    return;
  }

  const attente = await pool.query(
    `SELECT id, pseudo FROM membres WHERE statut = 'attente' ORDER BY id ASC LIMIT 1`
  );
  if (!attente.rows.length) return;

  const { id, pseudo } = attente.rows[0];
  await pool.query(`UPDATE membres SET statut = 'valide', actif = 1, grade = 'Patron' WHERE id = $1`, [id]);
  console.log(`Premier compte Direction créé automatiquement : "${pseudo}" (id ${id}), grade "Patron".`);
}

function construireEnv() {
  return {
    DB: adaptateurDB,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
    STATS_BOT_SECRET: process.env.STATS_BOT_SECRET,
    // Transmet le réglage "cookies en HTTP simple" (voir poserCookie() dans
    // src/index.js) -- sans cette ligne, la variable .env COOKIES_HTTP=1 est
    // ignorée : le cookie de connexion reste marqué "Secure" et le navigateur
    // continue de le refuser en HTTP tout court.
    COOKIES_HTTP: process.env.COOKIES_HTTP,
    // SSO FolkOS (« Se connecter IG » depuis l'ordinateur en jeu) — valeurs
    // fournies par l'opérateur, côté serveur uniquement.
    FOLKOS_ID_BASE: process.env.FOLKOS_ID_BASE,
    FOLKOS_CLIENT_ID: process.env.FOLKOS_CLIENT_ID,
    FOLKOS_CLIENT_SECRET: process.env.FOLKOS_CLIENT_SECRET,
    // Stockage externe des photos de biens (storage.fbfa.fr) — voir bienPhotoUpload() dans src/index.js.
    FBFA_STORAGE_TOKEN: process.env.FBFA_STORAGE_TOKEN,
  };
}

// Synchro Google Sheets ("Mon profil") : une fois au démarrage, puis toutes
// les 20 minutes — voir la doc en tête de src/google-sheets.js. N'échoue
// jamais bruyamment (synchroniserSheetSansErreur avale ses erreurs et les
// range dans sync_sheet_etat, lisible dans Paramètres) : un Sheet mal
// configuré ou une coupure réseau ponctuelle ne doit jamais faire planter le
// reste du site.
const INTERVALLE_SYNC_SHEET_MS = 20 * 60 * 1000;
function demarrerSyncSheet() {
  synchroniserSheetSansErreur(construireEnv());
  setInterval(() => synchroniserSheetSansErreur(construireEnv()), INTERVALLE_SYNC_SHEET_MS);
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
      if (cle.toLowerCase() === "x-frame-options" || cle.toLowerCase() === "content-security-policy") continue; // gardés par le middleware FolkOS ci-dessus
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
  .then(() => amorcerPremierAdmin())
  .then(() => demarrerSyncSheet())
  .catch((e) => {
    console.error("Impossible d'appliquer le schéma PostgreSQL au démarrage :", e);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Dynasty 8 en écoute sur le port ${PORT}`);
    });
  });
