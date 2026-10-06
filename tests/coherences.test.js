// Guides de cohérence : un seul contenu (public/coherences-guides.js), affiché
// à l'identique par la page publique et par l'onglet « Cohérences » de
// l'espace agents, sans lien vers un document extérieur côté agents.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { RACINE } from "./aide-medias.js";

const lire = (f) => fs.readFileSync(path.join(RACINE, "public", f), "utf8");

function chargerGuides() {
  const contexte = { echapper: (t) => String(t) };
  vm.createContext(contexte);
  vm.runInContext(lire("coherences-guides.js") + "\n;globalThis.__guides = { GUIDES_COHERENCE, ZONES_COHERENCE, rendreResumeCoherence };", contexte);
  return contexte.__guides;
}

test("les quatre cohérences ont un résumé et toutes leurs diapositives", () => {
  const { GUIDES_COHERENCE, ZONES_COHERENCE, rendreResumeCoherence } = chargerGuides();
  assert.deepEqual([...ZONES_COHERENCE], ["Habitation", "Garage", "Cayo Perico", "Roxwood"]);
  for (const zone of ZONES_COHERENCE) {
    const guide = GUIDES_COHERENCE[zone];
    assert.ok(guide.intro && guide.sections.length, `${zone} : contenu présent`);
    assert.ok(rendreResumeCoherence(zone).includes("guide-bloc"), `${zone} : résumé affichable`);
    for (let i = 1; i <= guide.nbSlides; i++) {
      const image = path.join(RACINE, "public", "img", "coherences", guide.slug, `slide-${String(i).padStart(2, "0")}.jpg`);
      assert.ok(fs.existsSync(image), `${zone} : diapositive ${i} manquante`);
    }
  }
});

test("la page publique et l'espace agents lisent le même fichier, sans copie du contenu", () => {
  for (const page of ["coherence.html", "admin.html"]) {
    const html = lire(page);
    assert.ok(html.includes('<script src="/coherences-guides.js"></script>'), `${page} charge coherences-guides.js`);
    assert.ok(!html.includes("GUIDES_COHERENCE = {"), `${page} ne recopie pas le contenu`);
  }
});

test("espace agents : les cohérences se consultent sur place, sans autre fenêtre ni document extérieur", () => {
  const html = lire("admin.html");
  const panneau = html.slice(html.indexOf('id="panneau-coherences"'), html.indexOf('id="panneau-rh"'));
  assert.ok(panneau.includes('id="coherences-diaporama"') && panneau.includes('id="coherences-sections"'));
  assert.ok(!/target="_blank"|docs\.google\.com/.test(panneau), "aucun lien sortant dans l'onglet");
  assert.match(html, /<button class="lien-onglet" data-onglet="coherences"/, "un onglet, pas un lien externe");
  assert.ok(!html.includes("lien-coherence-sheet"));
});
