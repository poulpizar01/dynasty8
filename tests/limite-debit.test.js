// Limite de débit (src/limite-debit.js) : garde-fou contre l'emballement.
import test from "node:test";
import assert from "node:assert/strict";
import { consommer, adresseAppelant, reinitialiserLimites } from "../src/limite-debit.js";

test("la limite s'applique par clé, sur une fenêtre glissante", () => {
  reinitialiserLimites();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(consommer("ip:1.2.3.4", 3, 60_000, t0).autorise, true, `appel ${i + 1}`);
  }
  const refus = consommer("ip:1.2.3.4", 3, 60_000, t0);
  assert.equal(refus.autorise, false, "le 4e appel est refusé");
  assert.equal(refus.reessayerDansSecondes, 60);

  // Une autre clé n'est pas affectée.
  assert.equal(consommer("ip:5.6.7.8", 3, 60_000, t0).autorise, true);

  // La fenêtre glisse : les appels anciens ne comptent plus.
  assert.equal(consommer("ip:1.2.3.4", 3, 60_000, t0 + 60_001).autorise, true);
});

test("le décompte restant est exact", () => {
  reinitialiserLimites();
  const t0 = 2_000_000;
  assert.equal(consommer("a", 3, 1000, t0).restant, 2);
  assert.equal(consommer("a", 3, 1000, t0).restant, 1);
  assert.equal(consommer("a", 3, 1000, t0).restant, 0);
});

test("le délai d'attente diminue à mesure que la fenêtre avance", () => {
  reinitialiserLimites();
  const t0 = 3_000_000;
  consommer("b", 1, 10_000, t0);
  assert.equal(consommer("b", 1, 10_000, t0).reessayerDansSecondes, 10);
  assert.equal(consommer("b", 1, 10_000, t0 + 7_000).reessayerDansSecondes, 3);
});

test("adresse de l'appelant : dernier maillon de X-Forwarded-For (celui ajouté par nginx)", () => {
  const avec = (entetes) => adresseAppelant(new Request("https://exemple.fr", { headers: entetes }));
  // Le visiteur a envoyé « X-Forwarded-For: 1.2.3.4 » ; nginx a ajouté son adresse réelle.
  assert.equal(avec({ "X-Forwarded-For": "1.2.3.4, 203.0.113.7" }), "203.0.113.7");
  assert.equal(avec({ "X-Forwarded-For": "  203.0.113.7  " }), "203.0.113.7");
  assert.equal(avec({ "X-Forwarded-For": "203.0.113.7, " }), "203.0.113.7", "maillon vide ignoré");
  const r1 = avec({ "X-Forwarded-For": "10.0.0.1, 203.0.113.7" });
  const r2 = avec({ "X-Forwarded-For": "10.0.0.2, 203.0.113.7" });
  assert.equal(r1, r2, "changer la valeur envoyée ne change pas de compteur");
  assert.equal(avec({ "X-Real-IP": "203.0.113.9" }), "203.0.113.9");
  assert.equal(avec({}), "inconnue", "sans en-tête, tout le monde partage la même clé");
});
