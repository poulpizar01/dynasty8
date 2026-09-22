// Choix du nom d'hôte public derrière nginx (src/entetes-proxy.js).
import test from "node:test";
import assert from "node:assert/strict";
import { choisirHote } from "../src/entetes-proxy.js";

test("X-Forwarded-Host est utilisé quand on fait confiance au proxy", () => {
  assert.equal(choisirHote({ host: "127.0.0.1:3010", xForwardedHost: "dynasty8.fbfa.fr", confiance: true }), "dynasty8.fbfa.fr");
  assert.equal(choisirHote({ host: "app:3000", xForwardedHost: "dynasty8.fbfa.fr:443", confiance: true }), "dynasty8.fbfa.fr:443");
});

test("chaîne de proxys : le premier hôte (celui du visiteur) est retenu", () => {
  assert.equal(choisirHote({ host: "app:3000", xForwardedHost: "dynasty8.fbfa.fr, interne.lan", confiance: true }), "dynasty8.fbfa.fr");
});

test("sans confiance au proxy, seul l'en-tête Host compte", () => {
  assert.equal(choisirHote({ host: "app:3000", xForwardedHost: "pirate.example", confiance: false }), "app:3000");
});

test("en-tête absent ou douteux : retour à Host, jamais recopié tel quel", () => {
  const host = "dynasty8.fbfa.fr";
  for (const douteux of ["", "   ", "pirate.example/chemin", "a b", "http://pirate.example", "pirate.example:99999999", "x".repeat(300)]) {
    assert.equal(choisirHote({ host, xForwardedHost: douteux, confiance: true }), host, JSON.stringify(douteux));
  }
  assert.equal(choisirHote({ host, xForwardedHost: undefined, confiance: true }), host);
  // Espaces autour de la valeur : usage normal dans une liste d'en-têtes.
  assert.equal(choisirHote({ host, xForwardedHost: " dynasty8.fbfa.fr ", confiance: true }), "dynasty8.fbfa.fr");
  // Espaces autour de la valeur : normal dans une liste d'en-têtes, la valeur reste valide.
  assert.equal(choisirHote({ host, xForwardedHost: " dynasty8.fbfa.fr ", confiance: true }), "dynasty8.fbfa.fr");
});
