// ============================================================================
// Dynasty 8 — Statistiques : lecture du Google Sheet + cache résilient
// ----------------------------------------------------------------------------
// Le site ne fait AUCUNE écriture dans le Sheet (lecture seule, §2). On
// s'authentifie avec un "compte de service" Google : un compte spécial, pas
// une vraie personne, dont Google Cloud nous donne une clé secrète (un fichier
// JSON) plutôt qu'un mot de passe. Cette clé sert à signer un jeton (JWT) que
// l'on échange contre un jeton d'accès temporaire auprès de Google — tout ceci
// sans aucune librairie externe : Cloudflare Workers fournit nativement
// crypto.subtle (Web Crypto), suffisant pour signer en RS256.
//
// Secrets attendus (jamais dans le dépôt Git — voir wrangler secret put) :
//   GOOGLE_SERVICE_ACCOUNT_JSON  le contenu ENTIER du fichier .json téléchargé
//                                 depuis Google Cloud (compte de service)
//   GOOGLE_SHEET_ID               l'identifiant du Google Sheet (dans son URL)
//   GOOGLE_SHEET_TAB              nom de l'onglet à lire — optionnel, "Logs
//                                 Vente" par défaut si absent
//
// Résilience (§2) : si Google échoue, on sert le DERNIER snapshot connu (table
// stats_cache) avec un indicateur "synchronisationIndisponible" — jamais une
// page vide ou des zéros silencieux. On ne relance un vrai appel à l'API
// Google que si le cache a expiré (TTL configurable, table stats_config) ou
// si "forcer" est demandé (bouton Rafraîchir).
// ============================================================================

import { enc, b64url } from "./util-crypto.js";
import { classifierLignes } from "./stats-calc.js";

const CLE_CACHE = "logs_vente";
const ONGLET_PAR_DEFAUT = "Logs Vente";
const TTL_PAR_DEFAUT_SECONDES = 180; // 3 minutes — au milieu de la fourchette 2-5 min demandée (§2)

function pemVersArrayBuffer(pem) {
  const corps = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(corps);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return octets.buffer;
}

// Échange la clé du compte de service contre un jeton d'accès Google valable
// 1h (on en redemande un à chaque synchronisation : ça ne coûte rien côté
// quota Google Sheets, seul values.get est limité).
async function obtenirJetonAcces(env) {
  const brut = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!brut) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON n'est pas configuré (voir le guide de connexion du Sheet).");
  let compte;
  try {
    compte = JSON.parse(brut);
  } catch (e) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON n'est pas un JSON valide.");
  }
  if (!compte.client_email || !compte.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ne contient pas client_email / private_key attendus.");
  }

  const maintenantSec = Math.floor(Date.now() / 1000);
  const entete = { alg: "RS256", typ: "JWT" };
  const charge = {
    iss: compte.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: maintenantSec,
    exp: maintenantSec + 3600,
  };
  const aSigner = b64url(enc.encode(JSON.stringify(entete))) + "." + b64url(enc.encode(JSON.stringify(charge)));

  const cle = await crypto.subtle.importKey(
    "pkcs8",
    pemVersArrayBuffer(compte.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, enc.encode(aSigner))));
  const jwt = aSigner + "." + signature;

  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok || !donnees.access_token) {
    throw new Error("Authentification Google refusée : " + (donnees.error_description || donnees.error || reponse.status));
  }
  return donnees.access_token;
}

async function lireLignesDepuisGoogle(env) {
  const sheetId = env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID n'est pas configuré (voir le guide de connexion du Sheet).");
  const onglet = env.GOOGLE_SHEET_TAB || ONGLET_PAR_DEFAUT;
  const jeton = await obtenirJetonAcces(env);
  const plage = encodeURIComponent(`${onglet}!A2:P`); // ligne 1 = en-têtes, on les saute (§3)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${plage}`;
  const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new Error("Lecture du Google Sheet refusée : " + (donnees.error?.message || reponse.status));
  }
  return donnees.values || [];
}

async function lireConfig(env, cle, defaut) {
  const r = await env.DB.prepare("SELECT valeur FROM stats_config WHERE cle = ?1").bind(cle).first();
  return r ? r.valeur : defaut;
}

function ilYaSecondes(horodatageSQLite) {
  const iso = String(horodatageSQLite).includes("T") ? horodatageSQLite : String(horodatageSQLite).replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 1000);
}

// Point d'entrée principal : renvoie { lignes, anomalies, recupereLe,
// synchronisationIndisponible, depuisCache, erreur? }. "forcer" court-circuite
// le cache (bouton Rafraîchir). "membreId" trace qui a déclenché la synchro
// dans le journal (null = automatique, cache expiré).
export async function obtenirDonneesStats(env, { forcer = false, membreId = null } = {}) {
  const ttl = Number(await lireConfig(env, "cache_ttl_secondes", String(TTL_PAR_DEFAUT_SECONDES))) || TTL_PAR_DEFAUT_SECONDES;
  const ligneCache = await env.DB.prepare("SELECT * FROM stats_cache WHERE cle = ?1").bind(CLE_CACHE).first();
  const cacheEncoreValide = ligneCache && !forcer && ilYaSecondes(ligneCache.recupere_le) < ttl;

  if (cacheEncoreValide) {
    const donnees = JSON.parse(ligneCache.donnees);
    return {
      ...donnees,
      recupereLe: ligneCache.recupere_le,
      synchronisationIndisponible: !ligneCache.succes,
      depuisCache: true,
    };
  }

  try {
    const lignesBrutes = await lireLignesDepuisGoogle(env);
    const { lignes, anomalies } = classifierLignes(lignesBrutes);
    const donneesJSON = JSON.stringify({ lignes, anomalies });
    await env.DB.prepare(
      `INSERT INTO stats_cache (cle, donnees, nb_lignes, recupere_le, succes, derniere_erreur)
       VALUES (?1, ?2, ?3, datetime('now'), 1, NULL)
       ON CONFLICT(cle) DO UPDATE SET donnees = excluded.donnees, nb_lignes = excluded.nb_lignes,
         recupere_le = excluded.recupere_le, succes = 1, derniere_erreur = NULL`
    ).bind(CLE_CACHE, donneesJSON, lignes.length).run();
    await env.DB.prepare(
      `INSERT INTO stats_journal_sync (succes, nb_lignes, nb_anomalies, declenche_par) VALUES (1, ?1, ?2, ?3)`
    ).bind(lignes.length, anomalies.length, membreId).run();
    return { lignes, anomalies, recupereLe: new Date().toISOString(), synchronisationIndisponible: false, depuisCache: false };
  } catch (e) {
    const messageErreur = String((e && e.message) || e);
    await env.DB.prepare(
      `INSERT INTO stats_journal_sync (succes, nb_lignes, nb_anomalies, erreur, declenche_par) VALUES (0, NULL, NULL, ?1, ?2)`
    ).bind(messageErreur, membreId).run();

    if (ligneCache) {
      await env.DB.prepare("UPDATE stats_cache SET succes = 0, derniere_erreur = ?1 WHERE cle = ?2").bind(messageErreur, CLE_CACHE).run();
      const donnees = JSON.parse(ligneCache.donnees);
      // On sert quand même le dernier snapshot connu : jamais de page vide (§2).
      return { ...donnees, recupereLe: ligneCache.recupere_le, synchronisationIndisponible: true, erreur: messageErreur, depuisCache: true };
    }
    // Aucun snapshot du tout (première synchronisation jamais réussie) : là on
    // ne PEUT pas inventer de données — on remonte une erreur explicite plutôt
    // que d'afficher des zéros qui ressembleraient à de vrais chiffres.
    throw new Error("Impossible de lire le Google Sheet et aucune donnée en cache pour l'instant : " + messageErreur);
  }
}

// Pour l'écran admin (§6.3) : dernier état du cache + les N dernières entrées
// du journal de synchronisation, sans déclencher de nouvelle lecture.
export async function statutSynchronisation(env, limiteJournal = 20) {
  const cache = await env.DB.prepare("SELECT nb_lignes, recupere_le, succes, derniere_erreur FROM stats_cache WHERE cle = ?1").bind(CLE_CACHE).first();
  const journal = await env.DB.prepare(
    `SELECT js.id, js.lance_le, js.succes, js.nb_lignes, js.nb_anomalies, js.erreur, m.pseudo AS declenche_par_pseudo
     FROM stats_journal_sync js LEFT JOIN membres m ON m.id = js.declenche_par
     ORDER BY js.lance_le DESC, js.id DESC LIMIT ?1`
  ).bind(limiteJournal).all();
  return {
    cache: cache
      ? { nbLignes: cache.nb_lignes, recupereLe: cache.recupere_le, succes: !!cache.succes, derniereErreur: cache.derniere_erreur }
      : null,
    journal: (journal.results || []).map((j) => ({
      id: j.id, lanceLe: j.lance_le, succes: !!j.succes, nbLignes: j.nb_lignes,
      nbAnomalies: j.nb_anomalies, erreur: j.erreur, declenchePar: j.declenche_par_pseudo || "Automatique",
    })),
  };
}
