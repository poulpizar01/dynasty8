// Client du stockage FBFA (src/fbfa-storage.js) contre une API simulée :
// réponses conformes, réponses inattendues, erreurs HTTP, délais, réseau,
// et absence du jeton dans les erreurs.
import test from "node:test";
import assert from "node:assert/strict";
import { creerClientFbfa, ErreurStockage, urlPubliqueValide, cleValide } from "../src/fbfa-storage.js";

const BASE = "https://storage.fbfa.fr";
const JETON = "fbfa_storage_SECRET_NE_DOIT_JAMAIS_FUIR";

function reponse(status, corps) {
  return new Response(typeof corps === "string" ? corps : JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
}

// Faux fetch : enregistre les appels et renvoie ce que `repondre` décide.
function fauxFetch(repondre) {
  const appels = [];
  const fn = async (url, options) => {
    appels.push({ url, options });
    return repondre(url, options);
  };
  fn.appels = appels;
  return fn;
}

async function attendErreur(promesse, code) {
  try {
    await promesse;
  } catch (e) {
    assert.ok(e instanceof ErreurStockage, `ErreurStockage attendue, reçu ${e && e.name}`);
    assert.equal(e.code, code);
    assert.ok(!String(e.message).includes(JETON) && !JSON.stringify(e).includes(JETON), "le jeton ne doit jamais apparaître dans l'erreur");
    return e;
  }
  assert.fail(`erreur « ${code} » attendue`);
}

test("envoi conforme : PUT sur la clé encodée, en-têtes, résultat vérifié", async () => {
  const fetch = fauxFetch(() => reponse(200, { id: "abc123", url: `${BASE}/view/abc123`, size: 3, mimeType: "image/jpeg" }));
  const client = creerClientFbfa({ token: JETON, fetchImpl: fetch });
  const r = await client.envoyer("dynasty8/biens/2026/09/x.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
  assert.deepEqual(r, { id: "abc123", url: `${BASE}/view/abc123`, taille: 3, mime: "image/jpeg" });
  const { url, options } = fetch.appels[0];
  assert.equal(url, `${BASE}/api/object/dynasty8/biens/2026/09/x.jpg`);
  assert.equal(options.method, "PUT");
  assert.equal(options.headers.Authorization, `Bearer ${JETON}`);
  assert.equal(options.headers["Content-Type"], "image/jpeg");
  assert.ok(options.signal, "un signal d'annulation (délai) doit être fourni");
});

test("réponses d'envoi inattendues refusées", async () => {
  const cas = [
    ["corps non JSON", reponse(200, "<html>ok</html>")],
    ["sans id", reponse(200, { url: `${BASE}/view/x`, size: 3 })],
    ["URL d'un autre domaine", reponse(200, { id: "x", url: "https://pirate.example/view/x", size: 3 })],
    ["URL en http", reponse(200, { id: "x", url: "http://storage.fbfa.fr/view/x", size: 3 })],
    ["URL d'un autre id", reponse(200, { id: "x", url: `${BASE}/view/y`, size: 3 })],
    ["URL avec paramètres", reponse(200, { id: "x", url: `${BASE}/view/x?token=1`, size: 3 })],
    ["taille différente", reponse(200, { id: "x", url: `${BASE}/view/x`, size: 99 })],
    ["tableau JSON", reponse(200, [])],
  ];
  for (const [nom, rep] of cas) {
    const client = creerClientFbfa({ token: JETON, fetchImpl: async () => rep.clone() });
    await attendErreur(client.envoyer("a/b.jpg", new Uint8Array([1, 2, 3]), "image/jpeg"), "reponse_invalide").catch((e) => {
      throw new Error(`${nom} : ${e.message}`);
    });
  }
});

test("erreurs HTTP traduites en codes internes (format d'erreur réel observé)", async () => {
  const cas = [
    [401, { error: { code: "no_token", message: "Missing Bearer token" } }, "auth"],
    [401, { error: { code: "malformed_token", message: "Malformed token" } }, "auth"],
    [403, "", "auth"],
    [413, "", "taille"],
    [507, "", "quota"],
    [400, { error: { code: "quota_exceeded", message: "…" } }, "quota"],
    [429, "", "limite"],
    [500, "erreur", "distant"],
    [503, "", "distant"],
    [400, { error: { code: "bad_request" } }, "requete"],
  ];
  for (const [status, corps, code] of cas) {
    const client = creerClientFbfa({ token: JETON, fetchImpl: async () => reponse(status, corps) });
    const e = await attendErreur(client.envoyer("a/b.jpg", new Uint8Array([1]), "image/jpeg"), code);
    assert.equal(e.status, status);
  }
});

test("délai maximal : un service qui ne répond pas est abandonné", async () => {
  const fetchBloque = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  const client = creerClientFbfa({ token: JETON, delaiMs: 50, fetchImpl: fetchBloque });
  const debut = Date.now();
  await attendErreur(client.envoyer("a/b.jpg", new Uint8Array([1]), "image/jpeg"), "delai");
  assert.ok(Date.now() - debut < 2000);
});

test("délai maximal : la lecture d'un corps de réponse bloqué est aussi abandonnée", async () => {
  const fetchCorpsBloque = (url, { signal }) => Promise.resolve({
    status: 200,
    ok: true,
    text: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  });
  const client = creerClientFbfa({ token: JETON, delaiMs: 50, fetchImpl: fetchCorpsBloque });
  await attendErreur(client.usage(), "delai");
});

test("service injoignable : erreur réseau sans détail sensible", async () => {
  const client = creerClientFbfa({ token: JETON, fetchImpl: async () => { throw new TypeError(`fetch failed Bearer ${JETON}`); } });
  await attendErreur(client.envoyer("a/b.jpg", new Uint8Array([1]), "image/jpeg"), "reseau");
});

test("configuration : jeton absent ou clé invalide refusés sans appel réseau", async () => {
  const fetch = fauxFetch(() => reponse(200, {}));
  await attendErreur(creerClientFbfa({ token: "", fetchImpl: fetch }).envoyer("a/b.jpg", new Uint8Array([1]), "image/jpeg"), "config");
  const client = creerClientFbfa({ token: JETON, fetchImpl: fetch });
  for (const cle of ["../x.jpg", "a//b.jpg", "a/./b", "", "a/b c.jpg", "a/%2e%2e/b"]) {
    await attendErreur(client.supprimer(cle), "config");
  }
  assert.equal(fetch.appels.length, 0);
  assert.equal(cleValide("dynasty8/biens/2026/09/3f1c-aa.jpg"), true);
  // Jeton jamais envoyé en clair : HTTP refusé hors machine locale.
  assert.throws(() => creerClientFbfa({ token: JETON, base: "http://storage.fbfa.fr" }), (e) => e.code === "config");
  assert.throws(() => creerClientFbfa({ token: JETON, base: "ftp://storage.fbfa.fr" }), (e) => e.code === "config");
  assert.equal(creerClientFbfa({ token: JETON, base: "http://127.0.0.1:8080" }).origine, "http://127.0.0.1:8080");
});

test("suppression par clé : 404 considéré comme déjà supprimé, 500 remonté", async () => {
  const f404 = fauxFetch(() => reponse(404, { error: { code: "not_found" } }));
  assert.deepEqual(await creerClientFbfa({ token: JETON, fetchImpl: f404 }).supprimer("a/b.jpg"), { supprime: true, dejaAbsent: true });
  assert.equal(f404.appels[0].options.method, "DELETE");
  assert.equal(f404.appels[0].url, `${BASE}/api/object/a/b.jpg`);
  await attendErreur(creerClientFbfa({ token: JETON, fetchImpl: async () => reponse(500, "") }).supprimer("a/b.jpg"), "distant");
});

test("liste et usage : structure vérifiée, champs non documentés renvoyés tels quels", async () => {
  const client = creerClientFbfa({
    token: JETON,
    fetchImpl: async (url) => url.includes("/api/objects")
      ? reponse(200, { items: [{ id: "1", url: `${BASE}/view/1` }], nextCursor: "c2" })
      : reponse(200, { champ_inconnu: 42 }),
  });
  assert.deepEqual(await client.lister({ prefix: "dynasty8/", limit: 5 }), { items: [{ id: "1", url: `${BASE}/view/1` }], nextCursor: "c2" });
  assert.deepEqual(await client.usage(), { champ_inconnu: 42 });
  const invalide = creerClientFbfa({ token: JETON, fetchImpl: async () => reponse(200, { items: "non" }) });
  await attendErreur(invalide.lister(), "reponse_invalide");
});

test("urlPubliqueValide : uniquement {base}/view/{id}", () => {
  assert.equal(urlPubliqueValide(`${BASE}/view/a1`, BASE, "a1"), true);
  assert.equal(urlPubliqueValide(`${BASE}/view/a1/extra`, BASE, "a1"), false);
  assert.equal(urlPubliqueValide(`${BASE}/api/object/a1`, BASE, "a1"), false);
  assert.equal(urlPubliqueValide(`https://user:mdp@storage.fbfa.fr/view/a1`, BASE, "a1"), false);
  assert.equal(urlPubliqueValide("javascript:alert(1)", BASE, "a1"), false);
});
