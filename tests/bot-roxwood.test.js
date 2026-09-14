// Réception des webhooks du bot « Roxwood Network Entreprise »
// (src/bot-roxwood.js) : signature HMAC, validation, clé d'objet.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  lireSecretsRoxwood, verifierSignatureRoxwood, validerEvenementRoxwood, cleObjetRoxwood, empreinteCorps,
} from "../src/bot-roxwood.js";

const signer = (secret, corps) => createHmac("sha256", secret).update(corps).digest("hex");

test("lireSecretsRoxwood : liste vide sans variable, sinon découpage sur virgules/retours à la ligne", () => {
  assert.deepEqual(lireSecretsRoxwood({}), []);
  assert.deepEqual(lireSecretsRoxwood({ ROXWOOD_WEBHOOK_SECRETS: "" }), []);
  assert.deepEqual(lireSecretsRoxwood({ ROXWOOD_WEBHOOK_SECRETS: " a1 , b2\nc3;; " }), ["a1", "b2", "c3"]);
});

test("verifierSignatureRoxwood : accepte la bonne signature (n'importe quel secret de la liste), refuse le reste", () => {
  const corps = Buffer.from(JSON.stringify({ guildId: "1", eventType: "custom", payload: {} }));
  const secrets = ["secret-candidatures", "secret-absences"];
  assert.equal(verifierSignatureRoxwood(secrets, corps, signer("secret-absences", corps)), true);
  assert.equal(verifierSignatureRoxwood(secrets, corps, signer("secret-candidatures", corps).toUpperCase()), true);
  assert.equal(verifierSignatureRoxwood(secrets, corps, "sha256=" + signer("secret-candidatures", corps)), true);
  assert.equal(verifierSignatureRoxwood(secrets, corps, signer("autre", corps)), false);
  assert.equal(verifierSignatureRoxwood(secrets, Buffer.from(corps + " "), signer("secret-absences", corps)), false, "corps altéré");
  assert.equal(verifierSignatureRoxwood(secrets, corps, ""), false);
  assert.equal(verifierSignatureRoxwood(secrets, corps, "pas-du-hex"), false);
  assert.equal(verifierSignatureRoxwood([], corps, signer("secret-absences", corps)), false, "aucun secret configuré");
});

test("validerEvenementRoxwood : forme du corps envoyé par le bot", () => {
  const ok = validerEvenementRoxwood({ guildId: "123456789012345678", eventType: "absence.updated", payload: { requestId: "x" }, sentAt: "2026-09-12T10:00:00.000Z" });
  assert.equal(ok.erreur, undefined);
  assert.equal(ok.guildId, "123456789012345678");
  assert.equal(ok.sentAt, "2026-09-12T10:00:00.000Z");
  assert.match(validerEvenementRoxwood(null).erreur, /JSON/);
  assert.match(validerEvenementRoxwood({ eventType: "custom", payload: {} }).erreur, /guildId/);
  assert.match(validerEvenementRoxwood({ guildId: "123456", eventType: "pirate", payload: {} }).erreur, /eventType/);
  assert.match(validerEvenementRoxwood({ guildId: "123456", eventType: "custom" }).erreur, /payload/);
  assert.match(validerEvenementRoxwood({ guildId: "123456", eventType: "custom", payload: {}, sentAt: "hier" }).erreur, /sentAt/);
  assert.match(validerEvenementRoxwood({ guildId: "123456", eventType: "custom", payload: {} }, 10 * 1024 * 1024).erreur, /volumineux/);
});

test("cleObjetRoxwood : identifiant métier selon le type, null sinon", () => {
  assert.equal(cleObjetRoxwood("recruitment.updated", { ticketId: "t1" }), "t1");
  assert.equal(cleObjetRoxwood("absence.updated", { requestId: "r1" }), "r1");
  assert.equal(cleObjetRoxwood("order.updated", { orderId: "o1" }), "o1");
  assert.equal(cleObjetRoxwood("monitoring.duty", { playerDiscord: "1" }), null);
  assert.equal(cleObjetRoxwood("recruitment.updated", {}), null);
});

test("empreinteCorps : identique pour un renvoi identique, différente sinon", () => {
  const a = Buffer.from('{"a":1}');
  assert.equal(empreinteCorps(a), empreinteCorps(Buffer.from('{"a":1}')));
  assert.notEqual(empreinteCorps(a), empreinteCorps(Buffer.from('{"a":2}')));
  assert.match(empreinteCorps(a), /^[0-9a-f]{64}$/);
});
