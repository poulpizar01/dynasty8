// Le proxy /api/carte existe pour que l'adresse réelle de la WebMap
// n'apparaisse nulle part : ni dans ce que reçoit le navigateur, ni — depuis
// que le dépôt est public — dans les sources. Ces tests verrouillent les deux.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import worker from "../src/index.js";
import { RACINE } from "./aide-medias.js";

const ENV_MINIMAL = { DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }) }, SESSION_SECRET: "x" };

test("sans WebMap réglée, la carte est indisponible — jamais une adresse devinée", async () => {
  const r = await worker.fetch(new Request("https://dynasty8.fbfa.fr/api/carte/"), ENV_MINIMAL);
  assert.equal(r.status, 503);
  const texte = await r.text();
  assert.match(texte, /pas configurée/);
  assert.doesNotMatch(texte, /webmap|http/i, "le message ne laisse filtrer aucune adresse");
});

test("l'ancienne variable WEBMAP_ORIGIN du .env n'est plus lue : seul le réglage du site compte", async () => {
  const r = await worker.fetch(new Request("https://dynasty8.fbfa.fr/api/carte/"), { ...ENV_MINIMAL, WEBMAP_ORIGIN: "https://carte.exemple.fr" });
  assert.equal(r.status, 503);
});

test("aucune adresse de WebMap codée en dur dans le dépôt", () => {
  // Le dépôt étant public, une adresse réintroduite ici annulerait tout
  // l'intérêt du proxy. Ce test la rattrape avant le commit.
  const aExaminer = ["src", "public", "server.js", "README.md"];
  const fautifs = [];
  const parcourir = (relatif) => {
    const absolu = path.join(RACINE, relatif);
    if (fs.statSync(absolu).isDirectory()) {
      for (const entree of fs.readdirSync(absolu)) {
        if (entree === "vendor" || entree === "img") continue;
        parcourir(path.join(relatif, entree));
      }
      return;
    }
    if (!/\.(js|html|md|css)$/.test(relatif)) return;
    const contenu = fs.readFileSync(absolu, "utf8");
    if (/webmap\.[a-z0-9.-]+\.[a-z]{2,}/i.test(contenu)) fautifs.push(relatif);
  };
  aExaminer.forEach(parcourir);
  assert.deepEqual(fautifs, [], "adresse de WebMap trouvée dans : " + fautifs.join(", "));
});

test("cookies de la carte : préfixés wm_, limités à /api/carte, attributs gardés et bien séparés", async () => {
  const { reecrireCookieCarte } = await import("../src/index.js");
  assert.equal(
    reecrireCookieCarte("sid=abc; Path=/; HttpOnly; SameSite=Lax"),
    "wm_sid=abc; HttpOnly; SameSite=Lax; Path=/api/carte",
    "le dernier attribut n'est plus collé à Path="
  );
  assert.equal(reecrireCookieCarte("pref=1; Domain=exemple.fr; Max-Age=60; Secure"), "wm_pref=1; Max-Age=60; Secure; Path=/api/carte");
  assert.equal(reecrireCookieCarte("sans-egal"), null);
});

test("espace agents : la carte est intégrée dans la page, jamais ouverte dans un autre onglet", () => {
  const html = fs.readFileSync(path.join(RACINE, "public/admin.html"), "utf8");
  assert.match(html, /data-onglet="webmap"/);
  assert.ok(html.includes('id="boite-carte-agents"'));
  assert.doesNotMatch(html, /href="\/api\/carte\/"[^>]*target="_blank"/);
});
