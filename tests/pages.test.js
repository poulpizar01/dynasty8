// Pages HTML servies avec la configuration du serveur (src/pages.js) : aucune
// adresse n'est écrite dans les pages ; celle du site et l'hôte du SDK de
// l'ordinateur en jeu viennent du .env (ou, pour le site, de la requête).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { origineDuSite, origineReglee, preparerPage, lirePage } from "../src/pages.js";
import { RACINE } from "./aide-medias.js";

const PUBLIC = path.join(RACINE, "public");

test("adresse du site : SITE_URL_PUBLIQUE d'abord, sinon celle de la requête, jamais un hôte douteux", () => {
  assert.equal(origineDuSite({ siteUrlPublique: "https://exemple.fr/chemin", protocole: "http", hote: "1.2.3.4" }), "https://exemple.fr");
  assert.equal(origineDuSite({ siteUrlPublique: "", protocole: "http", hote: "51.0.0.1:8080" }), "http://51.0.0.1:8080");
  assert.equal(origineDuSite({ siteUrlPublique: "pas une url", protocole: "https", hote: "site.exemple.fr" }), "https://site.exemple.fr");
  assert.equal(origineDuSite({ protocole: "https", hote: 'evil.fr"><script>' }), "", "un en-tête Host forgé n'entre pas dans la page");
  assert.equal(origineDuSite({ protocole: "javascript", hote: "site.fr" }), "");
  assert.equal(origineReglee("ftp://exemple.fr"), "");
});

test("préparation d'une page : adresse remplacée, balise FolkOS ajoutée, valeurs échappées", () => {
  const html = `<!DOCTYPE html><html><head><meta property="og:image" content="%ORIGINE_SITE%/img/og-image.jpg"></head><body></body></html>`;
  const page = preparerPage(html, { origineSite: "https://site.exemple.fr", folkosOrigine: "https://jeu.exemple.fr" });
  assert.match(page, /content="https:\/\/site\.exemple\.fr\/img\/og-image\.jpg"/);
  assert.match(page, /<head>\n<meta name="d8-folkos" content="https:\/\/jeu\.exemple\.fr">/);
  const sansConfig = preparerPage(html, { origineSite: "", folkosOrigine: "" });
  assert.match(sansConfig, /<meta name="d8-folkos" content="">/);
  assert.ok(!sansConfig.includes("%ORIGINE_SITE%"));
  assert.ok(preparerPage(html, { origineSite: 'x"><b>', folkosOrigine: "" }).includes("x&quot;&gt;&lt;b&gt;"));
});

test("lecture des pages : seulement les fichiers .html de public/, jamais au-dessus", async () => {
  assert.ok((await lirePage(PUBLIC, "/")).includes("<head"), "/ sert index.html");
  assert.ok(await lirePage(PUBLIC, "/accueil.html"));
  assert.equal(await lirePage(PUBLIC, "/../package.json"), null);
  assert.equal(await lirePage(PUBLIC, "/%2e%2e/server.js"), null);
  assert.equal(await lirePage(PUBLIC, "/style.css"), null);
  assert.equal(await lirePage(PUBLIC, "/existe-pas.html"), null);
});

test("aucune adresse du site ni de l'ordinateur en jeu écrite dans public/", () => {
  const interdits = /dynasty8\.fbfa\.fr|computer\.game\.fbfa\.fr/;
  for (const f of fs.readdirSync(PUBLIC).filter((n) => /\.(html|js)$/.test(n))) {
    assert.ok(!interdits.test(fs.readFileSync(path.join(PUBLIC, f), "utf8")), `adresse écrite en dur dans public/${f}`);
  }
});

test("SESSION_SECRET : refusé s'il est absent, trop court ou laissé à la valeur d'exemple", async () => {
  const { secretSessionValide } = await import("../src/verifications.js");
  assert.equal(secretSessionValide(""), false);
  assert.equal(secretSessionValide("court"), false);
  assert.equal(secretSessionValide("remplacer_par_une_valeur_aleatoire_longue"), false);
  assert.equal(secretSessionValide("secret-local-de-dev"), true, "le secret de dev local reste accepté");
  assert.equal(secretSessionValide("k3Jx9PqL2vWm8RtY5nZc4HbF7gDs1AeQ"), true);
});
