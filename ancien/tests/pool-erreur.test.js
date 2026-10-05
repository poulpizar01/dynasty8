// Test ciblé : une erreur sur une connexion inactive du pool PostgreSQL ne
// doit jamais arrêter le processus, et le pool doit rester utilisable
// ensuite (nouvelle tentative acceptée, pas de crash).
import test from "node:test";
import assert from "node:assert/strict";
import { creerPool } from "../src/db-pg.js";

test("une erreur de connexion inactive sur le pool n'arrête pas le processus", async () => {
  const pool = creerPool("postgres://utilisateur:motdepasse@hote-inexistant:5432/db");

  let processusVivantApres = false;
  const gestionnaire = () => {
    processusVivantApres = true;
  };
  process.once("uncaughtException", gestionnaire);

  // Simule exactement ce que fait pg en interne quand une connexion inactive
  // du pool se coupe de façon inattendue (coupure réseau, maintenance...).
  pool.emit("error", new Error("connexion coupée (test)"));

  // Laisse la boucle d'événements tourner un instant : si l'erreur n'était
  // pas gérée, "uncaughtException" se déclencherait ici.
  await new Promise((r) => setTimeout(r, 50));
  process.removeListener("uncaughtException", gestionnaire);
  assert.equal(processusVivantApres, false, "le processus n'aurait pas dû lever d'exception non gérée");

  // Le pool doit rester utilisable : une nouvelle tentative de requête est
  // bien acceptée (elle échoue proprement car l'hôte n'existe pas — c'est
  // une erreur de requête normale, pas un crash du processus).
  await assert.rejects(() => pool.query("SELECT 1"));

  await pool.end();
});
