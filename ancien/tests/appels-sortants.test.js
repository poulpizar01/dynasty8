// Tout appel sortant doit être borné dans le temps : « fetch » n'a aucun délai
// par défaut, et un service qui accepte la connexion sans jamais répondre
// retiendrait la requête indéfiniment — en particulier sur le proxy de la
// carte, qui est public. Ce test relit les sources plutôt que d'exécuter les
// appels : il attrape l'oubli dès l'écriture d'un nouvel appel.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RACINE } from "./aide-medias.js";

const FICHIERS = ["src/index.js", "src/google-sheets.js", "src/fbfa-storage.js", "src/medias.js", "server.js"];

// Un vrai appel réseau : « fetch( » non précédé d'un point — ce qui écarte
// worker.fetch(), l'aiguillage interne — et jamais la définition de méthode
// « async fetch(request, env) » du worker lui-même.
const APPEL_RESEAU = /(^|[^.\w])fetch\(/;
const DEFINITION = /async fetch\(/;
const DELAI = /AbortSignal\.timeout|signal:/;

test("aucun appel sortant sans délai maximal", () => {
  const sansDelai = [];
  for (const relatif of FICHIERS) {
    const lignes = fs.readFileSync(path.join(RACINE, relatif), "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      if (!APPEL_RESEAU.test(ligne) || DEFINITION.test(ligne)) return;
      // Le délai est sur la même ligne, ou dans les options qui suivent.
      if (DELAI.test(lignes.slice(i, i + 10).join("\n"))) return;
      sansDelai.push(`${relatif}:${i + 1} — ${ligne.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(sansDelai, [], "appels sortants sans délai :\n" + sansDelai.join("\n"));
});
