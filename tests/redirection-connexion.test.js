// Retour après « Se connecter IG » (FolkOS) : ?next= ne peut renvoyer que vers
// une page du site, jamais vers un autre site (redirection ouverte).
import test from "node:test";
import assert from "node:assert/strict";
import { cheminDeRetour } from "../src/index.js";

test("?next= : les pages du site sont gardées", () => {
  assert.equal(cheminDeRetour("/admin.html"), "/admin.html");
  assert.equal(cheminDeRetour("/admin.html?onglet=rh#fiche"), "/admin.html?onglet=rh#fiche");
  assert.equal(cheminDeRetour("/habitation.html"), "/habitation.html");
});

test("?next= : tout ce qui pourrait mener ailleurs retombe sur l'espace agents", () => {
  const ANTISLASH = String.fromCharCode(92);
  const pieges = [
    "", null, undefined, "admin.html", "https://exemple.fr", "//exemple.fr",
    "/" + ANTISLASH + "exemple.fr", ANTISLASH + ANTISLASH + "exemple.fr", "/" + ANTISLASH + "/exemple.fr",
    "/ /exemple.fr", "/\t/exemple.fr", "/\n/exemple.fr", "javascript:alert(1)", "/%5Cexemple.fr/../..",
  ];
  for (const piege of pieges) {
    const cible = cheminDeRetour(piege);
    assert.ok(cible.startsWith("/") && !cible.startsWith("//") && !cible.includes(ANTISLASH), `${JSON.stringify(piege)} -> ${cible}`);
    assert.equal(new URL(cible, "https://dynasty8.test").origin, "https://dynasty8.test", JSON.stringify(piege));
  }
  assert.equal(cheminDeRetour("/" + ANTISLASH + "exemple.fr"), "/admin.html");
  assert.equal(cheminDeRetour("//exemple.fr"), "/admin.html");
});
