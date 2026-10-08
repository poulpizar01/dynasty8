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
import {
  synchroniserSheetSansErreur, lireConfigSheet, archiverSemaineSiDue, semaineParis,
} from "./src/google-sheets.js";
import { envAvecReglages, reprendreReglagesDuEnv } from "./src/reglages.js";
import { lireCorpsLimite, limiteCorpsPour, ErreurCorpsTropGros } from "./src/corps-requete.js";
import { lireSchema, appliquerSchema as appliquerSchemaSQL, verifierSchema } from "./src/schema.js";
import { choisirHote } from "./src/entetes-proxy.js";
import { lirePage, preparerPage, origineDuSite, origineReglee } from "./src/pages.js";
import { secretSessionValide, LONGUEUR_MIN_SECRET_SESSION } from "./src/verifications.js";
import { GRADES_DIRECTION } from "./src/grades.js";
import { lireConfigMedias, creerClientDepuisConfig, nettoyerMedias } from "./src/medias.js";
import { FICHIERS_MARQUE, imageMarque } from "./src/apparence.js";
import { lireServices } from "./src/services.js";

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
// Les sources autorisées (hors 'self') viennent du .env, FRAME_ANCESTORS :
// rien n'est écrit en dur. Seuls des jetons sans espace, virgule ni
// point-virgule sont gardés (aucune autre directive ne peut s'y glisser).
const SOURCES_FRAME_ANCESTORS = String(process.env.FRAME_ANCESTORS || "")
  .split(/\s+/)
  .filter((t) => t && /^[^;,'"<>]+$/.test(t));
if (!SOURCES_FRAME_ANCESTORS.length) {
  console.warn("[csp] FRAME_ANCESTORS vide : le site ne s'affichera pas dans l'ordinateur en jeu (FolkOS).");
}
const CSP_FRAME_ANCESTORS = ["frame-ancestors 'self'", ...SOURCES_FRAME_ANCESTORS].join(" ");
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

if (!secretSessionValide(process.env.SESSION_SECRET)) {
  console.error(
    `SESSION_SECRET absent, trop court (${LONGUEUR_MIN_SECRET_SESSION} caractères minimum) ou laissé à la valeur d'exemple : ` +
    "le serveur refuse de démarrer, sinon n'importe qui pourrait fabriquer une session. Générez une valeur longue et aléatoire dans le .env."
  );
  process.exit(1);
}

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
// compte administrateur, par psql (service « migration » du compose, ou à la
// main en installation systemd). Le serveur se contente de vérifier que tables et
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
      "docker compose run --rm migration (installation systemd : voir deploy/systemd/README-SYSTEMD.md)"
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
    // Secret de l'abonnement webhook « Candidatures » du bot Discord
    // (POST /api/rh/bot/candidatures) — voir src/rh.js.
    RECRUTEMENT_WEBHOOK_SECRET: process.env.RECRUTEMENT_WEBHOOK_SECRET,
    // Hotes supplementaires acceptes en ecriture (controle d'origine, voir
    // origineAutorisee() dans src/index.js). Sans cette ligne, la variable du
    // .env est ignoree et seules les requetes venant du site lui-meme passent.
    ORIGINES_AUTORISEES: process.env.ORIGINES_AUTORISEES,
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
    // WebMap, Google Sheets de la synchronisation et document des cohérences
    // ne sont PAS ici : ces liens se règlent dans l'onglet Paramètres (table
    // reglages_site, voir src/reglages.js), jamais dans le .env.
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
    // Jeton du bot Discord Roxwood : lecture du salon des prises et fins de
    // service (src/services.js). Côté serveur uniquement, jamais renvoyé.
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    // Serveur Discord de l'agence : rôles des membres (agenda) et tickets.
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
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
  if (!config.configure) {
    // Sans stockage configuré, aucune photo ne peut avoir été envoyée : rien à
    // nettoyer. On ne le signale que si le nettoyage réel était demandé.
    if (config.modeNettoyage === "actif") {
      console.error("[medias] nettoyage actif demandé mais stockage non configuré (FBFA_STORAGE_TOKEN et FBFA_STORAGE_BASE) : passe ignorée.");
    }
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

// Membres en service : lecture du salon Discord des prises et fins de service
// toutes les minutes (voir src/services.js). Salon réglé dans Paramètres,
// jeton DISCORD_BOT_TOKEN dans le .env ; sans l'un des deux, rien n'est lu.
// L'état (« non réglé », erreur d'accès...) n'est journalisé qu'au changement.
const INTERVALLE_SERVICES_MS = 60 * 1000;
let etatServices = null;
let lectureServicesEnCours = false;
async function passeServices() {
  if (lectureServicesEnCours) return;
  lectureServicesEnCours = true;
  try {
    const r = await lireServices(await envAvecReglages(construireEnv()));
    const resume = r.statut === "erreur" ? `erreur : ${r.erreur}` : r.statut;
    if (resume !== etatServices) {
      console.log(r.statut === "non_regle"
        ? "[services] Salon des services ou DISCORD_BOT_TOKEN non réglé : lecture en attente."
        : `[services] Lecture du salon des services : ${resume}.`);
      etatServices = resume;
    }
  } catch (e) {
    console.error("[services] Passe interrompue :", (e && e.message) || e);
  } finally {
    lectureServicesEnCours = false;
  }
}
function demarrerLectureServices() {
  passeServices();
  setInterval(passeServices, INTERVALLE_SERVICES_MS);
}

// Synchro Google Sheets ("Mon profil") : une fois au démarrage, puis toutes
// les 20 minutes — voir la doc en tête de src/google-sheets.js. N'échoue
// jamais bruyamment (synchroniserSheetSansErreur avale ses erreurs et les
// range dans sync_sheet_etat, lisible dans Paramètres) : un Sheet mal
// configuré ou une coupure réseau ponctuelle ne doit jamais faire planter le
// reste du site.
const INTERVALLE_SYNC_SHEET_MS = 20 * 60 * 1000;
// Le tableur se règle dans l'onglet Paramètres : on relit donc le réglage à chaque passe,
// pour qu'un lien ajouté ou retiré soit pris en compte sans redémarrage. Sans
// tableur réglé, la passe ne fait rien, et on ne le dit dans les journaux
// qu'au changement d'état.
// WebMap, cohérences et Google Sheets se réglaient autrefois dans le .env.
// Si ces variables y sont encore, leur valeur est recopiée une fois dans les
// réglages du site ; elles ne sont ensuite plus jamais lues et peuvent être
// retirées du .env. Un échec ici n'empêche pas le site de démarrer.
async function reprendreAnciennesVariables() {
  try {
    const reprises = await reprendreReglagesDuEnv(construireEnv(), process.env);
    if (reprises.length) {
      console.log(`[reglages] Repris du .env dans l'onglet Paramètres : ${reprises.join(", ")}. Ces lignes peuvent être retirées du .env.`);
    }
  } catch (e) {
    console.error("[reglages] Reprise des anciennes variables du .env impossible :", e);
  }
}

let tableurRegle = null;
async function passeSyncSheet() {
  try {
    const env = await envAvecReglages(construireEnv());
    const regle = !!lireConfigSheet(env);
    if (regle !== tableurRegle) {
      console.log(regle
        ? "[sync-sheet] Tableur réglé : synchronisation toutes les 20 minutes."
        : "[sync-sheet] Aucun tableur réglé dans l'onglet Paramètres : synchronisation en attente.");
      tableurRegle = regle;
    }
    if (regle) await synchroniserSheetSansErreur(env);
  } catch (e) {
    console.error("[sync-sheet] Passe interrompue :", e);
  }
}
function demarrerSyncSheet() {
  passeSyncSheet();
  setInterval(passeSyncSheet, INTERVALLE_SYNC_SHEET_MS);
  setInterval(archiverTableurSansErreur, INTERVALLE_ARCHIVE_TABLEUR_MS);
}

// Archive hebdomadaire des « Chiffres du tableur » : chaque dimanche à 23:59,
// heure de Paris (été comme hiver), une lecture fraîche du tableur puis
// l'archive de la semaine, sous son code (S41-26). Vérifié toutes les 30 s ;
// si le serveur était arrêté à 23:59, l'archive est faite au redémarrage avec
// les derniers chiffres lus dans la semaine (voir archiverSemaineSiDue).
const INTERVALLE_ARCHIVE_TABLEUR_MS = 30 * 1000;
let derniereSemaineArchivee = null;
async function archiverTableurSansErreur() {
  try {
    const env = await envAvecReglages(construireEnv());
    const semaine = semaineParis(new Date());
    const maintenant = Date.now();
    const minuteDArchivage = maintenant >= semaine.fin.getTime() && maintenant - semaine.fin.getTime() < 60_000;
    if (minuteDArchivage && derniereSemaineArchivee !== semaine.code) {
      // Minute de 23:59 : on relit le tableur une dernière fois, pour figer
      // les chiffres à jour (une lecture déjà en cours est simplement attendue).
      await synchroniserSheetSansErreur(env);
    }
    const r = await archiverSemaineSiDue(env);
    if (r.archivee || r.raison === "déjà archivée") derniereSemaineArchivee = r.semaine;
  } catch (e) {
    console.error("[archive-tableur] Échec de l'archivage hebdomadaire :", e);
  }
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

// ---- pages HTML : adresse du site et hôte FolkOS remplis depuis la configuration ----
// (voir src/pages.js : aucune adresse n'est écrite dans les pages).
const RACINE_PUBLIC = path.join(__dirname, "public");
const FOLKOS_SDK_ORIGINE = origineReglee(process.env.FOLKOS_SDK_ORIGINE);
function optionsPage(req) {
  return {
    origineSite: origineDuSite({
      siteUrlPublique: process.env.SITE_URL_PUBLIQUE,
      protocole: req.protocol,
      hote: hotePublic(req),
    }),
    folkosOrigine: FOLKOS_SDK_ORIGINE,
  };
}
app.get(/^\/(?:[^?]*\.html)?$/, async (req, res, next) => {
  try {
    const page = await lirePage(RACINE_PUBLIC, req.path);
    if (page === null) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(preparerPage(page, optionsPage(req)));
  } catch (e) {
    next(e);
  }
});

// ---- images de la marque : celle réglée dans Paramètres → Apparence, sinon
// le fichier livré (voir src/apparence.js). Même adresse dans les deux cas.
app.get(FICHIERS_MARQUE, async (req, res, next) => {
  try {
    const image = await imageMarque({ db: adaptateurDB, env: process.env, chemin: req.path });
    if (!image) return next();
    // Revalidée à chaque affichage (304 si inchangée) : un logo remplacé ou
    // rétabli se voit tout de suite.
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("ETag", image.etag);
    if (req.get("if-none-match") === image.etag) return res.status(304).end();
    res.type(image.mime).send(Buffer.from(image.octets));
  } catch (e) {
    next(e);
  }
});

// ---- tout le reste : fichiers statiques du dossier /public ----
app.use(express.static(RACINE_PUBLIC));

app.use(async (req, res) => {
  const page = await lirePage(RACINE_PUBLIC, "/404.html").catch(() => null);
  if (page === null) return res.status(404).send("Page introuvable.");
  res.status(404).type("html").send(preparerPage(page, optionsPage(req)));
});

preparerBase()
  .then(() => amorcerPremierAdmin())
  .then(() => reprendreAnciennesVariables())
  .then(() => demarrerSyncSheet())
  .then(() => demarrerNettoyageMedias())
  .then(() => demarrerLectureServices())
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
    // HOST (facultatif) : adresse d'écoute. L'unité systemd impose 127.0.0.1
    // (seul nginx est exposé) ; en Docker, le conteneur écoute partout et le
    // port n'est publié que sur la boucle locale de l'hôte.
    const hote = String(process.env.HOST || "").trim() || undefined;
    app.listen(PORT, hote, () => {
      console.log(`Dynasty 8 en écoute sur ${hote || "toutes les interfaces"}, port ${PORT}`);
    });
  });
