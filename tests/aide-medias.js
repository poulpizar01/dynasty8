// Outils partagés par les tests des médias (pas un fichier de test en soi :
// le motif tests/*.test.js ne le lance pas).
//   - un faux service storage.fbfa.fr (serveur HTTP local, comportement réglable) ;
//   - de petites images JPEG / PNG / WebP valides ;
//   - un cookie de session signé comme le fait src/index.js ;
//   - une base PostgreSQL de test isolée (TEST_DATABASE_URL).
import http from "node:http";
import zlib from "node:zlib";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.join(ICI, "..");

// ---- images de test ---------------------------------------------------------

// Vraie photo JPEG du site (produite par un logiciel d'image, pas à la main).
export function jpegReel() {
  return new Uint8Array(fs.readFileSync(path.join(RACINE, "public/img/og-image.jpg")));
}

// JPEG minimal structurellement valide (SOI, SOF0, SOS, données, EOI).
export function jpegMinimal(largeur = 4, hauteur = 3) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, hauteur >> 8, hauteur & 0xff, largeur >> 8, largeur & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function blocPng(type, donnees) {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), donnees])));
  return Buffer.concat([tete, donnees, crc]);
}
export function pngValide(largeur = 2, hauteur = 2) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const lignes = Buffer.alloc((largeur * 3 + 1) * hauteur, 0x80);
  for (let y = 0; y < hauteur; y++) lignes[y * (largeur * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocPng("IHDR", ihdr),
    blocPng("IDAT", zlib.deflateSync(lignes)),
    blocPng("IEND", Buffer.alloc(0)),
  ]));
}

// WebP sans perte 1 × 1 (fichier de référence largement diffusé).
export function webpValide() {
  return new Uint8Array(Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64"));
}

export function dataUrl(octets, mime = "image/jpeg") {
  return `data:${mime};base64,${Buffer.from(octets).toString("base64")}`;
}

// ---- session ---------------------------------------------------------------

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const SECRET_TEST = "secret-de-test-uniquement";
export function cookieSession(membre) {
  const charge = b64url(JSON.stringify({ id: membre.id, pseudo: membre.pseudo, grade: membre.grade, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const sig = b64url(createHmac("sha256", SECRET_TEST).update(charge).digest());
  return `d8_session=${charge}.${sig}`;
}

// ---- faux service FBFA -----------------------------------------------------

// `regles` : fonction (appel) -> undefined (comportement normal) ou
// { status, corps, json, attente, bloquer, avant } pour simuler un incident.
export async function demarrerFauxFbfa() {
  const objets = new Map(); // clé -> { id, octets, mime }
  const appels = [];
  let compteur = 0;
  const etat = { regles: null, jetonAttendu: "fbfa_storage_test" };

  const serveur = http.createServer(async (req, res) => {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    const corps = Buffer.concat(morceaux);
    const url = new URL(req.url, "http://local");
    const appel = { methode: req.method, chemin: url.pathname, recherche: url.search, auth: req.headers.authorization || "", type: req.headers["content-type"] || "", taille: corps.length };
    appels.push(appel);
    const origine = `http://127.0.0.1:${serveur.address().port}`;
    const repondre = (status, donnees) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(typeof donnees === "string" ? donnees : JSON.stringify(donnees));
    };

    const regle = etat.regles ? etat.regles(appel) : undefined;
    if (regle) {
      if (regle.bloquer) return; // ne répond jamais
      if (regle.attente) await new Promise((r) => setTimeout(r, regle.attente));
      if (regle.avant) await regle.avant(); // action du test pendant que l'appel est « en vol »
      if (regle.status) return repondre(regle.status, regle.corps ?? "");
    }

    if (url.pathname.startsWith("/view/")) return repondre(200, "");
    if (!appel.auth) return repondre(401, { error: { code: "no_token", message: "Missing Bearer token" } });
    if (appel.auth !== `Bearer ${etat.jetonAttendu}`) return repondre(401, { error: { code: "invalid_token", message: "Invalid token" } });

    if (url.pathname.startsWith("/api/object/")) {
      const cle = decodeURIComponent(url.pathname.slice("/api/object/".length));
      if (req.method === "PUT") {
        const existant = objets.get(cle);
        const id = existant ? existant.id : `obj${++compteur}`;
        objets.set(cle, { id, octets: corps, mime: appel.type });
        const reponse = { id, url: `${origine}/view/${id}`, size: corps.length, mimeType: appel.type };
        return repondre(200, regle && regle.json ? { ...reponse, ...regle.json(reponse) } : reponse);
      }
      const objet = objets.get(cle);
      if (req.method === "GET") {
        if (!objet) return repondre(404, { error: { code: "not_found", message: "Not found" } });
        return repondre(200, regle && regle.json ? regle.json({ id: objet.id }) : { id: objet.id, url: `${origine}/view/${objet.id}`, size: objet.octets.length, mimeType: objet.mime });
      }
      if (req.method === "DELETE") {
        if (!objet) return repondre(404, { error: { code: "not_found", message: "Not found" } });
        objets.delete(cle);
        return repondre(200, { ok: true });
      }
    }
    if (url.pathname === "/api/objects") return repondre(200, { items: [...objets.entries()].map(([k, o]) => ({ id: o.id, url: `${origine}/view/${o.id}`, key: k })), nextCursor: null });
    if (url.pathname === "/api/usage") return repondre(200, { used: 0 });
    return repondre(404, { error: { code: "not_found", message: "Not found" } });
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${serveur.address().port}`,
    jeton: etat.jetonAttendu,
    objets,
    appels,
    set regles(fn) { etat.regles = fn; },
    reinitialiser() { objets.clear(); appels.length = 0; etat.regles = null; },
    arreter: () => new Promise((r) => { serveur.closeAllConnections?.(); serveur.close(r); }),
  };
}

// ---- base de test ----------------------------------------------------------

// Crée une base neuve (nom unique) sur le serveur de TEST_DATABASE_URL et y
// applique schema.postgres.sql. Renvoie son URL et une fonction de suppression.
export async function creerBaseDeTest(suffixe) {
  const urlAdmin = process.env.TEST_DATABASE_URL;
  const nom = `d8_test_${suffixe}_${process.pid}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const admin = new pg.Client({ connectionString: urlAdmin });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${nom}`);
  await admin.query(`CREATE DATABASE ${nom}`);
  await admin.end();
  const u = new URL(urlAdmin);
  u.pathname = "/" + nom;
  const url = u.toString();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(fs.readFileSync(path.join(RACINE, "schema.postgres.sql"), "utf8"));
  // Rejouer le schéma doit rester sans effet (démarrages successifs du serveur).
  await client.query(fs.readFileSync(path.join(RACINE, "schema.postgres.sql"), "utf8"));
  await client.end();
  return {
    url,
    async supprimer() {
      const a = new pg.Client({ connectionString: urlAdmin });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`);
      await a.end();
    },
  };
}
