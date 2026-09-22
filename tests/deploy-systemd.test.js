// Déploiement systemd (deploy/systemd/deploy.sh) : les garde-fous sont joués
// dans un vrai Linux (conteneur Docker), seul endroit où « utilisateur
// inexistant », « fichier appartenant à root » ou « mode 600 » ont un sens.
// Ignoré si Docker n'est pas disponible sur la machine.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { RACINE } from "./aide-medias.js";

const executer = promisify(execFile);

function dockerDisponible() {
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "pipe" });
    return true;
  } catch (e) {
    return false;
  }
}

const ACTIF = dockerDisponible();

test("garde-fous du script de déploiement systemd (utilisateur, Node, .env, root)", { skip: ACTIF ? false : "Docker indisponible", timeout: 600_000 }, async () => {
  const { stdout } = await executer("docker", [
    "run", "--rm",
    "-v", `${RACINE}:/depot:ro`,
    "-v", `${path.join(RACINE, "tests/deploy-systemd.sh")}:/essai.sh:ro`,
    "node:22-bookworm", "bash", "/essai.sh",
  ], { env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 10 * 1024 * 1024 });

  // Le script d'essai s'arrête en erreur si un scénario échoue ; on vérifie
  // en plus le contenu de l'unité générée et l'absence de sudo.
  assert.match(stdout, /RESULTAT : \d+ réussis, 0 échoués/);
  assert.match(stdout, /^User=dev$/m, "le service doit tourner sous l'utilisateur demandé");
  assert.doesNotMatch(stdout, /^User=root$/m);
  assert.match(stdout, /^ExecStart=\/usr\/local\/bin\/node \/tmp\/app\/server\.js$/m, "chemin absolu du binaire Node");
  assert.match(stdout, /^EnvironmentFile=\/tmp\/app\/\.env$/m);
  assert.match(stdout, /^Environment=DB_SCHEMA_AUTO=0$/m, "le site ne doit pas créer son schéma au démarrage");
  assert.match(stdout, /^Restart=always$/m);
  assert.match(stdout, /appels reels a sudo \(hors commentaires\) : 0/);
});
