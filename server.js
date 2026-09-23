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
import { lireCorpsLimite, limiteCorpsPour, ErreurCorpsTropGros } from "./src/corps-requete.js";
import { lireSchema, appliquerSchema as appliquerSchemaSQL, verifierSchema } from "./src/schema.js";
import { choisirHote } from "./src/entetes-proxy.js";
import { lireConfigMedias, creerClientDepuisConfig, nettoyerMedias } from "./src/medias.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Le site tourne toujours derrière un reverse proxy (nginx sur le VPS comme
// chez l'opérateur FlashbackFA) qui termine le HTTPS : on lui fait
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
  // Un navigateur ne doit jamais « deviner » le type d'un fichier servi : une
  // photo importée interprétée comme du HTML deviendrait une page exécutable.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // L'adresse complète des pages agents (identifiants d'annonce, de membre)
  // ne part pas vers les sites externes ouverts depuis le site.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL n'est pas définie — vérifie le fichier .env (deploy/vps ou deploy/operateur).");
}
const pool = creerPool(process.env.DATABASE_URL);
const adaptateurDB = creerAdaptateurDB();

// Préparation de la base au démarrage.
//
// DB_SCHEMA_AUTO=0 (recommandé, et réglé par les packs de déploiement) :
// l'application tourne avec un compte PostgreSQL restreint (SELECT, INSERT,
// UPDATE, DELETE) et ne crée RIEN. Le schéma est appliqué séparément, avec un
// compte administrateur, par scripts/appliquer-schema.js (service
// « migration » du compose). Le serveur se contente de vérifier que tables et
// colonnes attendues sont là, et refuse de démarrer sinon.
//
// DB_SCHEMA_AUTO=1 (valeur par défaut, comportement historique) : le serveur
// applique lui-même schema.postgres.sql, ce qui exige un compte ayant le
// droit de créer des tables. À n'utiliser qu'en développement local.
class SchemaIncomplet extends Error {}

const SCHEMA_AUTO = !["0", "false", "off", "non"].includes(
  String(process.env.DB_SCHEMA_AUTO ?? "1").trim().toLowerCase()
);

async function preparerBase() {
  const sql = lireSchema();
  if (SCHEMA_AUTO) {
    await appliquerSchemaSQL(pool, sql);
    console.log("Schéma PostgreSQL vérifié/appliqué avec succès (DB_SCHEMA_AUTO=1).");
    return;
  }
  const resultat = await verifierSchema(pool, sql);
  if (!resultat.ok) {
    const manquant = [
      resultat.tablesManquantes.length ? `tables : ${resultat.tablesManquantes.join(", ")}` : "",
      resultat.colonnesManquantes.length ? `colonnes : ${resultat.colonnesManquantes.join(", ")}` : "",
    ].filter(Boolean).join(" ; ");
    throw new SchemaIncomplet(
      `schéma PostgreSQL incomplet (${manquant}) — appliquer la migration avec le compte admin : ` +
      "docker compose run --rm migration (ou node scripts/appliquer-schema.js --apply)"
    );
  }
  console.log("Schéma PostgreSQL vérifié (aucune création : DB_SCHEMA_AUTO=0).");
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
    // Sert à décider si le détail technique des erreurs est renvoyé au
    // navigateur (jamais en production) — voir le catch de src/index.js.
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
    STATS_BOT_SECRET: process.env.STATS_BOT_SECRET,
    // Hotes supplementaires acceptes en ecriture (controle d'origine, voir
    // origineAutorisee() dans src/index.js). Sans cette ligne, la variable du
    // .env est ignoree et seules les requetes venant du site lui-meme passent.
    ORIGINES_AUTORISEES: process.env.ORIGINES_AUTORISEES,
    // Secrets des webhooks du bot Roxwood Network Entreprise (un par
    // abonnement, séparés par des virgules) — voir src/bot-roxwood.js.
    ROXWOOD_WEBHOOK_SECRETS: process.env.ROXWOOD_WEBHOOK_SECRETS,
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
    // Adresse réelle de la WebMap, proxifiée par /api/carte : elle vit dans le
    // .env et jamais dans le code, qui est public.
    WEBMAP_ORIGIN: process.env.WEBMAP_ORIGIN,
    // Stockage externe des photos (storage.fbfa.fr) — voir src/medias.js.
    // Le jeton reste côté serveur : jamais renvoyé au navigateur ni journalisé.
    FBFA_STORAGE_TOKEN: process.env.FBFA_STORAGE_TOKEN,
    FBFA_STORAGE_BASE: process.env.FBFA_STORAGE_BASE,
    FBFA_STORAGE_PREFIXE: process.env.FBFA_STORAGE_PREFIXE,
    FBFA_STORAGE_DELAI_MS: process.env.FBFA_STORAGE_DELAI_MS,
    FBFA_PHOTO_TAILLE_MAX: process.env.FBFA_PHOTO_TAILLE_MAX,
    FBFA_IMPORTS_EN_ATTENTE_MAX: process.env.FBFA_IMPORTS_EN_ATTENTE_MAX,
    FBFA_NETTOYAGE: process.env.FBFA_NETTOYAGE,
    FBFA_NETTOYAGE_DELAI_HEURES: process.env.FBFA_NETTOYAGE_DELAI_HEURES,
  };
}

// Nettoyage différé des photos (imports abandonnés, photos retirées) : voir
// nettoyerMedias() dans src/medias.js. FBFA_NETTOYAGE vaut « simulation » par
// défaut : la tâche journalise ce qu'elle FERAIT, sans rien écrire ni
// supprimer. « actif » applique réellement, « desactive » coupe la tâche.
const INTERVALLE_NETTOYAGE_MEDIAS_MS = 60 * 60 * 1000;
async function nettoyerMediasSansErreur() {
  const env = construireEnv();
  const config = lireConfigMedias(env);
  if (config.modeNettoyage === "desactive") return;
  if (config.modeNettoyage === "actif" && !config.token) {
    console.error("[medias] nettoyage actif demandé mais FBFA_STORAGE_TOKEN absent : passe ignorée.");
    return;
  }
  try {
    const rapport = await nettoyerMedias({
      db: env.DB,
      client: creerClientDepuisConfig(config),
      mode: config.modeNettoyage,
      delaiSecondes: config.delaiNettoyageHeures * 3600,
    });
    const total = rapport.abandonnes.length + rapport.suppressions.length + rapport.reactives.length + rapport.conflits.length + rapport.erreurs.length;
    if (total) {
      console.log(
        `[medias] nettoyage (${rapport.mode}) : ${rapport.abandonnes.length} import(s) abandonné(s), ` +
        `${rapport.suppressions.length} suppression(s)${rapport.mode === "simulation" ? " prévue(s)" : ""}, ` +
        `${rapport.reactives.length} réactivé(s), ${rapport.conflits.length} conflit(s), ${rapport.erreurs.length} erreur(s)` +
        (rapport.interrompu ? ` — interrompu (${rapport.interrompu})` : "")
      );
    }
  } catch (e) {
    console.error("[medias] nettoyage impossible :", (e && e.message) || e);
  }
}
function demarrerNettoyageMedias() {
  nettoyerMediasSansErreur();
  setInterval(nettoyerMediasSansErreur, INTERVALLE_NETTOYAGE_MEDIAS_MS);
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

// Nom d'hôte public du site. Derrière un reverse proxy (nginx chez
// l'opérateur comme sur le VPS), l'en-tête Host peut porter l'adresse
// interne : X-Forwarded-Host, quand le proxy le transmet, donne l'adresse
// réellement demandée par le visiteur — nécessaire pour reconstruire les
// URL d'API (retour OAuth, cookies). N'est pris en compte que si l'on fait
// confiance au proxy (trust proxy), et seulement s'il ressemble à un nom
// d'hôte valide (jamais recopié tel quel dans une URL sinon).
function hotePublic(req) {
  return choisirHote({
    host: req.get("host"),
    xForwardedHost: req.get("x-forwarded-host"),
    confiance: !!app.get("trust proxy"),
  });
}

// ---- /api/* : transmis tel quel au Worker (Request web standard entrant, Response web standard sortant) ----
app.use("/api", async (req, res) => {
  try {
    const url = `${req.protocol}://${hotePublic(req)}${req.originalUrl}`;

    const headers = new Headers();
    for (const [cle, valeur] of Object.entries(req.headers)) {
      if (valeur == null) continue;
      if (Array.isArray(valeur)) valeur.forEach((v) => headers.append(cle, v));
      else headers.set(cle, String(valeur));
    }

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await lireCorpsLimite(req, limiteCorpsPour(new URL(url).pathname, process.env));
      } catch (e) {
        if (!(e instanceof ErreurCorpsTropGros)) throw e;
        // Le reste du corps n'est pas lu : on ferme la connexion après la réponse.
        res.status(413).set("Connection", "close").json({ erreur: "Fichier ou formulaire trop volumineux." });
        return;
      }
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

preparerBase()
  .then(() => amorcerPremierAdmin())
  .then(() => demarrerSyncSheet())
  .then(() => demarrerNettoyageMedias())
  .catch((e) => {
    if (e instanceof SchemaIncomplet) {
      // Sans schéma, l'application ne peut rien servir de correct : on
      // s'arrête avec un message clair plutôt que de créer les tables
      // nous-mêmes (le compte applicatif n'en a volontairement pas le droit).
      console.error("Démarrage refusé :", e.message);
      process.exit(1);
    }
    console.error("Impossible de préparer la base PostgreSQL au démarrage :", e);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Dynasty 8 en écoute sur le port ${PORT}`);
    });
  });
