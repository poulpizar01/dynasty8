// Paramètres → Apparence (src/apparence.js) : images de la marque remplacées
// par la Direction, envoyées sur le stockage externe, relayées à la même
// adresse que l'image livrée, et rétablies à l'identique. La partie « vraie
// base » est ignorée sans TEST_DATABASE_URL.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { IMAGES_MARQUE, FICHIERS_MARQUE, imageMarque } from "../src/apparence.js";
import { nettoyerMedias } from "../src/medias.js";
import { analyserImage } from "../src/images.js";
import {
  creerBaseDeTest, cookieSession, SECRET_TEST, RACINE, demarrerFauxFbfa, pngValide, jpegMinimal,
} from "./aide-medias.js";

// ---- sans base ------------------------------------------------------------------

test("chaque image de la marque correspond à un fichier livré, aux dimensions annoncées", () => {
  for (const d of IMAGES_MARQUE) {
    const fichier = path.join(RACINE, "public", d.fichier);
    assert.ok(fs.existsSync(fichier), `${d.fichier} absent`);
    const a = analyserImage(new Uint8Array(fs.readFileSync(fichier)));
    assert.equal(`${a.largeur}x${a.hauteur}`, `${d.largeur}x${d.hauteur}`, d.fichier);
  }
});

test("server.js relaie les images réglées AVANT de servir les fichiers livrés", () => {
  const source = fs.readFileSync(path.join(RACINE, "server.js"), "utf8");
  const relais = source.indexOf("app.get(FICHIERS_MARQUE");
  assert.ok(relais > 0, "relais des images de la marque absent");
  assert.ok(relais < source.indexOf("app.use(express.static"), "le fichier livré masquerait l'image réglée");
});

// Fausse base : une seule requête possible, la liste des images réglées.
function fausseBase(lignes) {
  return { prepare: () => ({ all: async () => ({ results: lignes }) }) };
}

test("relais : image d'origine servie si rien n'est réglé, si le stockage échoue ou si ce n'est pas une image", async () => {
  const env = { FBFA_STORAGE_BASE: "https://cdn.test" };
  const png = pngValide(3, 3);
  const ok = async () => new Response(png, { status: 200 });
  assert.equal(await imageMarque({ db: fausseBase([]), env, chemin: "/img/logo-full.png", fetchImpl: ok }), null);
  assert.equal(await imageMarque({ db: fausseBase([]), env, chemin: "/img/autre.png", fetchImpl: ok }), null);

  const ligne = (url) => fausseBase([{ cle: "embleme", url, media_id: 7 }]);
  const echec = async () => new Response("", { status: 503 });
  assert.equal(await imageMarque({ db: ligne("https://cdn.test/view/a"), env, chemin: "/img/logo-mark.png", fetchImpl: echec }), null);
  const texte = async () => new Response("<html>pas une image</html>", { status: 200 });
  assert.equal(await imageMarque({ db: ligne("https://cdn.test/view/b"), env, chemin: "/img/logo-mark.png", fetchImpl: texte }), null);
  assert.equal(await imageMarque({ db: ligne("https://autre.test/view/c"), env, chemin: "/img/logo-mark.png", fetchImpl: ok }), null, "jamais hors du stockage configuré");
  assert.equal(await imageMarque({ db: ligne("https://cdn.test/view/c"), chemin: "/img/logo-mark.png", fetchImpl: ok }), null, "stockage non configuré");

  let appels = 0;
  const compte = async () => { appels++; return new Response(png, { status: 200 }); };
  const image = await imageMarque({ db: ligne("https://cdn.test/view/d"), env, chemin: "/img/logo-mark.png", fetchImpl: compte });
  assert.equal(image.mime, "image/png");
  assert.deepEqual([...image.octets], [...png]);
  await imageMarque({ db: ligne("https://cdn.test/view/d"), env, chemin: "/img/logo-mark.png", fetchImpl: compte });
  assert.equal(appels, 1, "les octets sont gardés en mémoire, pas relus à chaque visite");
});

// ---- sur une vraie base --------------------------------------------------------

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);
let base;
let pool;
let faux;
let env;
const membres = {};

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("apparence");
  pool = creerPool(base.url);
  faux = await demarrerFauxFbfa();
  env = {
    DB: creerAdaptateurDB(), SESSION_SECRET: SECRET_TEST,
    FBFA_STORAGE_TOKEN: faux.jeton, FBFA_STORAGE_BASE: faux.base, FBFA_STORAGE_DELAI_MS: "1000",
  };
  for (const [cle, grade] of [["patron", "Patron"], ["drh", "DRH"], ["agent", "Agent"]]) {
    membres[cle] = (await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide') RETURNING id, pseudo, grade`,
      [`Compte ${grade}`, grade]
    )).rows[0];
  }
});

after(async () => {
  if (!ACTIF) return;
  await faux.arreter();
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  faux.reinitialiser();
  await pool.query("TRUNCATE apparence_images, medias_references, medias RESTART IDENTITY CASCADE");
});

async function api(methode, chemin, { qui, octets, type = "image/png", envSup } = {}) {
  const headers = { Cookie: cookieSession(membres[qui]) };
  if (octets) headers["Content-Type"] = type;
  const r = await worker.fetch(new Request("http://local" + chemin, { method: methode, headers, body: octets }), { ...env, ...envSup });
  return { status: r.status, corps: await r.json().catch(() => null) };
}

// Le faux stockage ne renvoie rien sur /view/{id} : on relit l'objet envoyé.
const lireFaux = async (url) => {
  const id = new URL(url).pathname.split("/").pop();
  const objet = [...faux.objets.values()].find((o) => o.id === id);
  return objet ? new Response(objet.octets, { status: 200 }) : new Response("", { status: 404 });
};
const servie = (chemin) => imageMarque({ db: env.DB, env, chemin, fetchImpl: lireFaux });
const ligneMedia = async (id) => (await pool.query("SELECT usage, statut FROM medias WHERE id = $1", [id])).rows[0];
const ligneApparence = async (cle) => (await pool.query("SELECT * FROM apparence_images WHERE cle = $1", [cle])).rows[0];

it("réservé à la Direction", async () => {
  assert.equal((await api("GET", "/api/apparence", { qui: "agent" })).status, 403);
  assert.equal((await api("POST", "/api/apparence/image?cle=logo", { qui: "agent", octets: pngValide() })).status, 403);
  assert.equal((await api("DELETE", "/api/apparence/image?cle=logo", { qui: "agent" })).status, 403);
  assert.equal(faux.appels.length, 0);
  const lu = await api("GET", "/api/apparence", { qui: "drh" });
  assert.equal(lu.status, 200, "DRH fait partie de la Direction");
  assert.deepEqual(lu.corps.images.map((i) => i.cle), IMAGES_MARQUE.map((d) => d.cle));
  assert.ok(lu.corps.images.every((i) => !i.personnalisee));
});

it("remplacer : PNG envoyé tel quel au stockage, seule l'URL est en base, l'adresse du site sert la nouvelle image", async () => {
  const png = pngValide(4, 4);
  const r = await api("POST", "/api/apparence/image?cle=icone", { qui: "patron", octets: png });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.avertissement, null, "icône carrée : mêmes proportions");
  assert.equal(r.corps.images.find((i) => i.cle === "icone").personnalisee, true);

  const envoye = [...faux.objets.values()][0];
  assert.equal(envoye.mime, "image/png", "aucune conversion en JPEG");
  assert.deepEqual([...envoye.octets], [...png]);

  const ligne = await ligneApparence("icone");
  assert.match(ligne.url, /\/view\/obj1$/);
  assert.equal(ligne.maj_par, "Compte Patron");
  assert.deepEqual(await ligneMedia(ligne.media_id), { usage: "apparence", statut: "attache" });

  const image = await servie("/img/favicon-32.png");
  assert.deepEqual([...image.octets], [...png]);
  assert.equal(await servie("/img/logo-full.png"), null, "les autres images restent celles d'origine");
});

it("proportions différentes : enregistrée, avec un avertissement", async () => {
  const r = await api("POST", "/api/apparence/image?cle=logo", { qui: "patron", octets: pngValide(2, 2) });
  assert.equal(r.status, 200);
  assert.match(r.corps.avertissement, /917 × 507/);
});

it("remplacer puis rétablir : l'ancienne image part en suppression différée, l'origine revient", async () => {
  await api("POST", "/api/apparence/image?cle=partage", { qui: "patron", octets: jpegMinimal(12, 6), type: "image/jpeg" });
  const premier = (await ligneApparence("partage")).media_id;
  await api("POST", "/api/apparence/image?cle=partage", { qui: "patron", octets: jpegMinimal(24, 12), type: "image/jpeg" });
  const second = (await ligneApparence("partage")).media_id;
  assert.notEqual(premier, second);
  assert.equal((await ligneMedia(premier)).statut, "a_supprimer");
  assert.equal((await ligneMedia(second)).statut, "attache");

  const r = await api("DELETE", "/api/apparence/image?cle=partage", { qui: "patron" });
  assert.equal(r.status, 200);
  assert.equal(await ligneApparence("partage"), undefined);
  assert.equal((await ligneMedia(second)).statut, "a_supprimer");
  assert.equal(await servie("/img/og-image.jpg"), null, "image livrée servie à nouveau");
  assert.ok(!faux.appels.some((a) => a.methode === "DELETE"), "rien n'est supprimé du stockage avant le délai de grâce");
});

it("une image de la marque en service n'est jamais vue comme un import abandonné", async () => {
  await api("POST", "/api/apparence/image?cle=embleme", { qui: "patron", octets: pngValide(8, 3) });
  await pool.query("UPDATE medias SET maj = '2020-01-01 00:00:00', envoye_le = '2020-01-01 00:00:00'");
  const rapport = await nettoyerMedias({ db: env.DB, client: null, mode: "simulation", delaiSecondes: 3600 });
  assert.deepEqual(rapport.abandonnes, []);
  assert.deepEqual(rapport.suppressions, []);
});

it("refus : image inconnue, faux fichier, stockage non configuré", async () => {
  assert.equal((await api("POST", "/api/apparence/image?cle=banniere", { qui: "patron", octets: pngValide() })).status, 400);
  const faux_png = new TextEncoder().encode("<svg onload=alert(1)>");
  assert.equal((await api("POST", "/api/apparence/image?cle=logo", { qui: "patron", octets: faux_png })).status, 400);
  assert.equal((await api("POST", "/api/apparence/image?cle=logo", { qui: "patron", octets: pngValide(), type: "image/svg+xml" })).status, 415);

  const sansStockage = { FBFA_STORAGE_TOKEN: "" };
  assert.equal((await api("POST", "/api/apparence/image?cle=logo", { qui: "patron", octets: pngValide(), envSup: sansStockage })).status, 503);
  const lu = await api("GET", "/api/apparence", { qui: "patron", envSup: sansStockage });
  assert.equal(lu.corps.stockage_configure, false);
  assert.equal(await pool.query("SELECT 1 FROM apparence_images").then((r) => r.rowCount), 0);
});

test("les fichiers relayés sont bien les adresses utilisées par les pages", () => {
  const pages = ["public/index.html", "public/admin.html", "public/layout.js", "public/accueil.html"]
    .map((f) => fs.readFileSync(path.join(RACINE, f), "utf8")).join("\n");
  for (const f of FICHIERS_MARQUE) assert.ok(pages.includes(f), `${f} n'est utilisé nulle part`);
});
