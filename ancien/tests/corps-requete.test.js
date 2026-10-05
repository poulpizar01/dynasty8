// Lecture bornée du corps des requêtes (src/corps-requete.js, utilisé par
// server.js) : un corps trop gros est refusé AVANT d'être lu en entier.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { lireCorpsLimite, limiteCorpsPour, ErreurCorpsTropGros, LIMITE_API_PAR_DEFAUT } from "../src/corps-requete.js";

async function serveurDeTest(limite) {
  const constats = [];
  const serveur = http.createServer(async (req, res) => {
    try {
      const corps = await lireCorpsLimite(req, limite);
      constats.push({ lu: corps.length });
      res.writeHead(200).end(String(corps.length));
    } catch (e) {
      constats.push({ erreur: e instanceof ErreurCorpsTropGros });
      res.writeHead(413, { Connection: "close" }).end("trop gros");
    }
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  return { serveur, constats, port: serveur.address().port };
}

function envoyer(port, { octets, chunked }) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/", headers: chunked ? { "Transfer-Encoding": "chunked" } : { "Content-Length": octets.length } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve("connexion fermée"));
    if (chunked) {
      // Envoie par petits morceaux : le serveur doit s'arrêter dès la limite franchie.
      let envoye = 0;
      const pas = 1024;
      const suite = () => {
        while (envoye < octets.length) {
          const ok = req.write(octets.subarray(envoye, envoye + pas));
          envoye += pas;
          if (!ok) return req.once("drain", suite);
        }
        req.end();
      };
      suite();
    } else {
      req.end(octets);
    }
  });
}

test("corps sous la limite : lu entièrement", async () => {
  const { serveur, constats, port } = await serveurDeTest(10_000);
  assert.equal(await envoyer(port, { octets: Buffer.alloc(9_000) }), 200);
  assert.deepEqual(constats, [{ lu: 9_000 }]);
  serveur.close();
});

test("Content-Length au-delà de la limite : refus immédiat", async () => {
  const { serveur, constats, port } = await serveurDeTest(10_000);
  const statut = await envoyer(port, { octets: Buffer.alloc(50_000) });
  assert.ok(statut === 413 || statut === "connexion fermée");
  assert.deepEqual(constats, [{ erreur: true }]);
  serveur.close();
});

test("corps « chunked » sans longueur annoncée : arrêt dès la limite franchie", async () => {
  const { serveur, constats, port } = await serveurDeTest(10_000);
  const statut = await envoyer(port, { octets: Buffer.alloc(200_000), chunked: true });
  assert.ok(statut === 413 || statut === "connexion fermée");
  assert.deepEqual(constats, [{ erreur: true }]);
  serveur.close();
});

test("limites par route : photos bornées par FBFA_PHOTO_TAILLE_MAX, reste de l'API par défaut", () => {
  const photo = limiteCorpsPour("/api/biens/photo", { FBFA_PHOTO_TAILLE_MAX: String(1024 * 1024) });
  assert.ok(photo > 1024 * 1024 && photo < 2 * 1024 * 1024);
  assert.equal(limiteCorpsPour("/api/profil/photo", {}), limiteCorpsPour("/api/biens/photo", {}));
  assert.equal(limiteCorpsPour("/api/biens", {}), LIMITE_API_PAR_DEFAUT);
  assert.equal(limiteCorpsPour("/api/biens", { API_TAILLE_CORPS_MAX: "1000" }), 1000);
});
